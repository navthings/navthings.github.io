(function () {
  const root = document.querySelector("[data-digits]");
  if (!root) return;
  const pad = root.querySelector(".pad canvas");
  const seen = root.querySelector(".seen canvas");
  const guess = root.querySelector(".guess b");
  const guessNote = root.querySelector(".guess span");
  const hiddenDots = Array.from(root.querySelectorAll(".hidden i"));
  const bars = Array.from(root.querySelectorAll(".outs li"));
  const hint = root.querySelector(".pad p");
  const ctx = pad.getContext("2d");
  const seenCtx = seen.getContext("2d");

  let W1, B1, W2, B2;
  let loading = null;
  let samples = null;
  let nextSample = 0;
  let real = false;

  // same layout as the python lists: 32x784 hidden weights, 32 biases, 10x32 output weights, 10 biases
  function load() {
    if (!loading) {
      loading = fetch(root.dataset.digits)
        .then((r) => {
          if (!r.ok) throw new Error("weights " + r.status);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const f = new Float32Array(buf);
          W1 = f.subarray(0, 32 * 784);
          B1 = f.subarray(32 * 784, 32 * 784 + 32);
          W2 = f.subarray(32 * 784 + 32, 32 * 784 + 32 + 320);
          B2 = f.subarray(32 * 784 + 32 + 320);
        })
        .catch((err) => {
          console.error("couldnt load the digit weights", err);
          guessNote.textContent = "couldnt load the weights";
          loading = null;
        });
    }
    return loading;
  }

  new IntersectionObserver(
    (entries, io) => {
      if (entries[0].isIntersecting) {
        load();
        io.disconnect();
      }
    },
    { rootMargin: "600px 0px" }
  ).observe(root);

  // the drawing surface keeps a real pixel size so strokes stay sharp
  function fit() {
    const size = pad.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (pad.width === Math.round(size * dpr)) return;
    pad.width = pad.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearPad();
  }

  function clearPad() {
    real = false;
    ctx.clearRect(0, 0, pad.width, pad.height);
    seenCtx.clearRect(0, 0, 28, 28);
    hint.hidden = false;
    guess.textContent = "?";
    guessNote.textContent = "its guess";
    hiddenDots.forEach((d) => (d.style.opacity = ""));
    bars.forEach((li) => {
      li.style.setProperty("--v", 0);
      li.classList.remove("top");
    });
  }

  let drawing = false;
  let last = null;
  let mid = null;
  let queued = false;

  function point(e) {
    const r = pad.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (real) clearPad();
    pad.setPointerCapture(e.pointerId);
    load();
    drawing = true;
    hint.hidden = true;
    last = mid = point(e);
    const s = pad.clientWidth;
    ctx.lineWidth = s * 0.075;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = ctx.fillStyle = "#0f0f0f";
    ctx.beginPath();
    ctx.arc(last[0], last[1], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    schedule();
  });

  // smooth the stroke through midpoints so it looks like a pen, not a polyline
  pad.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = point(e);
    const m = [(last[0] + p[0]) / 2, (last[1] + p[1]) / 2];
    ctx.beginPath();
    ctx.moveTo(mid[0], mid[1]);
    ctx.quadraticCurveTo(last[0], last[1], m[0], m[1]);
    ctx.stroke();
    last = p;
    mid = m;
    schedule();
  });

  const end = () => {
    if (!drawing) return;
    drawing = false;
    schedule();
  };
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (W1) run();
      else load().then(() => W1 && run());
    });
  }

  // turn the drawing into what mnist looks like: fit in 20x20, then centre by mass in 28x28
  function toInput() {
    const w = pad.width;
    const data = ctx.getImageData(0, 0, w, w).data;
    let x0 = w, y0 = w, x1 = -1, y1 = -1;
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const scale = 20 / Math.max(bw, bh);

    // shrink in halves first, one big jump down to 20px turns thin strokes into noise
    let src = pad;
    let sx = x0, sy = y0, sw = bw, sh = bh;
    while (Math.max(sw, sh) > 40) {
      const tmp = document.createElement("canvas");
      tmp.width = Math.max(1, Math.round(sw / 2));
      tmp.height = Math.max(1, Math.round(sh / 2));
      const t = tmp.getContext("2d");
      t.imageSmoothingQuality = "high";
      t.drawImage(src, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
      src = tmp;
      sx = sy = 0;
      sw = tmp.width;
      sh = tmp.height;
    }
    const tw = Math.max(1, Math.round(bw * scale));
    const th = Math.max(1, Math.round(bh * scale));
    const fitted = document.createElement("canvas");
    fitted.width = tw;
    fitted.height = th;
    const f = fitted.getContext("2d");
    f.imageSmoothingQuality = "high";
    f.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
    const fd = f.getImageData(0, 0, tw, th).data;

    let mass = 0, cx = 0, cy = 0;
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const a = fd[(y * tw + x) * 4 + 3] / 255;
        mass += a;
        cx += a * x;
        cy += a * y;
      }
    }
    cx /= mass || 1;
    cy /= mass || 1;
    const ox = Math.round(14 - cx);
    const oy = Math.round(14 - cy);

    const input = new Float32Array(784);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx > 27 || ty > 27) continue;
        input[ty * 28 + tx] = fd[(y * tw + x) * 4 + 3] / 255;
      }
    }
    return input;
  }

  const sigmoid = (v) => 1 / (1 + Math.exp(-v));

  function forward(x) {
    const h = new Float32Array(32);
    for (let j = 0; j < 32; j++) {
      let s = B1[j];
      const row = j * 784;
      for (let i = 0; i < 784; i++) s += W1[row + i] * x[i];
      h[j] = sigmoid(s);
    }
    const o = new Float32Array(10);
    for (let k = 0; k < 10; k++) {
      let s = B2[k];
      for (let j = 0; j < 32; j++) s += W2[k * 32 + j] * h[j];
      o[k] = sigmoid(s);
    }
    return { h, o };
  }

  function run(x = toInput(), answer) {
    if (!x) return clearPad();
    const { h, o } = forward(x);

    const img = seenCtx.createImageData(28, 28);
    for (let i = 0; i < 784; i++) {
      const v = 255 - Math.round(x[i] * 240);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    seenCtx.putImageData(img, 0, 0);

    hiddenDots.forEach((d, j) => (d.style.opacity = (0.08 + h[j] * 0.92).toFixed(3)));
    let best = 0;
    for (let k = 1; k < 10; k++) if (o[k] > o[best]) best = k;
    bars.forEach((li, k) => {
      li.style.setProperty("--v", o[k].toFixed(3));
      li.classList.toggle("top", k === best);
    });
    guess.textContent = best;
    if (answer !== undefined) guessNote.textContent = (best === answer ? "right, its a " : "wrong, its a ") + answer;
    else guessNote.textContent = o[best] > 0.5 ? "it thinks" : "not sure, but maybe";
  }

  // real digits from the mnist test set it never trained on, a few of them ones it gets wrong
  function showReal() {
    if (!samples) {
      samples = fetch(realBtn.dataset.real)
        .then((r) => {
          if (!r.ok) throw new Error("samples " + r.status);
          return r.arrayBuffer();
        })
        .then((buf) => new Uint8Array(buf));
    }
    Promise.all([load(), samples])
      .then(([, data]) => {
        if (!W1) return;
        const k = nextSample++ % (data.length / 785);
        const answer = data[k * 785];
        const px = data.subarray(k * 785 + 1, (k + 1) * 785);

        const tmp = document.createElement("canvas");
        tmp.width = tmp.height = 28;
        const t = tmp.getContext("2d");
        const img = t.createImageData(28, 28);
        px.forEach((v, i) => {
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 15;
          img.data[i * 4 + 3] = v;
        });
        t.putImageData(img, 0, 0);
        clearPad();
        const size = pad.clientWidth;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(tmp, 0, 0, size, size);
        hint.hidden = true;
        real = true;
        run(Float32Array.from(px, (v) => v / 255), answer);
      })
      .catch((err) => {
        console.error("couldnt load the test digits", err);
        guessNote.textContent = "couldnt load them";
        samples = null;
      });
  }

  const realBtn = root.querySelector("[data-real]");
  realBtn.addEventListener("click", showReal);
  root.querySelector("[data-clear]").addEventListener("click", clearPad);
  new ResizeObserver(fit).observe(pad);
})();
