// YouTube Data API v3 で国ごとの旅行動画の候補を集め、data/videos/<国ID>.json に保存する。
// 必要な環境変数：YOUTUBE_API_KEY
// 使い方：node scripts/collect-videos.mjs            （全ての国）
//         node scripts/collect-videos.mjs korea taiwan（指定した国だけ）
import { readJSON, writeJSON, today, loadPlaces } from './lib.mjs';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error('YOUTUBE_API_KEY が設定されていません。'); process.exit(1); }
const API = 'https://www.googleapis.com/youtube/v3';
const cfg = readJSON('data/config.json').videos;
const countries = loadPlaces();
const only = process.argv.slice(2);

async function api(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`${path}: HTTP ${res.status} ${body.slice(0, 300)}`);
    err.quota = res.status === 429 || /quota|rateLimitExceeded/i.test(body);
    throw err;
  }
  return res.json();
}
// "PT1H2M3S" → 秒
const isoSec = d => { const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
const hasJa = s => /[぀-ヿ]/.test(s);

function score(v) {
  const ageYears = (Date.now() - new Date(v.publishedAt)) / (365 * 864e5);
  const likeRate = v.views ? v.likes / v.views : 0;
  // 再生数（対数）＋いいね率＋新しさ
  return +(Math.log10(Math.max(v.views, 1)) + Math.min(likeRate, 0.04) * 25 + Math.max(0, 1 - ageYears / cfg.maxAgeYears)).toFixed(3);
}

const publishedAfter = new Date(Date.now() - cfg.maxAgeYears * 365 * 864e5).toISOString();

// YouTube の検索は1日100回まで。1回の実行で使う検索回数を SEARCH_BUDGET（既定85）までにし、
// 最後に検索した日が古い国・都市から順に検索する（6日以内に検索済みのところは、再生数などの更新だけ）。
// 毎日実行すれば、国・都市が増えても1週間ほどで全体を回れる。
const BUDGET = Number(process.env.SEARCH_BUDGET || 85);
const MIN_DAYS = 6;
let budget = BUDGET;
const lastSearched = c => readJSON(`data/videos/${c.id}.json`, {}).searchedAt ?? '';
// 動画が1本もない国・都市（新しく追加したところなど）を最優先にする
const sortKey = c => { const v = readJSON(`data/videos/${c.id}.json`, {}); return (v.items ?? []).length ? (v.searchedAt ?? '0') : ''; };
// 外務省チェックで非公開になっている国（とその都市）は、検索枠を使わない
const safety = readJSON('data/safety.json', { countries: {} });
const hiddenBySafety = c => { const id = c.kind === 'city' ? c.country : c.id; return safety.countries[id]?.status === 'hidden'; };
const targets = countries.filter(c => !only.length || only.includes(c.id))
  .filter(c => only.length || !hiddenBySafety(c))
  .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

let quotaHit = false;
let searchQuotaHit = false;
for (const c of targets) {
  const last = lastSearched(c);
  const fresh = last && (Date.now() - new Date(last)) / 864e5 < MIN_DAYS;
  const doSearch = only.length > 0 || (!fresh && budget >= c.videoQueries.length);
  if (doSearch) budget -= c.videoQueries.length;
  try { await collect(c, doSearch); }
  catch (e) {
    if (!e.quota) throw e;
    // 1日の上限に達したら、残りの国は次回に回す（集めた分は保存済み）
    console.warn(`YouTube API の1日の上限に達したため、${c.name}以降は次回に収集します。`);
    quotaHit = true;
    break;
  }
}
if (quotaHit) process.exitCode = 0;
console.log(`今回の検索：${BUDGET - budget} 回（上限 ${BUDGET} 回）`);

async function collect(c, doSearch = true) {
  const file = `data/videos/${c.id}.json`;
  const store = readJSON(file, { items: [] });
  const known = new Map(store.items.map(i => [i.id, i]));

  const ids = new Set();
  let searchError = null;
  let searched = false;
  if (doSearch && !searchQuotaHit) {
    try {
      for (const q of c.videoQueries) {
        const r = await api('search', { part: 'id', q, type: 'video', maxResults: 50, regionCode: 'JP', relevanceLanguage: 'ja', publishedAfter, safeSearch: 'strict' });
        r.items.forEach(i => ids.add(i.id.videoId));
      }
      searched = true;
    } catch (e) {
      if (!e.quota) throw e;
      // 検索の上限に達しても、既に集めた動画の再生数などの更新は続ける
      searchQuotaHit = true; searchError = e;
      console.warn(`YouTube の検索が1日の上限に達しました。${c.name}以降は新しい動画を探さず、既存の動画の情報だけ更新します。`);
    }
  }
  known.forEach((_, id) => ids.add(id)); // 既存の動画も統計を更新する

  const all = [...ids];
  for (let i = 0; i < all.length; i += 50) {
    const r = await api('videos', { part: 'snippet,statistics,contentDetails,status', id: all.slice(i, i + 50).join(',') });
    for (const v of r.items) {
      const item = {
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        channelId: v.snippet.channelId,
        publishedAt: v.snippet.publishedAt,
        durationSec: isoSec(v.contentDetails.duration),
        views: +(v.statistics.viewCount ?? 0),
        likes: +(v.statistics.likeCount ?? 0),
        embeddable: v.status.embeddable !== false,
        thumbnail: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url,
        // 概要文をAIで作るときの材料（サイトには表示しない）
        description: (v.snippet.description ?? '').slice(0, 600),
        tags: (v.snippet.tags ?? []).slice(0, 10),
      };
      item.score = score(item);
      const old = known.get(v.id);
      // 人が付けた状態（approved / blocked）と概要は残す
      known.set(v.id, { ...item, status: old?.status ?? 'candidate', summary: old?.summary ?? '' });
    }
  }

  // 条件に合わない候補は落とす（人が承認した動画は残す）
  const items = [...known.values()].filter(v => {
    if (v.status === 'approved' || v.status === 'blocked') return true;
    const min = v.durationSec / 60;
    return v.views >= cfg.minViews && min >= cfg.minDurationMin && min <= cfg.maxDurationMin
      && (!cfg.japaneseOnly || hasJa(v.title));
  }).sort((a, b) => b.score - a.score);

  writeJSON(file, { updatedAt: today(), searchedAt: searched ? today() : store.searchedAt, items });
  console.log(`${c.name}: 候補 ${items.length} 本${searched ? '（検索して更新）' : '（再生数などだけ更新）'}`);
}
