// TOPの世界地図：エリアを選ぶ → 拡大 → 国・地域を選ぶと別タブで開く
(() => {
  const svg = document.getElementById('map');
  const label = document.getElementById('step-label');
  const back = document.getElementById('back');
  const btns = [...document.querySelectorAll('.region-btn')];
  let current = null;

  function animate(to) {
    const from = svg.getAttribute('viewBox').split(' ').map(Number);
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - k, 3);
      const vb = from.map((f, i) => f + (to[i] - f) * e);
      svg.setAttribute('viewBox', vb.join(' '));
      // 拡大しても印の大きさが画面上で同じになるようにする
      svg.querySelectorAll('.marker circle').forEach(c => c.setAttribute('r', (6 * vb[2] / 960).toFixed(2)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function select(region) {
    current = region;
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.region === region)));
    document.querySelectorAll('.chips').forEach(c => { c.hidden = c.dataset.region !== region; });
    animate(region ? window.REGION_VIEWS[region] : svg.dataset.world.split(' ').map(Number));
    label.textContent = region ? '② 国・地域を選んでください' : '① エリアを選んでください';
    back.hidden = !region;
  }
  function open(id) { window.open(`countries/${id}.html`, '_blank', 'noopener'); }

  btns.forEach(b => b.addEventListener('click', () => select(b.dataset.region)));
  back.addEventListener('click', () => select(null));
  svg.querySelectorAll('[data-id]').forEach(el => {
    const go = () => (current === el.dataset.region ? open(el.dataset.id) : select(el.dataset.region));
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
})();
