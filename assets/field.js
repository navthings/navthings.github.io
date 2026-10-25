(function () {
  const canvas = document.querySelector(".field");
  const readout = document.querySelector(".temp-readout b");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const RAMP = " ..::--==+*#";
  const NOISE = "abcdefghijklmnopqrstuvwxyz0123456789";
  const LEVELS = 8;
  const CW = 9;
  const CH = 15;

  let cols = 0;
  let rows = 0;
  let seed = new Float32Array(0);
  let heat = new Float32Array(0);
  let ink = [17, 17, 17];
  let accent = [255, 79, 0];
  let start = performance.now();
  let last = 0;
  let raf = 0;
  let mouse = null;
  let shownTemp = -1;
  let calm = false;

  function hex(v) {
    const h = v.trim().replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function colours() {
    const css = getComputedStyle(root);
    ink = hex(css.getPropertyValue("--ink") || "#111");
    accent = hex(css.getPropertyValue("--accent") || "#ff4f00");
  }

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = "top";
    cols = Math.ceil(innerWidth / CW);
    rows = Math.ceil(innerHeight / CH);
    seed = new Float32Array(cols * rows).map(() => Math.random());
    heat = new Float32Array(cols * rows);
  }

  // smooth bands that drift, cheap enough to evaluate per cell every frame
  function field(x, y, t) {
    const a = Math.sin(x * 0.085 + t * 0.28 + Math.sin(y * 0.07 - t * 0.17) * 1.9);
    const b = Math.sin(x * 0.045 - y * 0.09 + t * 0.21 + Math.cos(x * 0.03 + t * 0.09) * 2.2);
    return Math.min(1, Math.max(0, 0.42 + a * 0.26 + b * 0.26));
  }

  // annealing: temperature falls like a loss curve over the first couple of seconds
  const tempAt = (s) => (reduce ? 0 : Math.exp(-s / 0.75));

  function draw(now) {
    const s = (now - start) / 1000;
    const T = tempAt(s);
    const t = reduce ? 3 : s;
    const buckets = Array.from({ length: LEVELS }, () => []);
    const hot = [];
    let peak = T;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const h = heat[i];
        if (h > 0.01) heat[i] = h * 0.93;
        else heat[i] = 0;
        const local = Math.max(T, h);
        if (h > peak) peak = h;

        // a cell is still noisy while the temperature is above its own threshold
        if (local > seed[i] * 0.92 + 0.04) {
          const ch = NOISE[(Math.random() * NOISE.length) | 0];
          if (h > 0.55) hot.push(c, r, ch, h);
          else buckets[Math.min(LEVELS - 1, (local * LEVELS) | 0)].push(c, r, ch);
          continue;
        }
        const v = field(c, r, t);
        const k = (v * RAMP.length) | 0;
        if (k <= 0) continue;
        buckets[Math.min(LEVELS - 1, (v * LEVELS) | 0)].push(c, r, RAMP[Math.min(RAMP.length - 1, k)]);
      }
    }

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let l = 0; l < LEVELS; l++) {
      const list = buckets[l];
      if (!list.length) continue;
      ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${(0.05 + (l / LEVELS) * 0.2).toFixed(3)})`;
      for (let j = 0; j < list.length; j += 3) ctx.fillText(list[j + 2], list[j] * CW, list[j + 1] * CH);
    }
    for (let j = 0; j < hot.length; j += 4) {
      ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${Math.min(0.9, hot[j + 3]).toFixed(3)})`;
      ctx.fillText(hot[j + 2], hot[j] * CW, hot[j + 1] * CH);
    }

    calm = peak < 0.01;
    const shown = Math.round(Math.min(1, peak) * 100) / 100;
    if (readout && shown !== shownTemp) {
      shownTemp = shown;
      readout.textContent = shown.toFixed(2);
    }
  }

  function loop(now) {
    raf = 0;
    if (document.hidden || document.body.classList.contains("viewing")) return;
    // 30fps while anything is hot, 15 once it has settled, so a fanless laptop stays cool
    if (now - last > (calm ? 66 : 33)) {
      last = now;
      draw(now);
    }
    if (!reduce) raf = requestAnimationFrame(loop);
  }

  function wake() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  // the cursor is heat: cells near it scramble, then cool back into the pattern
  function warm(x, y, amount) {
    const cx = x / CW;
    const cy = y / CH;
    const R = 5;
    for (let r = Math.max(0, (cy - R) | 0); r <= Math.min(rows - 1, (cy + R) | 0); r++) {
      for (let c = Math.max(0, (cx - R * 1.6) | 0); c <= Math.min(cols - 1, (cx + R * 1.6) | 0); c++) {
        const dx = (c - cx) / 1.6;
        const dy = r - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        const i = r * cols + c;
        heat[i] = Math.min(1, heat[i] + amount * (1 - d / R));
      }
    }
    wake();
  }

  addEventListener("pointermove", (e) => {
    if (reduce) return;
    const speed = mouse ? Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y) : 0;
    mouse = { x: e.clientX, y: e.clientY };
    warm(e.clientX, e.clientY, Math.min(0.5, speed / 60));
  }, { passive: true });

  addEventListener("pointerdown", (e) => {
    if (reduce || e.target.closest("a, button")) return;
    warm(e.clientX, e.clientY, 1);
  }, { passive: true });

  addEventListener("resize", () => {
    size();
    if (reduce) draw(performance.now());
  });
  document.addEventListener("visibilitychange", wake);

  // redraw in the right ink when the theme flips, and stop while a view is open
  new MutationObserver(() => {
    colours();
    wake();
    if (reduce) draw(performance.now());
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    colours();
    wake();
  });

  colours();
  size();
  start = performance.now();
  if (reduce) draw(start);
  else wake();
})();
