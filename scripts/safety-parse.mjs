import { htmlToLines, toHalf } from './lib.mjs';

export const NATIONWIDE = /全土|全域|上記以外|その他の地域/;

// 危険情報一覧ページから、レベルが出ている国・地域名（リンク文字列）の集合を作る
export function parseKikenList(html) {
  const names = new Set();
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim();
    if (t && t.length <= 20) names.add(t);
  }
  return names;
}

// 国別ページから危険情報の部分を取り出す。
// ページ内の <h4 class="danger">危険情報</h4> から次の <h4> 見出しまでを危険情報とみなす。
export function parseCountryPage(html) {
  const lines = htmlToLines(html).map(toHalf);
  const noDanger = lines.some(l => l.includes('現在、危険情報は出ておりません'));
  const noInfection = lines.some(l => l.includes('現在、感染症危険情報は出ておりません'));
  let block = [];
  const i = html.search(/<h4[^>]*class="[^"]*danger[^"]*"/i);
  if (i >= 0) {
    const rest = html.slice(i);
    const j = rest.slice(4).search(/<h4[\s>]/i);
    block = htmlToLines(j >= 0 ? rest.slice(0, j + 4) : rest.slice(0, 20000)).map(toHalf);
  }
  const levels = [...block.join('\n').matchAll(/レベル\s*([1-4])/g)].map(m => Number(m[1]));
  return { noDanger, noInfection, block, maxLevel: levels.length ? Math.max(...levels) : null };
}

export function infectionCountries(html, countries) {
  const lines = htmlToLines(html).map(toHalf);
  const hits = new Set();
  lines.forEach((l, i) => {
    if (!/感染症危険情報[（(]レベル/.test(l) || /解除|終息/.test(l)) return;
    const near = lines.slice(Math.max(0, i - 2), i + 1).join(' ');
    for (const c of countries) if (c.safety.mofaNames.some(n => near.includes(n))) hits.add(c.id);
  });
  return hits;
}

