(() => {
  'use strict';

  const root = document.documentElement;
  const is3d = root.classList.contains('is-3d');
  const K = 1; // unità Z per pixel di scroll
  const sections = [...document.querySelectorAll('.ch')];
  const chapters = sections.map((el) => ({
    id: el.id,
    title: el.querySelector('h1, h2').textContent.replace(/\s+/g, ' ').trim(),
    code: el.dataset.code,
    label: el.dataset.label,
    z: Number(el.dataset.z),
    el,
  }));
  const navLinks = [...document.querySelectorAll('.index a, .brand')];
  const byId = (id) => chapters.find((c) => c.id === id);

  let goTo;

  /* ---------- Foto in primo piano (anche nella versione piatta) ---------- */
  const luce = document.querySelector('#luce');
  if (luce) {
    const lImg = luce.querySelector('img');
    const lTesto = luce.querySelector('.luce-testo');
    document.querySelectorAll('.photo .zoom').forEach((b) => b.addEventListener('click', () => {
      const img = b.querySelector('img');
      lImg.src = img.currentSrc || img.src;
      lImg.alt = img.alt;
      const t = b.closest('figure').querySelector('.cartellino');
      lTesto.textContent = t ? [...t.children].map((c) => c.textContent).filter(Boolean).join(' · ') : img.alt;
      luce.showModal();
    }));
    luce.querySelector('.luce-chiudi').addEventListener('click', () => luce.close());
    if (!('closedBy' in luce)) luce.addEventListener('click', (e) => { if (e.target === luce) luce.close(); });
  }

  if (!is3d) {
    goTo = (id, { instant = false } = {}) => {
      const ch = byId(id);
      if (!ch) return false;
      ch.el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
      return true;
    };
    expose();
    return;
  }

  /* ---------- Profondità ---------- */
  const spacer = document.querySelector('.spacer');
  const skies = [...document.querySelectorAll('.sky')];
  const clock = document.querySelector('.clock');
  const flaps = [...clock.querySelectorAll('.flap')];
  const PERSP = 1000; // distanza dell'osservatore in px, come la vecchia perspective CSS
  const narrowMq = matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)');
  const stage = document.querySelector('.stage');
  const velo = document.querySelector('.velo');
  const chiusura = document.querySelector('.chiusura');
  const mappa = document.querySelector('.mappa');
  const barra = document.querySelector('.avanzamento i');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const ingresso = document.querySelector('.ingresso');
  const lastZ = chapters[chapters.length - 1].z;

  const planes = [];
  chapters.forEach((ch) => {
    ch.el.querySelectorAll('.plane').forEach((el) => {
      const d = el.dataset;
      const kind = el.classList.contains('deco') ? 'deco' : el.classList.contains('copy') ? 'copy' : 'photo';
      planes.push({
        el, kind,
        z: ch.z + Number(d.dz || 0),
        x: Number(d.x || 0), y: Number(d.y || 0),
        xm: Number(d.xm ?? d.x ?? 0), ym: Number(d.ym ?? d.y ?? 0),
        rot: d.ry ? ` perspective(${PERSP}px) rotateY(${d.ry}deg)` : '',
        far: kind === 'copy' ? 1000 : kind === 'deco' ? 900 : 1500,
        back: kind === 'deco' ? 700 : 320,
        o: -1, live: false,
      });
    });
  });

  let narrow = narrowMq.matches;
  let cam = 0;
  let vx = 0, vy = 0, tvx = 0, tvy = 0; // punto di fuga (vw, vh) e suo obiettivo
  let target = 0;
  let current = -1;
  let raf = 0;
  let last = 0;

  function layout() {
    narrow = narrowMq.matches;
    spacer.style.height = `${lastZ / K + innerHeight}px`;
  }

  function opacityFor(p, d) {
    if (d < 0) return Math.max(0, 1 + d / p.back);
    if (d < 180) return 1;
    return Math.max(0, 1 - (d - 180) / p.far);
  }

  function render() {
    for (const p of planes) {
      const d = p.z - cam;
      const o = opacityFor(p, d);
      if (o === 0 && p.o === 0) continue;
      const dz = Math.min(Math.max(d, -p.back - 80), 4200);
      const x = narrow ? p.xm : p.x;
      const y = narrow ? p.ym : p.y;
      // Prospettiva calcolata a mano (scala + posizione verso il punto di fuga):
      // stesso risultato del 3D CSS, ma funziona uguale su Safari iPhone.
      const s = PERSP / (PERSP + dz);
      const tx = x * s + vx * (1 - s);
      const ty = y * s + vy * (1 - s);
      p.el.style.transform = `translate(-50%,-50%) translate(${tx.toFixed(3)}vw,${ty.toFixed(3)}vh) scale(${s.toFixed(4)})${p.rot}`;
      p.el.style.zIndex = String(5000 - Math.round(dz));
      p.el.style.setProperty('--s', s.toFixed(4)); // serve ai cartellini su telefono
      p.el.style.opacity = o.toFixed(3);
      p.o = o;
      // le foto restano cliccabili (e mostrano il cartellino) finché sono nella vetrina davanti
      const live = p.kind === 'copy' ? o > 0.5 && d > -140 && d < 460
        : p.kind === 'photo' && o > 0.6 && d > -140 && d < 720;
      if (live !== p.live) {
        p.live = live;
        p.el.classList.toggle('is-live', live);
      }
    }

    // Mappa finale: arrivando a "Dove siamo" la vista si allontana dal negozio al centro storico
    if (mappa) {
      let u = (cam - (lastZ - 1100)) / 1100;
      u = Math.min(Math.max(u, 0), 1);
      const zoom = 1 + (1 - u) * (1 - u) * 3.2;
      if (mappa._z !== zoom) { mappa._z = zoom; mappa.style.setProperty('--zoom', zoom.toFixed(3)); }
    }

    // Barra di avanzamento tra le vetrine
    if (barra) {
      const v = Math.min(Math.max(cam / lastZ, 0), 1);
      if (barra._v !== v) { barra._v = v; barra.style.transform = `scaleX(${v.toFixed(4)})`; }
    }

    // Cielo: dissolvenza tra l'ora corrente e la successiva a metà tragitto
    let i = 0;
    while (i < chapters.length - 1 && cam >= chapters[i + 1].z) i++;
    const next = chapters[i + 1];
    let t = next ? (cam - chapters[i].z) / (next.z - chapters[i].z) : 0;
    t = Math.min(Math.max((t - 0.2) / 0.6, 0), 1);
    t = t * t * (3 - 2 * t);
    skies.forEach((s, j) => {
      const v = j === i ? 1 : j === i + 1 ? t : 0;
      if (s._o !== v) { s.style.opacity = v; s._o = v; }
    });

    // Vetro appannato che nasconde il cambio di colore a metà del passaggio
    if (velo && velo._t !== t) {
      velo._t = t;
      const v = next ? Math.pow(Math.sin(Math.PI * t), 1.5) * 0.78 : 0;
      velo.style.opacity = v.toFixed(3);
      velo.style.visibility = v > 0.01 ? 'visible' : 'hidden';
    }

    // Chiusura: arrivati in fondo, l'insegna dorata compare per un attimo
    if (chiusura) {
      if (cam >= lastZ - 2 && !chiusura._fatto) {
        chiusura._fatto = true;
        chiusura.classList.add('on');
        clearTimeout(chiusura._t);
        chiusura._t = setTimeout(() => chiusura.classList.remove('on'), 1900);
      } else if (cam < lastZ - 60) {
        chiusura.classList.remove('on');
        if (cam < lastZ - 400) chiusura._fatto = false;
      }
    }

    // Scritta sul vetro d'ingresso: svanisce e si avvicina nei primi passi
    if (ingresso) {
      const e = Math.max(0, 1 - cam / 380);
      if (ingresso._e !== e) {
        ingresso._e = e;
        ingresso.style.opacity = e.toFixed(3);
        ingresso.style.visibility = e ? 'visible' : 'hidden';
        ingresso.style.transform = `scale(${(1 + (1 - e) * 0.3).toFixed(3)})`;
      }
    }

    let near = 0;
    chapters.forEach((c, j) => { if (Math.abs(c.z - cam) < Math.abs(chapters[near].z - cam)) near = j; });
    if (near !== current) setChapter(near, current !== -1);
  }

  function setChapter(i, animate) {
    current = i;
    const ch = chapters[i];
    root.dataset.tone = ch.id;
    // barra del browser su telefono dello stesso colore della vetrina
    if (themeMeta) themeMeta.setAttribute('content', getComputedStyle(root).getPropertyValue('--sky-a').trim());
    navLinks.forEach((a) => {
      if (a.classList.contains('brand')) return;
      if (a.getAttribute('href') === `#${ch.id}`) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
    });
    setClock(ch, animate);
  }

  // Tabellone a palette: 5 caselle, codici più corti centrati ("925" -> " 925 ")
  const GIRO = '0123456789ABCDEFGHILMNORSTUV';
  function setClock(ch, animate) {
    clock.setAttribute('aria-label', `Vetrina: ${ch.label}`);
    const chars = [...ch.code].slice(0, flaps.length);
    const pad = Math.max(0, flaps.length - chars.length);
    const digits = [...Array(Math.ceil(pad / 2)).fill('\u00A0'), ...chars, ...Array(Math.floor(pad / 2)).fill('\u00A0')];
    flaps.forEach((el, k) => {
      const nv = digits[k];
      const ov = el.dataset.v;
      if (nv === ov) return;
      el.dataset.v = nv;
      const nodes = [...el.children];
      const [top, bottom, flipTop, flipBottom] = nodes;
      const put = (node, v) => { node.firstElementChild.textContent = v; };
      const token = (el._token || 0) + 1;
      el._token = token;
      if (!animate) {
        nodes.forEach((n) => put(n, nv));
        el._shown = nv;
        return;
      }
      // Come un tabellone vero: qualche carattere di passaggio prima di quello giusto
      const seq = [];
      const giri = 2 + ((k * 7 + nv.charCodeAt(0)) % 3);
      for (let i = 0; i < giri; i++) seq.push(GIRO[(k * 5 + i * 11 + nv.charCodeAt(0)) % GIRO.length]);
      seq.push(nv);
      let shown = el._shown ?? ov;
      const step = (i) => {
        if (el._token !== token) return;
        const v = seq[i];
        const ultimo = i === seq.length - 1;
        put(top, v); put(bottom, shown); put(flipTop, shown); put(flipBottom, v);
        el.style.setProperty('--dur', ultimo ? '.2s' : '.07s');
        el.style.setProperty('--delay', i === 0 ? `${k * 0.06}s` : '0s');
        el.classList.remove('go');
        void el.offsetWidth;
        el.classList.add('go');
        flipBottom.addEventListener('animationend', () => {
          if (el._token !== token) return;
          shown = v;
          el._shown = v;
          nodes.forEach((n) => put(n, v));
          el.classList.remove('go');
          if (!ultimo) step(i + 1);
        }, { once: true });
      };
      step(0);
    });
  }

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // Decadimento esponenziale: stesso movimento a 30, 60 o 120 fps
    cam += (target - cam) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - cam) < 0.4) cam = target;
    // punto di fuga che segue il cursore, più lento della camera
    const k = 1 - Math.exp(-dt * 3);
    vx += (tvx - vx) * k;
    vy += (tvy - vy) * k;
    if (Math.abs(tvx - vx) < 0.01 && Math.abs(tvy - vy) < 0.01) { vx = tvx; vy = tvy; }
    render();
    if (cam !== target || vx !== tvx || vy !== tvy) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
      const id = chapters[current].id;
      if (Math.abs(chapters[current].z - cam) < 60 && location.hash !== `#${id}`) {
        history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
      }
    }
  }

  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  goTo = (id, { instant = false } = {}) => {
    const ch = byId(id);
    if (!ch) return false;
    target = ch.z;
    window.scrollTo({ top: ch.z / K, behavior: 'instant' });
    if (instant) {
      cam = target;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      render();
    } else {
      wake();
    }
    return true;
  };

  // Brillio: piccole stelle di luce sui punti più luminosi delle foto di gioielli
  const conBrillio = [...document.querySelectorAll('#soglia .zoom, #oro .zoom, #argento .zoom, #vetro .zoom')];
  const puntiLuce = new Map();
  function trovaLuci(img) {
    try {
      const N = 40;
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      const L = (x, y) => { const i = (y * N + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
      const pts = [];
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const l = L(x, y);
        const intorno = (L(x - 1, y) + L(x + 1, y) + L(x, y - 1) + L(x, y + 1)) / 4;
        // luce puntiforme: chiara e più chiara di ciò che ha intorno (non un fondo bianco uniforme)
        if (l > 190 && l - intorno > 18) pts.push([(x + 0.5) / N, (y + 0.5) / N, l - intorno]);
      }
      pts.sort((a, b) => b[2] - a[2]);
      const scelti = [];
      for (const p of pts) {
        if (scelti.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.1)) scelti.push(p);
        if (scelti.length === 6) break;
      }
      return scelti;
    } catch { return []; }
  }
  function brilla() {
    if (document.hidden) return;
    const vivi = conBrillio.filter((b) => b.closest('.plane').classList.contains('is-live'));
    if (!vivi.length) return;
    const b = vivi[Math.floor(Math.random() * vivi.length)];
    const img = b.querySelector('img');
    if (!img.complete || !img.naturalWidth) return;
    if (!puntiLuce.has(img)) puntiLuce.set(img, trovaLuci(img));
    const pts = puntiLuce.get(img);
    if (!pts.length) return;
    const [px, py] = pts[Math.floor(Math.random() * pts.length)];
    // la foto è ritagliata con object-fit: cover, quindi si ricalcola la posizione visibile
    const W = img.offsetWidth, H = img.offsetHeight, w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.max(W / w, H / h);
    const x = (W - w * k) / 2 + px * w * k;
    const y = (H - h * k) / 2 + py * h * k;
    if (x < 6 || y < 6 || x > W - 6 || y > H - 6) return;
    const stella = document.createElement('span');
    stella.className = 'stella';
    stella.style.left = `${x}px`;
    stella.style.top = `${y}px`;
    stella.addEventListener('animationend', () => stella.remove(), { once: true });
    b.append(stella);
  }
  if (!root.classList.contains('calmo')) setInterval(brilla, 850);

  // Luce del cursore sui gioielli e vetrina che si inclina appena
  let mx = 0.5, my = 0.5, lightRaf = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX / innerWidth;
    my = e.clientY / innerHeight;
    if (!lightRaf) lightRaf = requestAnimationFrame(() => {
      lightRaf = 0;
      root.style.setProperty('--mx', mx.toFixed(3));
      root.style.setProperty('--my', my.toFixed(3));
      tvx = (mx - 0.5) * 8;
      tvy = (my - 0.5) * 6;
      wake();
    });
  }, { passive: true });

  addEventListener('scroll', () => {
    target = Math.min(Math.max(scrollY * K, 0), lastZ);
    wake();
  }, { passive: true });

  addEventListener('resize', () => {
    layout();
    target = Math.min(scrollY * K, lastZ);
    for (const p of planes) p.o = -1;
    render();
  });

  navLinks.forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    if (!byId(id)) return;
    e.preventDefault();
    goTo(id);
    history.replaceState(null, '', `#${id}`);
  }));

  // Tastiera: l'elemento che riceve il focus viene portato davanti alla camera
  document.addEventListener('focusin', (e) => {
    const sec = e.target.closest && e.target.closest('.ch');
    if (!sec) return;
    const ch = byId(sec.id);
    if (ch && Math.abs(ch.z - target) > 1) goTo(ch.id);
  });

  addEventListener('hashchange', () => goTo(location.hash.slice(1)));

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  layout();
  const start = byId(decodeURIComponent(location.hash.slice(1)));
  // chi apre direttamente "Dove siamo" non deve vedere la chiusura
  if (chiusura && start && start.z === lastZ) chiusura._fatto = true;
  if (start) goTo(start.id, { instant: true });
  else { window.scrollTo(0, 0); render(); }

  expose();

  function expose() {
    window.rebucci = {
      chapters: chapters.map(({ id, title, code, z }) => ({ id, title, code, z })),
      goTo,
    };
  }
})();
