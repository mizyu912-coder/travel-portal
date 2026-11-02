// Wikimedia Commons から、各国のイメージ写真を集めて data/images/<国ID>.json に保存する。
// ・Commons が選んだ「秀逸な画像」「高品質な画像」「価値ある画像」だけを使う（人が撮影した写真）
// ・AI生成やCGのカテゴリが付いた画像は除外する
// ・ライセンスは CC0／パブリックドメイン／CC BY／CC BY-SA のみ（表示用に作者とライセンスを記録する）
// 既に画像がある国はそのまま。足りない国だけを探す。
import { readJSON, writeJSON, today } from './lib.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'travel-portal/1.0 (https://github.com/mizyu912-coder/travel-portal)';
// 最後の '' は品質カテゴリなしの検索（上の3つで見つからない小さな地域向け。AI・CGの除外は同じく行う）
const CATEGORIES = ['Featured_pictures_on_Wikimedia_Commons', 'Quality_images', 'Valued_images_sorted_by_promotion_date', ''];
const BAD_CATEGORY = /AI-generated|AI generated|Computer-generated|CGI|Midjourney|Stable Diffusion|DALL|Renderings/i;
const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? \d(\.\d)?)/i;
const PER_COUNTRY = 3;
const only = process.argv.slice(2);
const strip = s => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function search(query, category) {
  const url = new URL(API);
  Object.entries({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '20',
    gsrsearch: `${query}${category ? ` incategory:${category}` : ''} filetype:bitmap`,
    prop: 'imageinfo|categories', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600', cllimit: 'max',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons: HTTP ${res.status}`);
  const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
  return pages.map(pg => {
    const ii = pg.imageinfo?.[0]; if (!ii) return null;
    const m = ii.extmetadata ?? {};
    return {
      file: pg.title, mime: ii.mime, width: ii.width, height: ii.height,
      thumb: ii.thumburl, page: ii.descriptionurl,
      artist: strip(m.Artist?.value) || '不明', license: strip(m.LicenseShortName?.value), licenseUrl: m.LicenseUrl?.value ?? '',
      description: strip(m.ImageDescription?.value).slice(0, 120),
      cats: (pg.categories ?? []).map(c => c.title).join(' '),
    };
  }).filter(Boolean);
}

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// 検索語（地名）がひと続きのままファイル名に入っている写真だけを使う
const words = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
const matches = (i, q) => ` ${words(i.file)} `.includes(` ${words(q)} `);
const usable = i => i.mime === 'image/jpeg' && i.width >= 1600 && i.width > i.height * 1.2
  && OK_LICENSE.test(i.license) && !BAD_CATEGORY.test(i.cats) && !BAD_CATEGORY.test(i.description);

for (const c of readJSON('data/countries.json')) {
  if (only.length && !only.includes(c.id)) continue;
  const file = `data/images/${c.id}.json`;
  const have = readJSON(file, []);
  if (have.length >= PER_COUNTRY) continue;
  const picked = [...have];
  for (const q of c.imageQueries ?? []) {
    if (picked.length >= PER_COUNTRY) break;
    if (picked.some(p => p.query === q)) continue;
    let found = null;
    for (const cat of CATEGORIES) {
      try { found = (await search(q, cat)).find(i => usable(i) && matches(i, q) && !picked.some(p => p.file === i.file)); }
      catch (e) { console.warn(`${c.name}「${q}」：${e.message}`); }
      if (found) break;
    }
    if (found) {
      const { cats, mime, ...img } = found;
      picked.push({ ...img, query: q, addedAt: today() });
    } else console.warn(`${c.name}「${q}」：条件に合う写真が見つかりませんでした`);
  }
  writeJSON(file, picked);
  console.log(`${c.name}: 写真 ${picked.length} 枚`);
}
