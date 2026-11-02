// 外務省「海外安全ホームページ」を確認し、各国の掲載可否を data/safety.json に書き出す。
// 判定ルール（2026-11-01 決定）：主な観光地が危険レベル0なら掲載する。感染症危険情報が出ていれば掲載しない。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readJSON, writeJSON, today, setOutput, p } from './lib.mjs';
import { parseKikenList, parseCountryPage, infectionCountries, NATIONWIDE } from './safety-parse.mjs';

const KIKEN_LIST = 'https://www.anzen.mofa.go.jp/kiken_list.html';
const INFECTION_LIST = 'https://www.anzen.mofa.go.jp/info/search/pcinfectioninfo.html';
const countryUrl = code => `https://www.anzen.mofa.go.jp/info/pcinfectionspothazardinfo_${code}.html`;

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'travel-portal-safety-check/1.0' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const countries = readJSON('data/countries.json');
const prev = readJSON('data/safety.json', { countries: {} });
const overrides = readJSON('data/overrides.json', {});
const result = { checkedAt: today(), source: 'auto', countries: {} };
const report = [];
let changed = false;

const kikenHtml = await get(KIKEN_LIST);
const listed = parseKikenList(kikenHtml);
// 取得ミスで全部「レベル0」と誤判定しないための安全装置
if (!['シリア', 'イラン', 'アフガニスタン'].some(n => listed.has(n))) {
  console.error('危険情報一覧の読み取りに失敗しました。ページの構成が変わった可能性があります。判定は更新しません。');
  process.exit(1);
}
let infected = new Set();
try { infected = infectionCountries(await get(INFECTION_LIST), countries); }
catch (e) { report.push(`- ⚠️ 感染症危険情報の一覧を取得できませんでした（${e.message}）`); }

for (const c of countries) {
  const before = prev.countries?.[c.id] ?? {};
  // 国内（日本）は外務省の危険情報の対象外
  if (c.domestic) { result.countries[c.id] = { status: 'ok', domestic: true, listed: false, reasons: ['国内のため対象外'] }; continue; }
  const isListed = c.safety.mofaNames.some(n => listed.has(n));
  let r = { status: 'ok', listed: isListed, infection: infected.has(c.id), reasons: [], hash: null, maxLevel: 0 };

  if (isListed) {
    if (!c.safety.mofaCode) {
      r.status = 'hidden';
      r.reasons.push('危険情報一覧に載ったが、国別ページの番号（mofaCode）が未設定のため自動で非公開');
    } else {
      try {
        const html = await get(countryUrl(c.safety.mofaCode));
        const page = parseCountryPage(html);
        r.hash = sha(page.block.join('\n'));
        r.maxLevel = page.maxLevel ?? 0;
        r.mofaUrl = countryUrl(c.safety.mofaCode);
        if (!page.noInfection && !page.noDanger) r.infection = r.infection || /感染症危険情報[（(]レベル/.test(html);
        if (page.noDanger) {
          r.reasons.push('国別ページでは危険情報なし');
        } else if (!page.block.length || page.maxLevel === null) {
          r.status = 'hidden';
          r.reasons.push('国別ページから危険情報を読み取れなかったため自動で非公開');
        } else {
          const text = page.block.join('\n');
          const areaHits = c.safety.touristAreas.filter(a => text.includes(a));
          if (NATIONWIDE.test(text)) { r.status = 'hidden'; r.reasons.push('全土または「上記以外の地域」にレベルが出ている'); }
          if (areaHits.length) { r.status = 'hidden'; r.reasons.push(`主な観光地（${areaHits.join('、')}）が危険情報に含まれている`); }
          if (r.status === 'ok') r.reasons.push(`一部地域のみにレベル${r.maxLevel}まで。主な観光地は含まれていない`);
          r.dangerText = page.block.slice(0, 15);
        }
      } catch (e) {
        r = { ...before, error: e.message };
        r.reasons = [...(before.reasons ?? []), `国別ページの取得に失敗したため前回の判定を維持（${e.message}）`];
      }
    }
  } else {
    r.reasons.push('危険情報なし');
  }
  if (r.infection) { r.status = 'hidden'; r.reasons.push('感染症危険情報が出ている'); }

  // 人が確認して「掲載してよい／止める」と決めた場合の上書き（危険情報の内容が変わると無効になる）
  const ov = overrides[c.id];
  if (ov && (!ov.hash || ov.hash === r.hash)) { r.status = ov.status; r.reasons.push(`手動で上書き：${ov.note ?? ''}`); }

  if (before.status !== r.status || (before.hash && r.hash && before.hash !== r.hash) || before.listed !== r.listed) {
    changed = true;
    report.push(`- **${c.name}**：${before.status ?? '（なし）'} → **${r.status}**（${r.reasons.join('／')}）${r.mofaUrl ? ` [外務省](${r.mofaUrl})` : ''}`);
  }
  result.countries[c.id] = r;
}

writeJSON('data/safety.json', result);
const md = changed
  ? `## 危険情報の変化（${today()}）\n\n${report.join('\n')}\n\n非公開の判定が誤りなら data/overrides.json で上書きできます（README参照）。\n`
  : '';
fs.writeFileSync(p('safety-report.md'), md);
setOutput('changed', changed ? 'true' : 'false');
console.log(changed ? md : '危険情報に変化はありません。');
