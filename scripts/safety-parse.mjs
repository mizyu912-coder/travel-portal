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

// 国別ページから危険情報の部分を取り出す
export function parseCountryPage(html) {
  const lines = htmlToLines(html).map(toHalf);
  const noDanger = lines.some(l => l.includes('現在、危険情報は出ておりません'));
  const noInfection = lines.some(l => l.includes('現在、感染症危険情報は出ておりません'));
  const start = lines.findIndex(l => /危険情報/.test(l) && !/感染症/.test(l) && /レベル|危険情報$|【危険情報】/.test(l));
  let block = [];
  if (start >= 0) {
    for (let i = start; i < Math.min(lines.length, start + 40); i++) {
      if (i > start && /感染症危険情報|スポット情報|広域情報/.test(lines[i])) break;
      block.push(lines[i]);
    }
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

