// data/ の内容から静的サイトを dist/ に生成する。
// node scripts/build.mjs          本番用
// node scripts/build.mjs --demo   動画データが無い国にサンプル表示を入れる（見た目の確認用）
import fs from 'node:fs';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { readJSON, p, today } from './lib.mjs';

const DEMO = process.argv.includes('--demo');
const cfg = readJSON('data/config.json');
const regions = readJSON('data/regions.json');
const countries = readJSON('data/countries.json');
const safety = readJSON('data/safety.json', { countries: {} });
const world = JSON.parse(fs.readFileSync(p('node_modules/world-atlas/countries-50m.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isPublished = c => (safety.countries[c.id]?.status ?? 'ok') === 'ok';
const fmtDur = s => `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
const fmtViews = n => n >= 1e4 ? `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1)}万回` : `${n.toLocaleString('ja-JP')}回`;

fs.rmSync(p('dist'), { recursive: true, force: true });
fs.mkdirSync(p('dist/countries'), { recursive: true });
fs.copyFileSync(p('src/style.css'), p('dist/style.css'));
fs.copyFileSync(p('src/map.js'), p('dist/map.js'));

const layout = ({ title, desc, body, depth = 0 }) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="stylesheet" href="${'../'.repeat(depth)}style.css"></head>
<body><header class="site"><a href="${'../'.repeat(depth)}index.html" class="logo">${esc(cfg.siteName)}</a></header>
<main>${body}</main>
<footer class="site"><p>安全情報の出典：<a href="https://www.anzen.mofa.go.jp/" target="_blank" rel="noopener">外務省 海外安全ホームページ</a>（最終確認 ${esc(safety.checkedAt)}）。動画とブログの著作権は各制作者に帰属します。掲載の停止をご希望の方はお問い合わせください。</p></footer>
</body></html>`;

// ---------- 世界地図 ----------
const W = 960, H = 500;
const geo = feature(world, world.objects.countries);
const proj = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' });
const path = geoPath(proj);
const byIso = new Map(countries.filter(c => c.map.isoNumeric).map(c => [c.map.isoNumeric, c]));

const shapes = geo.features.map(f => {
  const c = byIso.get(f.id);
  const d = path(f);
  if (!d) return '';
  if (c && isPublished(c) && !c.map.marker) {
    return `<path d="${d}" class="land on" data-id="${c.id}" data-region="${c.region}" tabindex="0" role="link" aria-label="${esc(c.name)}"><title>${esc(c.name)}</title></path>`;
  }
  return `<path d="${d}" class="land"/>`;
}).join('');
const markers = countries.filter(c => c.map.marker && isPublished(c)).map(c => {
  const [x, y] = proj(c.map.marker);
  return `<g class="marker" data-id="${c.id}" data-region="${c.region}" tabindex="0" role="link" aria-label="${esc(c.name)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/><title>${esc(c.name)}</title></g>`;
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
const regionTabs = regions.filter(r => pub.some(c => c.region === r.id))
  .map(r => `<button type="button" class="region-btn" data-region="${r.id}">${esc(r.name)}</button>`).join('');
const chips = regions.map(r => `<div class="chips" data-region="${r.id}" hidden>${pub.filter(c => c.region === r.id)
  .map(c => `<a class="chip" href="countries/${c.id}.html" target="_blank" rel="noopener">${esc(c.name)}</a>`).join('')}</div>`).join('');

fs.writeFileSync(p('dist/index.html'), layout({
  title: `${cfg.siteName}｜国別の旅行vlog・ブログまとめ`,
  desc: cfg.siteDescription,
  body: `<section class="hero"><h1>${esc(cfg.siteName)}</h1><p>${esc(cfg.siteDescription)}</p></section>
<section class="map-wrap">
  <div class="steps"><span class="step" id="step-label">① エリアを選んでください</span><button type="button" id="back" hidden>← 世界地図に戻る</button></div>
  <nav class="regions">${regionTabs}</nav>
  <svg id="map" viewBox="0 0 ${W} ${H}" data-world="0 0 ${W} ${H}" role="img" aria-label="世界地図">${shapes}${markers}</svg>
  ${chips}
  <p class="note">色がついている国・地域が掲載中です。国を選ぶと、別のタブで国のページが開きます。掲載しているのは、外務省の危険情報で主な観光地がレベル0の国・地域だけです。</p>
</section>
<script>window.REGION_VIEWS=${JSON.stringify(regionViews)};</script><script src="map.js"></script>`,
}));

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

for (const c of countries) {
  const s = safety.countries[c.id] ?? { status: 'ok' };
  const region = regions.find(r => r.id === c.region);
  const mofa = s.mofaUrl ?? (c.safety.mofaCode ? `https://www.anzen.mofa.go.jp/info/pcinfectionspothazardinfo_${c.safety.mofaCode}.html` : 'https://www.anzen.mofa.go.jp/');
  let body;
  if (!isPublished(c)) {
    body = `<article class="country"><h1>${esc(c.name)}</h1><div class="notice">外務省の安全情報が変わったため、このページの掲載を一時停止しています。最新の情報は<a href="${mofa}" target="_blank" rel="noopener">外務省 海外安全ホームページ</a>でご確認ください。</div></article>`;
  } else {
    const videos = pickVideos(c);
    const blogs = readJSON(`data/blogs/${c.id}.json`, []);
    body = `<article class="country">
<p class="crumb">${esc(region?.name)}</p><h1>${esc(c.name)}の旅行情報と旅行vlog</h1>
<section class="safety ${s.listed ? 'partial' : ''}"><h2>安全情報</h2>
<p>${s.listed ? `国内の一部地域に危険情報が出ています。${esc(c.safetyNote ?? '')}主な観光地はレベル0です。` : '外務省の危険情報は出ていません。'}（${esc(safety.checkedAt)}時点）</p>
<p><a href="${mofa}" target="_blank" rel="noopener">外務省 海外安全ホームページで最新情報を見る</a></p></section>
<section><h2>基本情報</h2><table class="info">${INFO.map(([k, l]) => c.basic[k] ? `<tr><th>${l}</th><td>${esc(c.basic[k])}</td></tr>` : '').join('')}</table>
<p class="small">ビザや入国の条件は変わることがあります。渡航前に大使館などの公式情報で確認してください。</p></section>
<section><h2>おすすめの旅行動画</h2>${videos.length ? `<div class="videos">${videos.map(videoCard).join('')}</div>${videos.length > cfg.videos.initial ? `<p class="more-wrap"><button type="button" class="more-btn" data-step="${cfg.videos.step}">もっと見る（残り${videos.length - cfg.videos.initial}本）</button></p>` : ''}` : '<p>動画は準備中です。</p>'}</section>
<section><h2>おすすめのブログ・記事</h2>${blogs.length ? `<ul class="blogs">${blogs.map(b => `<li><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.title)}</a><span class="meta">${esc(b.site)}</span>${b.note ? `<p>${esc(b.note)}</p>` : ''}</li>`).join('')}</ul>` : '<p>ブログは準備中です。</p>'}</section>
</article>
<script>
document.querySelectorAll('.more-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const rest = [...btn.closest('section').querySelectorAll('.video[hidden]')];
    rest.slice(0, Number(btn.dataset.step)).forEach(v => { v.hidden = false; });
    const left = rest.length - Number(btn.dataset.step);
    if (left > 0) btn.textContent = 'もっと見る（残り' + left + '本）'; else btn.parentElement.remove();
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
  }
  fs.writeFileSync(p(`dist/countries/${c.id}.html`), layout({
    title: `${c.name}の旅行情報・おすすめ旅行vlog｜${cfg.siteName}`,
    desc: `${c.name}旅行の予習に。基本情報と、評判のよい旅行vlog・ブログをまとめています。`,
    body, depth: 1,
  }));
}
console.log(`dist/ を生成しました（掲載 ${pub.length} / ${countries.length} 件${DEMO ? '、サンプル表示あり' : ''}）`);
