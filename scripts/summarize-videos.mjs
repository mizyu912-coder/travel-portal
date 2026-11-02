// GitHub Models（無料枠）で、動画の概要文を作る。
// 新しく入った動画のうち、表示候補で概要がまだ無いものだけを対象にする。
// 必要な環境変数：GITHUB_TOKEN（GitHub Actions では自動で使える。ワークフローに models: read の権限が必要）
import fs from 'node:fs';
import { readJSON, writeJSON, p } from './lib.mjs';

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN がありません。'); process.exit(1); }
const ENDPOINT = process.env.SUMMARY_ENDPOINT || 'https://models.github.ai/inference/chat/completions';
const MODEL = process.env.SUMMARY_MODEL || 'openai/gpt-4o-mini';
const BATCH = 8;
const ONLY = process.argv.slice(2);
const cfg = readJSON('data/config.json').videos;
const countries = readJSON('data/countries.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SYSTEM = `あなたは旅行情報サイトの編集者です。YouTubeの旅行動画のタイトルと説明文を読み、旅行の予習をしたい人に向けて、その動画で何が見られるかを紹介する概要文を書きます。
ルール：
- 1本につき2文、全体で60〜90文字の日本語。です・ます調。
- 説明文の文章をそのまま写さず、自分の言葉で書く。
- タイトルと説明文から読み取れることだけを書く。分からないことは推測で足さない。
- 絵文字、ハッシュタグ、URL、チャンネルの宣伝は入れない。
- 出力は {"summaries":[{"id":"動画ID","summary":"概要文"}]} のJSONだけ。`;

async function summarize(country, videos) {
  const input = videos.map(v => ({ id: v.id, title: v.title, channel: v.channel, durationMin: Math.round(v.durationSec / 60), description: (v.description ?? '').replace(/https?:\/\/\S+/g, '').slice(0, 500) }));
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `国・地域：${country.name}\n動画：\n${JSON.stringify(input, null, 1)}` }],
    }),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    err.limit = res.status === 429;
    throw err;
  }
  const raw = await res.text();
  let json;
  try { json = JSON.parse(raw); }
  catch { throw new Error(`AIの返答がJSONではありません（${res.status} ${res.headers.get('content-type')}）：${raw.slice(0, 300)}`); }
  const content = json.choices?.[0]?.message?.content ?? '';
  // JSON の前後に文章が付いて返ってくることがあるので、{ ... } の部分だけを取り出す
  const m = content.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : content).summaries ?? []; }
  catch { throw new Error(`AIの返答を読めませんでした：${content.slice(0, 200)}`); }
}

let made = 0, stop = false;
for (const c of countries) {
  if (stop) break;
  if (ONLY.length && !ONLY.includes(c.id)) continue;
  const file = `data/videos/${c.id}.json`;
  if (!fs.existsSync(p(file))) continue;
  const store = readJSON(file);
  // サイトに表示される可能性がある上位の動画だけを対象にする
  const targets = store.items.filter(v => v.status !== 'blocked').sort((a, b) => b.score - a.score)
    .slice(0, cfg.max + 6).filter(v => !v.summary);
  for (let i = 0; i < targets.length && !stop; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    try {
      const out = await summarize(c, batch);
      for (const o of out) {
        const v = store.items.find(x => x.id === o.id);
        if (v && typeof o.summary === 'string' && o.summary.trim()) { v.summary = o.summary.trim(); v.summarySource = 'ai'; made++; }
      }
      writeJSON(file, store);
    } catch (e) {
      console.warn(`${c.name}: 概要文を作れませんでした（${e.message}）`);
      if (e.limit) { console.warn('GitHub Models の利用上限に達したため、残りは次回に作ります。'); stop = true; }
    }
    await sleep(5000); // 1分あたりの回数制限に合わせる
  }
}
console.log(`概要文を ${made} 本作りました。`);
