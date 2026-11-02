// ファーストビュー下部の帯：人気の旅行動画が横に流れる。開くたびにランダムに選ぶ
(() => {
  const root = document.querySelector('.reel');
  const all = window.PICKS || [];
  if (!root || all.length < 4) { root?.remove(); return; }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pool = [...all];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  // 同じ国・都市は2本まで、合計14本
  const per = {}, list = [];
  for (const v of pool) { if ((per[v.p] = (per[v.p] || 0) + 1) <= 2) list.push(v); if (list.length >= 14) break; }

  const card = (v, dup) => `<a class="reel-card" href="${esc(v.h)}" target="_blank" rel="noopener"${dup ? ' aria-hidden="true" tabindex="-1"' : ''}>
    <span class="reel-thumb"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" width="320" height="180"><span class="reel-dur">${esc(v.d)}</span></span>
    <span class="reel-place">${esc(v.p)}</span><span class="reel-title">${esc(v.t)}</span><span class="reel-meta">${esc(v.ch)} ・ ${esc(v.v)}再生</span></a>`;
  const track = root.querySelector('.reel-track');
  // 同じ並びを2回つなげて、切れ目なく流れるようにする
  track.innerHTML = list.map(v => card(v, false)).join('') + list.map(v => card(v, true)).join('');
  track.style.setProperty('--dur', `${list.length * 5}s`);
  root.classList.add('ready');
})();
