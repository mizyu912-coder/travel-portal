// ファーストビューの人気動画カルーセル：開くたびにランダムに選び、自動で切り替える
(() => {
  const root = document.querySelector('.carousel');
  const all = window.PICKS || [];
  if (!root || !all.length) { root?.remove(); return; }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // シャッフルして10本（同じ国・都市は2本まで）
  const pool = [...all];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const per = {}, list = [];
  for (const v of pool) { if ((per[v.p] = (per[v.p] || 0) + 1) <= 2) list.push(v); if (list.length >= 10) break; }

  const track = root.querySelector('.car-track'), dots = root.querySelector('.car-dots');
  track.innerHTML = list.map((v, i) => `<a class="car-slide${i ? '' : ' on'}" href="${esc(v.h)}" target="_blank" rel="noopener" aria-hidden="${i ? 'true' : 'false'}" tabindex="${i ? -1 : 0}">
    <img src="https://i.ytimg.com/vi/${esc(v.id)}/maxresdefault.jpg" alt="" ${i ? 'loading="lazy"' : ''} onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg'">
    <span class="car-cap"><span class="car-place">${esc(v.p)}</span><span class="car-title">${esc(v.t)}</span><span class="car-meta">${esc(v.ch)} ・ ${esc(v.v)}再生 ・ ${esc(v.d)}</span></span>
    <span class="car-play" aria-hidden="true"></span></a>`).join('');
  dots.innerHTML = list.map((v, i) => `<button type="button" role="tab" aria-label="${i + 1}本目：${esc(v.p)}" aria-selected="${!i}"></button>`).join('');

  const slides = [...track.children], dotBtns = [...dots.children];
  const bar = root.querySelector('.car-progress span');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 6000;
  let cur = 0, timer = null, paused = false;

  function show(n) {
    cur = (n + slides.length) % slides.length;
    slides.forEach((s, i) => { const on = i === cur; s.classList.toggle('on', on); s.setAttribute('aria-hidden', String(!on)); s.tabIndex = on ? 0 : -1; });
    dotBtns.forEach((d, i) => d.setAttribute('aria-selected', String(i === cur)));
    restart();
  }
  function restart() {
    clearTimeout(timer);
    bar.style.transition = 'none'; bar.style.width = '0';
    if (reduce || paused) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${DURATION}ms linear`; bar.style.width = '100%'; }));
    timer = setTimeout(() => show(cur + 1), DURATION);
  }
  root.querySelector('.car-prev').addEventListener('click', () => show(cur - 1));
  root.querySelector('.car-next').addEventListener('click', () => show(cur + 1));
  dotBtns.forEach((d, i) => d.addEventListener('click', () => show(i)));
  // マウスを乗せている間・キーボード操作中は止める
  const pause = v => { paused = v; restart(); };
  root.addEventListener('mouseenter', () => pause(true));
  root.addEventListener('mouseleave', () => pause(false));
  root.addEventListener('focusin', () => pause(true));
  root.addEventListener('focusout', () => pause(false));
  // スワイプ
  let x0 = null;
  track.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
  document.addEventListener('visibilitychange', () => pause(document.hidden));
  show(0);
})();
