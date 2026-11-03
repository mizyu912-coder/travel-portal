// data/ の内容から静的サイトを dist/ に生成する。
// node scripts/build.mjs          本番用
// node scripts/build.mjs --demo   動画データが無い国にサンプル表示を入れる（見た目の確認用）
import fs from 'node:fs';
import crypto from 'node:crypto';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { readJSON, p, today } from './lib.mjs';

const DEMO = process.argv.includes('--demo');
const cfg = readJSON('data/config.json');
const regions = readJSON('data/regions.json');
const countries = readJSON('data/countries.json');
const cities = readJSON('data/cities.json', []);
// ASP からもらった広告コード（pages: "all" か、国・都市IDの配列）
const affiliates = readJSON('data/affiliates.json', []);
const safety = readJSON('data/safety.json', { countries: {} });
const links = readJSON('data/links.json', {});
// 掲載中の国は細かい地図（50m）、それ以外は軽い地図（110m）で描いて、ページを軽くする
const world = JSON.parse(fs.readFileSync(p('node_modules/world-atlas/countries-50m.json'), 'utf8'));
const worldLite = JSON.parse(fs.readFileSync(p('node_modules/world-atlas/countries-110m.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 海外は外務省チェックで ok と判定されるまで公開しない（新しく追加した国は、次の確認で判定される）
const safeOk = c => !!c.domestic || safety.countries[c.id]?.status === 'ok';
// 新しく追加した国・都市は、動画が MIN_VIDEOS 本以上そろうまで「準備中」にして公開しない
const MIN_VIDEOS = 3;
const hasVideos = x => (readJSON(`data/videos/${x.id}.json`, {}).items ?? []).length >= MIN_VIDEOS;
const isPublished = c => safeOk(c) && hasVideos(c);
const countryOf = city => countries.find(c => c.id === city.country);
// 都市は親の国が安全基準を満たしているときだけ公開する
const cityPublished = city => { const c = countryOf(city); return !!c && safeOk(c) && hasVideos(city); };
const pendingNotice = name => `<article class="country"><h1>${esc(name)}</h1><div class="notice">このページは準備中です。旅行vlogが集まりしだい公開します。</div></article>`;
const fmtDur = s => `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
const fmtViews = n => n >= 1e8 ? `${(n / 1e8).toFixed(1)}億回` : n >= 1e4 ? `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1)}万回` : `${n.toLocaleString('ja-JP')}回`;

fs.rmSync(p('dist'), { recursive: true, force: true });
fs.mkdirSync(p('dist/countries'), { recursive: true });
fs.mkdirSync(p('dist/cities'), { recursive: true });
fs.copyFileSync(p('src/style.css'), p('dist/style.css'));
// ブラウザに古いCSS・JSが残らないよう、中身が変わるたびに ?v= を変える
const ver = file => crypto.createHash('sha1').update(fs.readFileSync(p(file))).digest('hex').slice(0, 8);
const V = { css: ver('src/style.css'), map: ver('src/map.js'), home: ver('src/home.js') };
fs.copyFileSync(p('src/map.js'), p('dist/map.js'));
fs.copyFileSync(p('src/home.js'), p('dist/home.js'));
for (const f of ['favicon.svg', 'og.png']) if (fs.existsSync(p(`src/${f}`))) fs.copyFileSync(p(`src/${f}`), p(`dist/${f}`));

const LOGO = `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="6" width="28" height="20" rx="3" fill="currentColor"/><path d="M13 11.5v9l8-4.5z" fill="var(--cut)"/><g fill="var(--cut)"><rect x="4.5" y="8" width="2" height="2" rx=".5"/><rect x="4.5" y="22" width="2" height="2" rx=".5"/><rect x="25.5" y="8" width="2" height="2" rx=".5"/><rect x="25.5" y="22" width="2" height="2" rx=".5"/></g></svg>`;
// サイトマップに載せるページ（path はサイトのルートからの相対パス）
const sitemap = [];
const BASE = (cfg.baseUrl || '').replace(/\/$/, '');
const abs = path => `${BASE}/${path === 'index.html' ? '' : path}`;
const layout = ({ title, desc, body, depth = 0, cls = '', path, image, jsonld, noindex = false }) => {
  const r = '../'.repeat(depth);
  if (path && !noindex) sitemap.push(path);
  const ogImage = image || `${BASE}/og.png`;
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}${path && BASE ? `<link rel="canonical" href="${esc(abs(path))}">` : ''}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="${path === 'index.html' ? 'website' : 'article'}">
<meta property="og:site_name" content="${esc(cfg.siteName)}"><meta property="og:locale" content="ja_JP">${path && BASE ? `<meta property="og:url" content="${esc(abs(path))}">` : ''}
<meta property="og:image" content="${esc(ogImage)}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${r}favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#14161f">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${r}style.css?v=${V.css}"></head>
<body class="${cls}"><header class="site"><div class="bar">
<a href="${r}index.html" class="logo">${LOGO}<span class="logo-text"><span class="logo-en">${esc(cfg.siteNameEn)}</span><span class="logo-ja">${esc(cfg.siteName)}</span></span></a>
<nav class="gnav"><a href="${r}index.html#map-section">エリアから探す</a><a href="${r}index.html#lineup">国・地域の一覧</a></nav>
</div></header>
<main>${body}</main>
<footer class="site"><div class="bar">
<div class="foot-brand">${LOGO}<span><strong>${esc(cfg.siteNameEn)}</strong><br>${esc(cfg.siteName)}｜${esc(cfg.tagline)}</span></div>
<p>安全情報の出典：<a href="https://www.anzen.mofa.go.jp/" target="_blank" rel="noopener">外務省 海外安全ホームページ</a>（最終確認 ${esc(safety.checkedAt)}）。動画とブログの著作権は各制作者に、写真の著作権は各撮影者に帰属します。掲載の停止をご希望の方はお問い合わせください。</p>
<p class="ad-note">当サイトは、アフィリエイト広告などの広告を掲載することがあります。</p>
<nav class="foot-nav"><a href="${r}about.html">サイトについて</a><a href="${r}privacy.html">プライバシーポリシー</a><a href="${r}privacy.html#ads">広告について</a><a href="${r}contact.html">お問い合わせ</a></nav>
<p class="copy">© ${new Date().getFullYear()} ${esc(cfg.siteNameEn)}</p>
</div></footer>
</body></html>`;
};

// Commons の写真を小さいサイズで読み込む
// Wikimedia は決まったサイズ（250・330・500・960・1280・1920px など）以外のサムネイルを返さないことがある
const smallThumb = (url, w) => url?.replace(/\/\d+px-/, `/${w}px-`);
const firstImage = c => readJSON(`data/images/${c.id}.json`, []).find(i => !i.hidden);

// ---------- 世界地図 ----------
// 日本を中心にしたメルカトル図法（東経150度が中央）。北緯74度〜南緯50度を表示する
const W = 960, TOP_LAT = 74, BOTTOM_LAT = -50;
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const SCALE = W / (2 * Math.PI);
const proj = geoMercator().rotate([-150, 0]).scale(SCALE).translate([W / 2, SCALE * mercY(TOP_LAT)]);
const H = Math.round(SCALE * (mercY(TOP_LAT) - mercY(BOTTOM_LAT)));
const geo = feature(world, world.objects.countries);
geo.features = geo.features.filter(f => f.id !== '010'); // 南極は表示しない
const path = geoPath(proj).digits(1);
const byIso = new Map(countries.filter(c => c.map.isoNumeric).map(c => [c.map.isoNumeric, c]));

const isOn = f => { const c = byIso.get(f.id); return c && isPublished(c) && !c.map.marker; };
const lite = feature(worldLite, worldLite.objects.countries).features.filter(f => f.id !== '010' && !isOn(f));
const shapes = [...lite, ...geo.features.filter(isOn)].map(f => {
  const c = byIso.get(f.id);
  const d = path(f);
  if (!d) return '';
  if (isOn(f)) {
    return `<path d="${d}" class="land on" data-id="${c.id}" data-region="${c.region}" tabindex="0" role="link" aria-label="${esc(c.name)}"></path>`;
  }
  return `<path d="${d}" class="land"/>`;
}).join('');
const markers = countries.filter(c => c.map.marker && isPublished(c)).map(c => {
  const [x, y] = proj(c.map.marker);
  return `<g class="marker" data-id="${c.id}" data-region="${c.region}" tabindex="0" role="link" aria-label="${esc(c.name)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/></g>`;
}).join('');
const regionViews = Object.fromEntries(regions.map(r => {
  const [[x0, y0], [x1, y1]] = [proj(r.bbox[0]), proj(r.bbox[1])].map(pt => pt);
  const [minX, maxX, minY, maxY] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
  // 地図の縦横比（W:H）に合わせて、余白を付けて広げる
  let w = (maxX - minX) * 1.08, h = (maxY - minY) * 1.08;
  if (w / h > W / H) h = w * H / W; else w = h * W / H;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return [r.id, [cx - w / 2, cy - h / 2, w, h].map(n => +n.toFixed(1))];
}));

const pub = countries.filter(isPublished);
const pubCities = cities.filter(cityPublished);
const citiesIn = r => pubCities.filter(ct => countryOf(ct).region === r.id);
// エリアのボタンにマウスを合わせると、国の一覧（国に合わせるとその国の都市）が出る
const regionTabs = regions.filter(r => pub.some(c => c.region === r.id)).map(r => {
  const list = pub.filter(c => c.region === r.id);
  const withCities = list.filter(c => pubCities.some(ct => ct.country === c.id));
  return `<div class="region-item"><button type="button" class="region-btn" data-region="${r.id}" aria-haspopup="true">${esc(r.name)}</button>
<div class="flyout"><div class="fly-inner">
<div class="fly-col"><p class="fly-label">国・地域</p><ul>${list.map(c => `<li><a class="fly-country" data-id="${c.id}" href="countries/${c.id}.html" target="_blank" rel="noopener">${esc(c.name)}${pubCities.some(ct => ct.country === c.id) ? '<span class="fly-arrow">›</span>' : ''}</a></li>`).join('')}</ul></div>
${withCities.length ? `<div class="fly-col fly-cities-col"><p class="fly-label">人気の都市</p>${withCities.map((c, i) => `<ul class="fly-cities" data-country="${c.id}"${i ? ' hidden' : ''}>${pubCities.filter(ct => ct.country === c.id).map(ct => `<li><a href="cities/${ct.id}.html" target="_blank" rel="noopener">${esc(ct.name)}</a></li>`).join('')}</ul>`).join('')}<p class="fly-empty" hidden>この国の都市ページは準備中です</p></div>` : ''}
</div></div></div>`;
}).join('');
const chips = regions.map(r => `<div class="chips" data-region="${r.id}" hidden>${pub.filter(c => c.region === r.id)
  .map(c => `<a class="chip" href="countries/${c.id}.html" target="_blank" rel="noopener">${esc(c.name)}</a>`).join('')}${citiesIn(r)
  .map(ct => `<a class="chip city" href="cities/${ct.id}.html" target="_blank" rel="noopener">${esc(ct.name)}</a>`).join('')}</div>`).join('');

const card = (c, href, cls = 'card') => {
  const im = firstImage(c);
  return `<a class="${cls}" href="${href}" target="_blank" rel="noopener"><span class="card-img">${im ? `<img src="${esc(im.small ?? im.thumb)}" alt="" loading="lazy" width="500" height="333">` : ''}</span><span class="card-name">${esc(c.name)}</span><span class="card-en">${esc(c.nameEn)}</span></a>`;
};
const lineup = regions.filter(r => pub.some(c => c.region === r.id)).map(r => `<div class="lineup-region"><h3>${esc(r.name)}</h3><div class="cards">${pub.filter(c => c.region === r.id).map(c => card(c, `countries/${c.id}.html`)).join('')}</div>${citiesIn(r).length ? `<p class="cities-label"><span class="sec-en">POPULAR CITIES</span>人気の都市</p><div class="cards cards-city">${citiesIn(r).map(ct => card(ct, `cities/${ct.id}.html`, 'card card-city')).join('')}</div>` : ''}</div>`).join('');

// ---------- 人気の動画（ファーストビューのカルーセル）と人気ランキング ----------
const places = [...pub.map(c => ({ c, href: `countries/${c.id}.html`, kind: 'country' })),
  ...pubCities.map(c => ({ c, href: `cities/${c.id}.html`, kind: 'city', parent: countryOf(c) }))];
const realVideos = c => pickVideos(c).filter(v => !v.demo);
// 各国・都市の上位3本を候補にし、ページを開くたびにブラウザ側でランダムに10本選ぶ
const seen = new Set();
const picks = places.flatMap(({ c, href }) => realVideos(c).slice(0, 3).filter(v => !seen.has(v.id) && seen.add(v.id))
  .map(v => ({ id: v.id, t: v.title, ch: v.channel, v: fmtViews(v.views), d: fmtDur(v.durationSec), p: c.name, h: href })));
const reel = `<div class="reel" aria-label="人気の旅行動画"><p class="reel-label"><span class="sec-en">POPULAR VLOGS</span>いま人気の旅行動画</p><div class="reel-view"><div class="reel-track"></div></div></div>`;
// 地図にマウスを合わせたときの表示（国名・国旗・人気の都市）
const flags = new Set(pub.map(c => c.flag).filter(Boolean));
fs.mkdirSync(p('dist/flags'), { recursive: true });
for (const f of flags) fs.copyFileSync(p(`node_modules/flag-icons/flags/4x3/${f}.svg`), p(`dist/flags/${f}.svg`));
const placeInfo = Object.fromEntries(pub.map(c => [c.id, { n: c.name, e: c.nameEn, f: c.flag ?? '', c: pubCities.filter(ct => ct.country === c.id).map(ct => ct.name) }]));

// 人気ランキング：表示している動画（上位8本）の合計再生数で並べる
const rankRows = list => list.map(pl => ({ ...pl, views: realVideos(pl.c).slice(0, cfg.videos.initial).reduce((s, v) => s + v.views, 0) }))
  .filter(r => r.views > 0).sort((a, b) => b.views - a.views).slice(0, 10);
const rankList = rows => rows.length ? `<ol class="rank-list">${rows.map((r, i) => {
  const im = firstImage(r.c);
  return `<li><a href="${r.href}" target="_blank" rel="noopener"><span class="rank-no${i < 3 ? ' top' : ''}">${i + 1}</span><span class="rank-img">${im ? `<img src="${esc(im.small ?? im.thumb)}" alt="" loading="lazy" width="500" height="333">` : ''}</span><span class="rank-body"><span class="rank-name">${esc(r.c.name)}${r.parent ? `<small>${esc(r.parent.name)}</small>` : ''}</span><span class="rank-meta">おすすめ動画の総再生数 ${fmtViews(r.views)}</span></span></a></li>`;
}).join('')}</ol>` : '<p class="note">集計中です。</p>';
const ranking = `<section class="ranking" id="ranking">
  <div class="sec-head"><span class="sec-en">RANKING</span><h2>人気ランキング</h2></div>
  <div class="rank-cols">
    <div class="rank-col"><h3>国・地域</h3>${rankList(rankRows(places.filter(pl => pl.kind === 'country')))}</div>
    <div class="rank-col"><h3>都市</h3>${rankList(rankRows(places.filter(pl => pl.kind === 'city')))}</div>
  </div>
  <p class="note">各ページで紹介している旅行vlog（上位${cfg.videos.initial}本）の合計再生数の順です。毎週の動画の更新に合わせて変わります。</p>
</section>`;

fs.writeFileSync(p('dist/index.html'), layout({
  title: `${cfg.siteName}｜${cfg.tagline}`,
  desc: cfg.siteDescription,
  cls: 'home', path: 'index.html',
  jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.siteName, alternateName: cfg.siteNameEn, url: `${BASE}/`, description: cfg.siteDescription, inLanguage: 'ja' },
  body: `<section class="hero"><div class="hero-inner">
  <div class="hero-text">
  <p class="eyebrow">NOW SHOWING ・ ${pub.length} COUNTRIES &amp; REGIONS ・ ${pubCities.length} CITIES</p>
  <h1>${esc(cfg.catch).replace('、', '、<wbr>')}</h1>
  <p class="lead">${esc(cfg.siteDescription).replace("。", "。<br>")}</p>
  <a class="cta" href="#map-section">行き先を選ぶ</a>
  </div>
</div>
${reel}
</section>
<section class="map-wrap" id="map-section">
  <div class="sec-head row"><span class="sec-en">SELECT YOUR SCREEN</span><h2>エリアから探す</h2></div>
  <div class="map-bar"><nav class="regions">${regionTabs}</nav><span class="step" id="step-label">エリアを選んでください</span><button type="button" id="back" hidden>← 世界地図に戻る</button></div>
  <div class="map-stage"><svg id="map" viewBox="0 0 ${W} ${H}" data-world="0 0 ${W} ${H}" role="img" aria-label="世界地図" style="--arn:${(W / H).toFixed(3)}">${shapes}${markers}</svg>
  <div class="map-tip" hidden></div></div>
  ${chips}
  <p class="note">色がついている国・地域が掲載中です。国や都市を選ぶと、別のタブでページが開きます。海外は、外務省の危険情報で主な観光地がレベル0の国・地域だけを掲載しています。</p>
</section>
${ranking}
<section class="lineup" id="lineup">
  <div class="sec-head"><span class="sec-en">LINEUP</span><h2>上映中の国・地域</h2></div>
  ${lineup}
</section>
<section class="howto">
  <div class="sec-head"><span class="sec-en">HOW TO ENJOY</span><h2>トリップシアターの楽しみ方</h2></div>
  <ol class="steps3">
    <li><strong>行き先を選ぶ</strong><span>地図か一覧から、気になる国・地域や都市を選びます。</span></li>
    <li><strong>旅を観る</strong><span>再生数や評価をもとに選んだ旅行vlogで、現地の雰囲気を先に体験します。</span></li>
    <li><strong>計画に活かす</strong><span>基本情報やブログのモデルコースを参考に、自分の旅を組み立てます。</span></li>
  </ol>
</section>
<script>window.REGION_VIEWS=${JSON.stringify(regionViews)};window.PICKS=${JSON.stringify(picks).replace(/</g, '\\u003c')};window.PLACE_INFO=${JSON.stringify(placeInfo).replace(/</g, '\\u003c')};</script><script src="map.js?v=${V.map}"></script><script src="home.js?v=${V.home}"></script>`,
}));

const crumbs = list => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: list.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })) });

// ---------- 国ページ ----------
const INFO = [['capital', '首都'], ['language', '言語'], ['currency', '通貨'], ['timeDiff', '時差'], ['flight', '飛行時間の目安'], ['entry', 'ビザ・入国'], ['season', 'ベストシーズン'], ['plug', 'コンセント・電圧'], ['tip', 'チップ']];

function pickVideos(c) {
  const store = readJSON(`data/videos/${c.id}.json`, { items: [] });
  let items = store.items.filter(v => v.status !== 'blocked');
  if (cfg.videos.mode === 'manual') items = items.filter(v => v.status === 'approved');
  items.sort((a, b) => (b.status === 'approved') - (a.status === 'approved') || b.score - a.score);
  // 同じチャンネルの動画は最大2本まで（承認済みは除く）
  const perChannel = new Map();
  items = items.filter(v => {
    const n = (perChannel.get(v.channelId) ?? 0) + 1;
    perChannel.set(v.channelId, n);
    return v.status === 'approved' || n <= (cfg.videos.maxPerChannel ?? 2);
  }).slice(0, cfg.videos.max);
  if (!items.length && DEMO) {
    items = Array.from({ length: 6 }, (_, i) => ({ demo: true, id: '', title: `（サンプル）${c.name}旅行vlog ${i + 1}`, channel: 'サンプルチャンネル', durationSec: 600 + i * 137, views: 120000 - i * 15000, summary: 'ここに、動画の見どころを自分の言葉で2〜3行でまとめた概要が入ります。' }));
  }
  return items;
}

// Wikimedia Commons の写真（作者とライセンスを必ず表示する）
function gallery(c) {
  const imgs = readJSON(`data/images/${c.id}.json`, []).filter(i => !i.hidden).slice(0, 3);
  if (!imgs.length) return '';
  return `<div class="gallery g${imgs.length}">${imgs.map((im, i) => `<figure>
  <img src="${esc(im.large ?? im.thumb)}" srcset="${[[im.small, 500], [im.large, 1280], [im.thumb, 1920]].filter(([u]) => u).map(([u, w]) => `${esc(u)} ${w}w`).join(', ')}" sizes="${i ? '(max-width:720px) 85vw, 360px' : '(max-width:720px) 85vw, 740px'}" alt="${esc(c.name)}の風景（${esc(im.query)}）" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="1600" height="1067">
  <figcaption><a href="${esc(im.page)}" target="_blank" rel="noopener">写真：${esc(im.artist.slice(0, 40))}</a> / ${im.licenseUrl ? `<a href="${esc(im.licenseUrl)}" target="_blank" rel="noopener">${esc(im.license)}</a>` : esc(im.license)} / Wikimedia Commons</figcaption>
</figure>`).join('')}</div>`;
}

function videoCard(v, i) {
  const url = v.demo ? '#' : `https://www.youtube.com/watch?v=${v.id}`;
  const thumb = v.demo ? '<div class="thumb demo">サンプル</div>'
    : `<img class="thumb" src="${esc(v.thumbnail)}" alt="" loading="lazy" width="480" height="360">`;
  return `<article class="video"${i >= cfg.videos.initial ? ' hidden' : ''}>
  <a href="${url}" target="_blank" rel="noopener" class="thumb-link" data-embed="${v.embeddable && !v.demo ? esc(v.id) : ''}">${thumb}<span class="dur">${fmtDur(v.durationSec)}</span></a>
  <h3><a href="${url}" target="_blank" rel="noopener">${esc(v.title)}</a></h3>
  <p class="meta">${esc(v.channel)} ・ ${fmtViews(v.views)}再生</p>
  ${v.summary ? `<p class="summary">${esc(v.summary)}</p>` : ''}
</article>`;
}

const DOMESTIC_INFO = [['area', 'エリア'], ['transport', '主な移動手段'], ['season', '旅行シーズン'], ['pass', 'お得な切符・プラン'], ['note', '旅のヒント']];
const CITY_INFO = [['area', '場所'], ['access', 'アクセス'], ['stay', '滞在日数の目安'], ['transport', '市内の移動'], ['season', 'ベストシーズン'], ['highlights', '主な見どころ']];
const mofaUrlOf = (c, s) => s.mofaUrl ?? (c.safety?.mofaCode ? `https://www.anzen.mofa.go.jp/info/pcinfectionspothazardinfo_${c.safety.mofaCode}.html` : 'https://www.anzen.mofa.go.jp/');

const PAGE_SCRIPT = `<script>
document.querySelectorAll('.more-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const rest = [...btn.closest('section').querySelectorAll('.video[hidden]')];
    rest.slice(0, Number(btn.dataset.step)).forEach(v => { v.hidden = false; });
    const left = rest.length - Number(btn.dataset.step);
    if (left <= 0) btn.parentElement.remove();
  });
});
document.querySelectorAll('.thumb-link[data-embed]').forEach(a => {
  if (!a.dataset.embed) return;
  a.addEventListener('click', e => {
    e.preventDefault();
    const f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + a.dataset.embed + '?autoplay=1';
    f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.className = 'thumb';
    a.replaceWith(f);
  });
});
</script>`;

function blogsOf(c) {
  // リンク確認で開けたもの（または1回だけ失敗したもの）だけを表示する
  return readJSON(`data/blogs/${c.id}.json`, []).map(b => {
    const l = links[b.url];
    // 自動確認を拒否するサイトは、手で title を書いたときだけ表示する
    if (!l || (l.blocked && !l.ok && !b.title) || (!l.ok && !l.blocked && (l.fails ?? 0) >= 2)) return null;
    return { ...b, title: b.title || l.title || b.url, site: b.site || l.site || new URL(b.url).hostname };
  }).filter(Boolean);
}

// 旅の紹介文（data/guides/<ID>.json、サイト独自の文章）
const guideOf = c => readJSON(`data/guides/${c.id}.json`, null);
function guideSection(c) {
  const g = guideOf(c);
  if (!g) return '';
  const label = c.kind === 'city' || countryOf(c) ? 'この街の旅' : c.domestic ? '国内旅行の楽しみ方' : 'この国・地域の旅';
  return `<section class="guide"><h2><span class="sec-en">TRAVEL NOTES</span>${label}</h2>
<p class="guide-lead">${esc(g.lead)}</p>
<ul class="guide-points">${g.points.map(pt => `<li>${esc(pt)}</li>`).join('')}</ul>
${g.firstTime ? `<div class="guide-first"><strong>最初の旅のコツ</strong><p>${esc(g.firstTime)}</p></div>` : ''}</section>`;
}
const descOf = (c, fallback) => { const g = guideOf(c); return g ? `${c.name}旅行の予習に。${g.lead}`.slice(0, 118) + (`${c.name}旅行の予習に。${g.lead}`.length > 118 ? '…' : '') : fallback; };

// 旅の準備（アフィリエイト広告）。ステマ規制のため必ず「PR」を表示する。ASPのコードは改変しない
function prepSection(c) {
  // pages: "all"＝全ページ、"overseas"＝海外の国・都市だけ、配列＝指定した国・都市（国を指定するとその国の都市にも出る）
  const overseas = !(c.domestic || countries.find(x => x.id === c.country)?.domestic);
  const ads = affiliates.filter(a => a.html && (a.pages === 'all' || (a.pages === 'overseas' && overseas) || (Array.isArray(a.pages) && (a.pages.includes(c.id) || a.pages.includes(c.country)))));
  if (!ads.length) return '';
  return `<section class="prep"><h2><span class="sec-en">PREPARE</span>旅の準備</h2>
<p class="pr-note"><span class="pr">PR</span>旅の予約や準備に使えるサービスの広告です。</p>
<div class="ad-slots">${ads.map(a => `<div class="ad-slot">${a.html}</div>`).join('')}</div></section>`;
}

// 国ページと都市ページの共通部分
function placeBody(c, { crumb, sub, safetyHtml, infoRows, extra = '' }) {
  const videos = pickVideos(c);
  const blogs = blogsOf(c);
  return `<article class="country">
<div class="country-head"><p class="crumb">${crumb}</p><p class="eyebrow">NOW SHOWING</p><h1>${esc(c.name)}<span class="h1-sub">${sub}</span></h1><p class="h1-en">${esc(c.nameEn)}</p></div>
${gallery(c)}
${safetyHtml}
${guideSection(c)}
<section><h2><span class="sec-en">FEATURED VLOGS</span>おすすめの旅行動画</h2>${videos.some(v => v.summarySource === 'ai') ? '<p class="small">動画の概要は、動画の説明文をもとにAIが作成しています。</p>' : ''}${videos.length ? `<div class="videos">${videos.map(videoCard).join('')}</div>${videos.length > cfg.videos.initial ? `<p class="more-wrap"><button type="button" class="more-btn" data-step="${cfg.videos.step}">もっと見る</button></p>` : ''}` : '<p>動画は準備中です。新しい動画は毎週自動で集めています。</p>'}</section>
${extra}
<section><h2><span class="sec-en">BASICS</span>基本情報</h2><table class="info">${infoRows.map(([k, l]) => c.basic?.[k] ? `<tr><th>${l}</th><td>${esc(c.basic[k])}</td></tr>` : '').join('')}</table>
<p class="small">${c.domestic || countryOf(c)?.domestic ? '移動時間などは目安です。最新の情報は交通機関の公式サイトで確認してください。' : 'ビザや入国の条件は変わることがあります。渡航前に大使館などの公式情報で確認してください。'}</p></section>
${prepSection(c)}
${blogs.length ? `<section><h2><span class="sec-en">READING</span>おすすめのブログ・記事</h2><ul class="blogs">${blogs.map(b => `<li>${b.type ? `<span class="tag">${esc(b.type)}</span>` : ''}<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.title)}</a><span class="meta">${esc(b.site)}</span>${b.note ? `<p>${esc(b.note)}</p>` : ''}</li>`).join('')}</ul></section>` : ''}
</article>
${PAGE_SCRIPT}`;
}

function safetySection(c, s, cityName) {
  if (c.domestic) return '';
  const mofa = mofaUrlOf(c, s);
  const head = cityName ? `${esc(c.name)}の` : '';
  return `<section class="safety ${s.listed ? 'partial' : ''}"><h2><span class="sec-en">SAFETY</span>安全情報</h2>
<p>${s.listed ? `${head}国内の一部地域に危険情報が出ています。${esc(c.safetyNote ?? '')}${cityName ? `${esc(cityName)}を含む` : ''}主な観光地はレベル0です。` : `${head}外務省の危険情報は出ていません。`}（${esc(safety.checkedAt)}時点）</p>
<p><a href="${mofa}" target="_blank" rel="noopener">外務省 海外安全ホームページで最新情報を見る</a></p></section>`;
}

const cityLinks = (list, prefix, label = '人気の都市') => list.length ? `<section><h2><span class="sec-en">POPULAR CITIES</span>${label}</h2><div class="cards cards-city">${list.map(ct => card(ct, `${prefix}${ct.id}.html`, 'card card-city').replace(' target="_blank" rel="noopener"', '')).join('')}</div></section>` : '';

for (const c of countries) {
  const s = safety.countries[c.id] ?? { status: 'ok' };
  const region = regions.find(r => r.id === c.region);
  let body;
  if (safeOk(c) && !hasVideos(c)) {
    body = pendingNotice(c.name);
  } else if (!isPublished(c)) {
    body = `<article class="country"><h1>${esc(c.name)}</h1><div class="notice">外務省の安全情報が変わったため、このページの掲載を一時停止しています。最新の情報は<a href="${mofaUrlOf(c, s)}" target="_blank" rel="noopener">外務省 海外安全ホームページ</a>でご確認ください。</div></article>`;
  } else {
    body = placeBody(c, {
      crumb: `<a href="../index.html#lineup">${esc(region?.name)}</a>`,
      sub: c.domestic ? 'の国内旅行vlog・旅行情報' : 'の旅行vlog・旅行情報',
      safetyHtml: safetySection(c, s),
      infoRows: c.domestic ? DOMESTIC_INFO : INFO,
      extra: cityLinks(pubCities.filter(ct => ct.country === c.id), '../cities/'),
    });
  }
  fs.writeFileSync(p(`dist/countries/${c.id}.html`), layout({
    title: `${c.name}の旅行情報・おすすめ旅行vlog｜${cfg.siteName}`,
    desc: descOf(c, `${c.name}旅行の予習に。${c.domestic ? '人気の都市' : '安全情報や入国・通貨などの基本情報'}と、再生数や評価で選んだ旅行vlog・ブログをまとめています。`),
    body, depth: 1, cls: 'page-country', path: `countries/${c.id}.html`, noindex: !isPublished(c),
    image: firstImage(c)?.thumb,
    jsonld: crumbs([[cfg.siteName, 'index.html'], [c.name, `countries/${c.id}.html`]]),
  }));
}

// ---------- 都市ページ ----------
for (const ct of cities) {
  const c = countryOf(ct);
  if (!c) { console.warn(`${ct.name}：親の国（${ct.country}）が見つかりません`); continue; }
  const s = safety.countries[c.id] ?? { status: 'ok' };
  let body;
  if (safeOk(c) && !hasVideos(ct)) {
    body = pendingNotice(ct.name);
  } else if (!cityPublished(ct)) {
    body = `<article class="country"><h1>${esc(ct.name)}</h1><div class="notice">外務省の安全情報が変わったため、このページの掲載を一時停止しています。最新の情報は<a href="${mofaUrlOf(c, s)}" target="_blank" rel="noopener">外務省 海外安全ホームページ</a>でご確認ください。</div></article>`;
  } else {
    const others = pubCities.filter(o => o.country === c.id && o.id !== ct.id);
    body = placeBody(ct, {
      crumb: `<a href="../countries/${c.id}.html">${esc(c.name)}</a>`,
      sub: 'の旅行vlog・観光情報',
      safetyHtml: safetySection(c, s, ct.name),
      infoRows: CITY_INFO,
      extra: cityLinks(others, '', `${c.name}のほかの都市`),
    });
  }
  fs.writeFileSync(p(`dist/cities/${ct.id}.html`), layout({
    title: `${ct.name}の観光情報・おすすめ旅行vlog｜${cfg.siteName}`,
    desc: descOf(ct, `${ct.name}旅行の予習に。見どころ・アクセス・滞在日数の目安と、再生数や評価で選んだ旅行vlog・モデルコース記事をまとめています。`),
    body, depth: 1, cls: 'page-country page-city', path: `cities/${ct.id}.html`, noindex: !cityPublished(ct),
    image: firstImage(ct)?.thumb,
    jsonld: crumbs([[cfg.siteName, 'index.html'], [c.name, `countries/${c.id}.html`], [ct.name, `cities/${ct.id}.html`]]),
  }));
}
// ---------- サイトについて・プライバシーポリシー・お問い合わせ ----------
const doc = (path, title, en, html, desc) => fs.writeFileSync(p(`dist/${path}`), layout({
  title: `${title}｜${cfg.siteName}`, desc, path, cls: 'page-doc',
  body: `<article class="doc"><div class="country-head"><p class="eyebrow">${en}</p><h1>${title}</h1></div>${html}</article>`,
}));
const contactLink = cfg.contactFormUrl ? `<a href="${esc(cfg.contactFormUrl)}" target="_blank" rel="noopener">お問い合わせフォーム</a>` : '<a href="contact.html">お問い合わせページ</a>';

doc('about.html', 'サイトについて', 'ABOUT', `
<p>${esc(cfg.siteName)}（${esc(cfg.siteNameEn)}）は、旅行の前に旅行vlogやブログで予習したい人のためのガイドサイトです。行き先の国・地域や都市を選ぶと、評判のよい旅行動画と記事、旅の基本情報をまとめて見られます。</p>
<h2>掲載している国・地域</h2>
<p>海外は、外務省 海外安全ホームページの危険情報で、主な観光地がレベル0（危険情報なし）の国・地域だけを掲載しています。感染症危険情報が出ている国・地域は掲載しません。危険情報は毎週自動で確認し、変化があれば掲載を止めます。渡航前には必ず<a href="https://www.anzen.mofa.go.jp/" target="_blank" rel="noopener">外務省 海外安全ホームページ</a>で最新の情報をご確認ください。</p>
<h2>動画の選び方</h2>
<p>YouTubeで公開されている日本語の旅行動画から、再生数、高評価の割合、公開時期、動画の長さをもとに自動で選んでいます。同じチャンネルの動画は1ページ2本までです。動画の概要文は、動画のタイトルと説明文をもとにAIが作成しており、動画の内容をすべて確認したものではありません。</p>
<h2>写真と記事</h2>
<p>ページ上部の写真は、Wikimedia Commons で自由な利用が認められた写真（CC0・パブリックドメイン・CC BY・CC BY-SA）を使い、撮影者とライセンスを表示しています。AIで生成された画像は使いません。紹介している記事は各サイトへのリンクで、内容の著作権は各サイトに帰属します。</p>
<h2>運営者</h2>
<table class="info"><tr><th>サイト名</th><td>${esc(cfg.siteName)}（${esc(cfg.siteNameEn)}）</td></tr><tr><th>運営</th><td>${esc(cfg.operator)}</td></tr><tr><th>URL</th><td>${esc(BASE)}/</td></tr><tr><th>お問い合わせ</th><td>${contactLink}</td></tr></table>
<p>動画やブログの制作者の方で、掲載の停止をご希望の場合は、お問い合わせからご連絡ください。確認のうえ速やかに対応します。</p>`,
`${cfg.siteName}の目的、掲載している国・地域の基準、動画の選び方、運営者について。`);

doc('privacy.html', 'プライバシーポリシー', 'PRIVACY POLICY', `
<p>${esc(cfg.operator)}（以下「当サイト」）は、${esc(cfg.siteName)}における利用者の情報の取り扱いについて、次のとおり定めます。</p>
<h2>取得する情報と利用目的</h2>
<p>当サイトは、お問い合わせの際に入力いただいたお名前・メールアドレス・内容を、お問い合わせへの回答と、必要な連絡のためにだけ使います。法令に基づく場合を除き、本人の同意なく第三者に提供しません。</p>
<h2>Cookie（クッキー）とアクセス解析</h2>
<p>当サイトでは、利用状況を把握してサイトを改善するために、Google アナリティクスなどのアクセス解析ツールを使うことがあります。これらのツールはCookieを使って、個人を特定しない形で利用状況を集めます。Cookieはブラウザの設定で無効にできます。Google アナリティクスによるデータの取り扱いは<a href="https://policies.google.com/technologies/partner-sites?hl=ja" target="_blank" rel="noopener">Googleのポリシー</a>をご覧ください。</p>
<h2 id="ads">広告について</h2>
<p>当サイトは、第三者配信の広告サービス（Google アドセンスなど）や、アフィリエイトプログラム（旅行予約サイトなどの紹介）を利用することがあります。広告やアフィリエイトのリンクには「広告」「PR」と分かるように表示します。</p>
<p>Google などの第三者配信事業者は、Cookieを使って、利用者が当サイトや他のサイトを訪れた情報をもとに広告を配信することがあります。パーソナライズ広告は<a href="https://adssettings.google.com/" target="_blank" rel="noopener">Googleの広告設定</a>で無効にできます。</p>
<p>動画や記事の選定は、再生数や評価などの基準に基づいて行っており、広告主からの依頼や報酬によって選んだり順位を変えたりすることはありません。</p>
<h2>YouTube動画の埋め込み</h2>
<p>当サイトの動画は、YouTubeのプライバシー強化モード（youtube-nocookie.com）で埋め込んでいます。再生した場合、YouTube（Google）がCookieなどを使うことがあります。詳しくは<a href="https://policies.google.com/privacy?hl=ja" target="_blank" rel="noopener">Googleのプライバシーポリシー</a>をご覧ください。</p>
<h2>免責事項</h2>
<p>当サイトの情報はできるかぎり正確になるよう努めていますが、内容の正確さや最新であることを保証するものではありません。ビザ・入国条件・安全情報などは変わることがあるため、渡航前に公式の情報をご確認ください。当サイトからリンクしている外部サイトの内容について、当サイトは責任を負いません。</p>
<h2>著作権</h2>
<p>紹介している動画・記事・写真の著作権は、それぞれの制作者・撮影者に帰属します。掲載に問題がある場合は、お問い合わせからご連絡ください。</p>
<h2>改定</h2>
<p>このポリシーは、必要に応じて変更することがあります。変更後の内容は、このページに掲載した時点から適用します。</p>
<p class="small">制定日：${esc(cfg.policyDate)}<br>運営：${esc(cfg.operator)}</p>`,
`${cfg.siteName}のプライバシーポリシー、広告・アフィリエイトについて、免責事項。`);

doc('contact.html', 'お問い合わせ', 'CONTACT', cfg.contactFormUrl ? `
<p>サイトへのご意見、掲載内容の誤り、掲載の停止のご希望などは、下のフォームからご連絡ください。内容を確認のうえ、必要に応じてご返信します。</p>
<p class="contact-cta"><a class="cta" href="${esc(cfg.contactFormUrl)}" target="_blank" rel="noopener">お問い合わせフォームを開く</a></p>
<p class="small">フォームは Google フォームを使っています。入力いただいた情報は<a href="privacy.html">プライバシーポリシー</a>に沿って取り扱います。</p>` : `
<p>お問い合わせフォームは準備中です。もうしばらくお待ちください。</p>`,
`${cfg.siteName}へのお問い合わせ。掲載内容の誤りや掲載停止のご希望など。`);

// ---------- サイトマップと robots.txt ----------
if (BASE) {
  const lastmod = today();
  fs.writeFileSync(p('dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(path => `  <url><loc>${esc(abs(path))}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
  fs.writeFileSync(p('dist/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
}
console.log(`dist/ を生成しました（国・地域 ${pub.length} / ${countries.length} 件、都市 ${pubCities.length} / ${cities.length} 件${DEMO ? '、サンプル表示あり' : ''}）`);
