(function () {
  const { onScroll, clamp, reduce, $$, requestTick } = window.site;

  // the headline streams in a token at a time, the way the models write
  function tokens() {
    const el = document.querySelector("[data-tokens]");
    if (!el) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const toks = [];

    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      const words = node.textContent.split(/(\s+)/);
      for (const word of words) {
        if (!word) continue;
        if (/^\s+$/.test(word)) {
          frag.appendChild(document.createTextNode(" "));
          continue;
        }
        const chunk = document.createElement("span");
        chunk.className = "chunk";
        for (const piece of word.match(/[A-Za-z0-9]+|'[a-z]+|[^A-Za-z0-9]/g)) {
          const t = document.createElement("span");
          t.className = "tok";
          t.textContent = piece;
          chunk.appendChild(t);
          toks.push(t);
        }
        frag.appendChild(chunk);
      }
      node.replaceWith(frag);
    }

    if (reduce) {
      toks.forEach((t) => t.classList.add("on"));
      return toks;
    }

    const caret = document.createElement("span");
    caret.className = "caret";
    caret.setAttribute("aria-hidden", "true");

    let i = 0;
    function next() {
      const t = toks[i++];
      t.classList.add("on");
      t.after(caret);
      if (i < toks.length) setTimeout(next, 38 + t.textContent.length * 11 + (i % 3) * 14);
      else setTimeout(() => caret.classList.add("gone"), 1800);
    }

    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 700))]).then(() => setTimeout(next, 250));
    return toks;
  }

  // drag the temperature and the headline starts sampling less likely words, the way a model does
  function temperature(toks) {
    const input = document.getElementById("temp");
    if (!input || !toks) return;
    const out = document.getElementById("temp-out");
    const note = document.getElementById("temp-note");
    const hint = note.textContent;

    const ALT = {
      hi: ["hey", "hello", "oi", "g'day"],
      train: ["build", "teach", "grow", "bake", "raise"],
      small: ["tiny", "little", "smol", "pocket", "large"],
      language: ["story", "chat", "word", "llama"],
      models: ["llamas", "robots", "parrots", "guys"],
    };
    const slots = toks
      .filter((el) => ALT[el.textContent])
      .map((el) => ({ els: [el], orig: [el.textContent], alts: ALT[el.textContent].map((a) => [a]) }));
    const from = toks.find((el) => el.textContent === "from");
    const scratch = toks.find((el) => el.textContent === "scratch");
    if (from && scratch) {
      slots.push({ els: [from, scratch], orig: ["from", "scratch"], alts: [["by", "hand"], ["from", "zero"], ["on", "a mac"], ["in", "melbourne"]] });
    }
    const stop = toks[toks.length - 1];
    if (stop && stop.textContent === ".") slots.push({ els: [stop], orig: ["."], alts: [["!"], ["?"], ["!!"]], hot: true });

    // lower temperature keeps to the first, likelier alternatives
    function pick(alts, t) {
      const w = alts.map((_, k) => Math.exp(-k / (t * 1.6)));
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let k = 0; k < w.length; k++) if ((r -= w[k]) <= 0) return alts[k];
      return alts[alts.length - 1];
    }

    function set(slot, words) {
      slot.els.forEach((el, i) => {
        if (el.textContent === words[i]) return;
        el.textContent = words[i];
        el.classList.remove("re");
        void el.offsetWidth;
        el.classList.add("re");
      });
    }

    function sample(t) {
      for (const slot of slots) {
        const chance = slot.hot ? clamp((t - 1.1) / 0.4) * 0.6 : clamp((t - 0.3) / 0.9) * 0.85;
        set(slot, Math.random() < chance ? pick(slot.alts, t) : slot.orig);
      }
    }

    function caption(t) {
      if (t < 0.05) return "always picks the most likely word";
      if (t < 0.5) return "about what lilchat runs at";
      if (t < 0.85) return "starting to get creative";
      if (t < 1.2) return "confidently wrong, like lilchat";
      return "its just making stuff up now";
    }

    let timer = 0;
    function loop() {
      const t = parseFloat(input.value);
      clearTimeout(timer);
      if (t <= 0.3) {
        slots.forEach((slot) => set(slot, slot.orig));
        return;
      }
      sample(t);
      timer = setTimeout(loop, 1250 - t * 520);
    }

    input.addEventListener("input", () => {
      const t = parseFloat(input.value);
      out.textContent = t.toFixed(1);
      note.textContent = caption(t);
      input.style.setProperty("--fill", ((t / 1.5) * 100).toFixed(1) + "%");
      input.classList.toggle("hot", t > 1.1);
      if (!timer || t <= 0.3) loop();
    });
    input.addEventListener("change", loop);
    input.addEventListener("dblclick", () => {
      input.value = 0;
      input.dispatchEvent(new Event("input"));
    });
    note.dataset.hint = hint;
  }

  // hero drifts and fades as you leave it
  function heroOut() {
    const inner = document.querySelector(".hero-inner");
    if (!inner || reduce) return;
    onScroll.push((y, vh) => {
      if (y > vh * 1.3) return;
      const p = clamp(y / (vh * 0.6));
      inner.style.transform = `translate3d(0, ${(y * 0.22).toFixed(1)}px, 0) scale(${(1 - p * 0.04).toFixed(4)})`;
      inner.style.opacity = (1 - p).toFixed(3);
    });
  }

  // one dot per million params, filled in as you scroll from lilstory to sprout
  function scale() {
    const sec = document.querySelector(".scale");
    if (!sec) return;
    const grid = sec.querySelector(".dots");
    const num = sec.querySelector("#scale-n");
    const stages = $$(".stage", sec);
    const names = $$(".steps span", sec);
    const bar = sec.querySelector(".steps .bar");
    const end = sec.querySelector(".scale-end");

    const VALUES = [8.2, 50, 297, 523];
    const AT = [0.1, 0.34, 0.58, 0.82];
    const COUNT = 528;

    const frag = document.createDocumentFragment();
    const dots = [];
    for (let i = 0; i < COUNT; i++) {
      const d = document.createElement("i");
      d.className = "dot";
      frag.appendChild(d);
      dots.push(d);
    }
    grid.appendChild(frag);

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    function at(p) {
      if (p <= AT[0]) return { v: VALUES[0] * ease(p / AT[0]), stage: 0 };
      for (let i = 1; i < AT.length; i++) {
        if (p > AT[i]) continue;
        const hold = AT[i - 1] + (AT[i] - AT[i - 1]) * 0.4;
        if (p <= hold) return { v: VALUES[i - 1], stage: i - 1 };
        return { v: VALUES[i - 1] + (VALUES[i] - VALUES[i - 1]) * ease((p - hold) / (AT[i] - hold)), stage: i };
      }
      return { v: VALUES[3], stage: 3 };
    }

    const state = new Array(COUNT).fill("");
    let lastStage = -1;
    let lastShown = "";

    onScroll.push((y, vh) => {
      const r = sec.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 1.5) return;
      const p = clamp(-r.top / (r.height - vh));
      const { v, stage } = at(p);
      const filled = Math.floor(v + 0.001);

      for (let i = 0; i < COUNT; i++) {
        const want = i < filled ? (stage === 3 && i >= VALUES[2] ? "dot hot" : "dot on") : "dot";
        if (state[i] !== want) {
          dots[i].className = want;
          state[i] = want;
        }
      }

      const shown = v < 10 ? v.toFixed(1) : String(Math.round(v));
      if (shown !== lastShown) {
        num.textContent = shown;
        lastShown = shown;
      }

      if (stage !== lastStage) {
        stages.forEach((s, i) => s.classList.toggle("on", i === stage));
        names.forEach((s, i) => s.classList.toggle("on", i === stage));
        const target = names[stage];
        bar.style.width = target.offsetWidth + "px";
        bar.style.transform = `translateX(${target.offsetLeft}px)`;
        bar.style.background = stage === 3 ? "var(--accent)" : "";
        lastStage = stage;
      }
      end.classList.toggle("on", p > 0.9);
    });
  }

  // project cards stack up, the one underneath sinks back a little
  function stack() {
    const cards = $$(".card");
    if (cards.length < 2 || reduce) return;
    let tops = [];
    let sticky = [];
    function measure() {
      tops = cards.map((c) => parseFloat(getComputedStyle(c).top) || 0);
      sticky = cards.map((c) => getComputedStyle(c).position === "sticky");
    }
    measure();
    window.addEventListener("resize", measure);

    onScroll.push((y, vh) => {
      for (let i = 0; i < cards.length - 1; i++) {
        const card = cards[i];
        if (!sticky[i]) {
          card.style.transform = "";
          card.style.removeProperty("--dim");
          continue;
        }
        const r = cards[i + 1].getBoundingClientRect();
        const p = clamp((vh - r.top) / (vh - tops[i + 1]));
        card.style.transform = p > 0 ? `scale(${(1 - p * 0.05).toFixed(4)})` : "";
        card.style.setProperty("--dim", (p * 0.05).toFixed(3));
      }
    });
  }

  // the lilchat card plays back a real conversation once it's on screen
  function chat() {
    const box = document.querySelector("[data-chat]");
    if (!box) return;
    const card = box.closest("[data-live]");
    const bubbles = $$(".bubble", box);
    const note = box.querySelector(".chat-note");
    const texts = bubbles.map((b) => b.textContent);

    if (reduce) {
      bubbles.forEach((b) => b.classList.add("on"));
      note.classList.add("on");
      return;
    }
    bubbles.forEach((b) => b.classList.contains("bot") && (b.textContent = ""));

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function play() {
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        if (b.classList.contains("you")) {
          await wait(i ? 700 : 300);
          b.classList.add("on");
          continue;
        }
        await wait(350);
        b.innerHTML = '<span class="dots3"><i></i><i></i><i></i></span>';
        b.classList.add("on");
        await wait(900);
        const words = texts[i].split(" ");
        b.textContent = "";
        for (let w = 0; w < words.length; w++) {
          b.textContent += (w ? " " : "") + words[w];
          await wait(55 + words[w].length * 12);
        }
      }
      await wait(500);
      note.classList.add("on");
    }

    card.addEventListener("live", play, { once: true });
  }

  // quotes you can grab and throw, with a bit of weight to them
  function board() {
    const el = document.querySelector("[data-board]");
    if (!el) return;
    const bodies = $$(".quote", el).map((c, k) => {
      c.style.setProperty("--k", k);
      const home = { x: +c.dataset.x, y: +c.dataset.y, r: +c.dataset.r };
      return { c, home, x: 0, y: 0, r: home.r, vx: 0, vy: 0, vr: 0, w: 0, h: 0, held: false };
    });
    let W = 0;
    let H = 0;
    let z = 10;
    let raf = 0;

    const place = (b) => {
      b.c.style.translate = `${b.x.toFixed(1)}px ${b.y.toFixed(1)}px`;
      b.c.style.rotate = `${b.r.toFixed(2)}deg`;
    };
    const goHome = (b) => {
      b.x = b.home.x * Math.max(0, W - b.w);
      b.y = b.home.y * Math.max(0, H - b.h);
      b.r = b.home.r;
      b.vx = b.vy = b.vr = 0;
      place(b);
    };

    function measure(first) {
      W = el.clientWidth;
      H = el.clientHeight;
      for (const b of bodies) {
        b.w = b.c.offsetWidth;
        b.h = b.c.offsetHeight;
        if (first) goHome(b);
        b.x = clamp(b.x, 0, Math.max(0, W - b.w));
        b.y = clamp(b.y, 0, Math.max(0, H - b.h));
        place(b);
      }
    }

    function step() {
      raf = 0;
      let moving = false;
      for (const b of bodies) {
        if (b.held) {
          moving = true;
          continue;
        }
        if (Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.vr) < 0.04) continue;
        moving = true;
        b.x += b.vx;
        b.y += b.vy;
        b.r = clamp(b.r + b.vr, -20, 20);
        b.vx *= 0.94;
        b.vy *= 0.94;
        b.vr *= 0.9;
        const maxX = Math.max(0, W - b.w);
        const maxY = Math.max(0, H - b.h);
        if (b.x < 0 || b.x > maxX) {
          b.x = clamp(b.x, 0, maxX);
          b.vx *= -0.5;
          b.vr += b.vy * 0.05;
        }
        if (b.y < 0 || b.y > maxY) {
          b.y = clamp(b.y, 0, maxY);
          b.vy *= -0.5;
          b.vr -= b.vx * 0.05;
        }
        place(b);
      }
      if (moving) raf = requestAnimationFrame(step);
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    for (const b of bodies) {
      b.c.addEventListener("pointerdown", (e) => {
        if (e.button > 0) return;
        e.preventDefault();
        b.c.setPointerCapture(e.pointerId);
        b.held = true;
        b.vx = b.vy = b.vr = 0;
        b.c.classList.add("held");
        b.c.style.zIndex = ++z;
        const ox = e.clientX - b.x;
        const oy = e.clientY - b.y;
        let lx = e.clientX;
        let ly = e.clientY;
        let lt = performance.now();

        const move = (ev) => {
          const now = performance.now();
          const dt = Math.max(8, now - lt);
          b.vx = b.vx * 0.5 + ((ev.clientX - lx) / dt) * 8;
          b.vy = b.vy * 0.5 + ((ev.clientY - ly) / dt) * 8;
          lx = ev.clientX;
          ly = ev.clientY;
          lt = now;
          b.x = clamp(ev.clientX - ox, -b.w * 0.3, W - b.w * 0.7);
          b.y = clamp(ev.clientY - oy, -b.h * 0.3, H - b.h * 0.7);
          b.r = clamp(b.r + (ev.movementX || 0) * 0.08, -24, 24);
          place(b);
        };
        const up = () => {
          b.held = false;
          b.c.classList.remove("held");
          b.c.removeEventListener("pointermove", move);
          if (reduce || performance.now() - lt > 90) b.vx = b.vy = 0;
          b.vr = b.vx * 0.12;
          kick();
        };
        b.c.addEventListener("pointermove", move);
        b.c.addEventListener("pointerup", up, { once: true });
        b.c.addEventListener("pointercancel", up, { once: true });
        kick();
      });
    }

    el.querySelector("[data-tidy]").addEventListener("click", () => {
      el.classList.add("tidying");
      bodies.forEach((b) => {
        b.c.style.zIndex = "";
        goHome(b);
      });
      setTimeout(() => el.classList.remove("tidying"), 950);
    });

    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        el.classList.add("in");
        seen.disconnect();
      },
      { threshold: 0.3 }
    );
    seen.observe(el);
    measure(true);
    new ResizeObserver(() => measure(false)).observe(el);
    if (document.fonts) document.fonts.ready.then(() => measure(false));
  }

  // hovering a post shows its first line in a little card that trails the cursor
  function peek() {
    const rows = $$("[data-peek]");
    if (!rows.length || !window.site.finePointer) return;
    const card = document.createElement("div");
    card.className = "peek";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = '<span class="mono"></span><p></p>';
    document.body.appendChild(card);
    const label = card.querySelector("span");
    const text = card.querySelector("p");
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let on = false;

    function frame() {
      const dx = tx - x;
      x += dx * 0.18;
      y += (ty - y) * 0.18;
      const tilt = clamp(dx * 0.08, -6, 6);
      card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
      raf = on || Math.abs(dx) > 0.5 ? requestAnimationFrame(frame) : 0;
    }

    for (const row of rows) {
      row.addEventListener("pointerenter", (e) => {
        if (!on) {
          x = tx = e.clientX + 32;
          y = ty = e.clientY + 30;
        }
        on = true;
        label.textContent = row.querySelector(".mono").textContent + " · " + row.querySelector(".kind").textContent;
        text.textContent = row.dataset.peek;
        card.classList.add("on");
        if (!raf) raf = requestAnimationFrame(frame);
      });
      row.addEventListener("pointermove", (e) => {
        tx = e.clientX + 32;
        ty = e.clientY + 30;
      });
      row.addEventListener("pointerleave", () => {
        on = false;
        card.classList.remove("on");
      });
    }
    window.addEventListener("scroll", () => {
      if (!on) return;
      on = false;
      card.classList.remove("on");
    }, { passive: true });
  }

  // the playground form swaps its placeholder to whatever the chosen model is good at
  function ask() {
    const form = document.querySelector("[data-ask]");
    if (!form) return;
    const input = form.querySelector("input[name=q]");
    for (const radio of $$("input[name=model]", form)) {
      radio.addEventListener("change", () => {
        input.placeholder = radio.dataset.placeholder;
      });
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const model = form.querySelector("input[name=model]:checked").value;
      const q = input.value.trim();
      window.location.href = "playground/?model=" + model + (q ? "&q=" + encodeURIComponent(q) : "");
    });
  }

  temperature(tokens());
  heroOut();
  scale();
  stack();
  chat();
  board();
  peek();
  ask();
  requestTick();
})();
