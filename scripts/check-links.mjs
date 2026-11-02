// data/blogs/*.json のリンクを確認し、ページのタイトルとサイト名、リンク切れの状態を data/links.json に保存する。
// 2回続けて開けなかったリンクはサイトに表示しない。
import fs from 'node:fs';
import { readJSON, writeJSON, today, p } from './lib.mjs';

const links = readJSON('data/links.json', {});
const files = fs.readdirSync(p('data/blogs')).filter(f => f.endsWith('.json'));
const urls = [...new Set(files.flatMap(f => readJSON(`data/blogs/${f}`, []).map(b => b.url)))];

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const meta = (html, prop) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)`, 'i'))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))?.[1];

let broken = 0;
for (const url of urls) {
  const prev = links[url] ?? { fails: 0 };
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (travel-portal link check)', 'Accept-Language': 'ja' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const title = decode(meta(html, 'og:title') ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    const site = decode(meta(html, 'og:site_name') ?? '');
    links[url] = { ok: true, fails: 0, title, site, checkedAt: today() };
  } catch (e) {
    links[url] = { ...prev, ok: false, fails: (prev.fails ?? 0) + 1, error: e.message, checkedAt: today() };
    broken++;
    console.warn(`開けませんでした：${url}（${e.message}）`);
  }
}
for (const u of Object.keys(links)) if (!urls.includes(u)) delete links[u];
writeJSON('data/links.json', links);
console.log(`リンク ${urls.length} 件を確認（開けなかったもの ${broken} 件）`);
