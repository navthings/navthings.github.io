(function () {
  const { onScroll, clamp, reduce, $$, requestTick } = window.site;

  // the headline streams in a token at a time, the way the models write
  function tokens(ready) {
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
      const mark = el.querySelector("[data-scrib]");
      if (mark) mark.classList.add("drawn");
      return toks;
    }

    let i = 0;
    function next() {
      const t = toks[i++];
      t.classList.add("on");
      if (i < toks.length) setTimeout(next, 38 + t.textContent.length * 11 + (i % 3) * 14);
      else {
        const mark = el.querySelector("[data-scrib]");
        if (mark) setTimeout(() => mark.classList.add("drawn"), 350);
      }
    }

    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.all([Promise.race([fontsReady, new Promise((r) => setTimeout(r, 700))]), ready]).then(() => setTimeout(next, 250));
    return toks;
  }

  // letters in the headline get heavier near the cursor. it thickens them with a stroke in their own colour rather than
  // changing the font weight, so the line keeps its exact spacing and kerning and nothing moves
  function weight() {
    const hero = document.querySelector(".hero");
    const el = document.querySelector("[data-tokens]");
    if (!hero || !el || reduce || !window.site.finePointer) return;
    const now = new WeakMap();
    let letters = [];
    let size = 0;
    let px = 0;
    let py = 0;
    let inside = false;
    let raf = 0;

    // split the tokens into letters, again whenever the temperature has swapped a word
    function collect() {
      size = parseFloat(getComputedStyle(el).fontSize);
      const box = el.getBoundingClientRect();
      letters = [];
      for (const t of $$(".tok", el)) {
        if (!t.querySelector(".lt")) {
          const text = t.textContent;
          t.textContent = "";
          for (const c of text) {
            const sp = document.createElement("span");
            sp.className = "lt";
            sp.textContent = c;
            t.appendChild(sp);
          }
        }
        for (const sp of t.children) {
          const r = sp.getBoundingClientRect();
          letters.push({ sp, x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top });
        }
      }
    }

    function frame() {
      raf = 0;
      const R = size * 1.7;
      let moving = false;
      for (const L of letters) {
        const d = Math.hypot(L.x - px, L.y - py);
        const target = inside && d < R ? (1 - d / R) ** 2 : 0;
        const cur = now.get(L.sp) || 0;
        let next = cur + (target - cur) * 0.2;
        if (Math.abs(target - next) < 0.004) next = target;
        if (next !== target) moving = true;
        if (next === cur) continue;
        now.set(L.sp, next);
        L.sp.style.setProperty("--k", next ? next.toFixed(3) : "");
      }
      if (moving) raf = requestAnimationFrame(frame);
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    hero.addEventListener("pointerenter", () => {
      inside = true;
      collect();
    });
    hero.addEventListener("pointermove", (e) => {
      if (!letters.length || letters.some((L) => !L.sp.isConnected)) collect();
      const box = el.getBoundingClientRect();
      px = e.clientX - box.left;
      py = e.clientY - box.top;
      inside = true;
      kick();
    });
    hero.addEventListener("pointerleave", () => {
      inside = false;
      kick();
    });
    window.addEventListener("resize", () => (letters = []));
  }

  // when someone lands here from outside, or reloads, the logo draws itself and flies into the nav
  function intro() {
    let seen = false;
    try {
      seen = sessionStorage.getItem("intro") === "1";
      sessionStorage.setItem("intro", "1");
    } catch (err) {
      seen = true;
    }
    const target = document.querySelector(".island-mark img");
    const fromHere = document.referrer && document.referrer.startsWith(location.origin);
    const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    const reload = !!nav && nav.type === "reload";
    if (reduce || !target || window.scrollY > 0 || location.hash) return Promise.resolve();
    if (!reload && (seen || fromHere)) return Promise.resolve();

    const root = document.documentElement;
    const veil = document.createElement("div");
    veil.className = "veil";
    veil.innerHTML = '<svg viewBox="66 64 384 378" aria-hidden="true"></svg>';
    const svg = veil.firstChild;
    document.body.appendChild(veil);
    root.classList.add("intro");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    return new Promise((resolve) => {
      let done = false;
      function finish() {
        if (done) return;
        done = true;
        veil.classList.add("gone");
        root.classList.remove("intro");
        setTimeout(() => veil.remove(), 600);
        resolve();
      }
      for (const ev of ["wheel", "keydown", "pointerdown", "touchstart"]) addEventListener(ev, finish, { once: true, passive: true });
      setTimeout(finish, 4000);

      (async () => {
        try {
          const text = await (await fetch(target.src)).text();
          const glyph = new DOMParser().parseFromString(text, "image/svg+xml").querySelector("g");
          svg.innerHTML = glyph.innerHTML;
        } catch (err) {
          console.error("intro mark didnt load", err);
          return finish();
        }
        for (const shape of svg.querySelectorAll("path, circle")) {
          const len = shape.getTotalLength();
          shape.style.strokeDasharray = len;
          shape.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
            duration: 1100,
            easing: "cubic-bezier(0.6, 0, 0.3, 1)",
            fill: "both",
          });
        }
        veil.classList.add("draw");
        await wait(1300);
        if (done) return;

        // land exactly on the glyph inside the nav icon
        const from = svg.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const tx = to.left + (66 / 512) * to.width;
        const ty = to.top + (64 / 512) * to.height;
        const scale = ((384 / 512) * to.width) / from.width;
        svg.style.transform = `translate(${tx - from.left}px, ${ty - from.top}px) scale(${scale})`;
        veil.classList.add("fly");
        root.classList.add("intro-fly");
        await wait(760);
        finish();
        root.classList.remove("intro-fly");
      })();
    });
  }

  // drag the number in the sentence under the hero and the headline samples less likely words, like a model does
  function temperature(toks) {
    const knob = document.getElementById("temp");
    if (!knob || !toks) return;
    const value = knob.querySelector(".knob-v");
    const note = document.getElementById("temp-note");
    if (!window.site.finePointer) note.textContent = ". tap the number.";

    // runs of words in the headline and what a hotter model might say instead
    const GROUPS = [
      [["hi"], [["hey"], ["hello"], ["oi"], ["g'day"]]],
      [["build"], [["train"], ["make"], ["bake"], ["grow"]]],
      [["language"], [["story"], ["chat"], ["word"], ["llama"]]],
      [["models"], [["llamas"], ["parrots"], ["robots"], ["guys"]]],
      [["research"], [["study"], ["poke at"], ["argue about"], ["worry about"]]],
      [["how", "they", "learn"], [["why", "they", "work"], ["what", "they", "know"], ["where", "they", "break"], ["why", "they", "lie"]]],
    ];
    const slots = [];
    for (const [words, alts] of GROUPS) {
      const start = toks.findIndex((el, i) => words.every((w, k) => toks[i + k] && toks[i + k].textContent === w));
      if (start >= 0) slots.push({ els: toks.slice(start, start + words.length), orig: words, alts });
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

    function caption(t) {
      if (t < 0.05) return ", so it always picks the likeliest word.";
      if (t < 0.5) return ", about what lilchat runs at.";
      if (t < 0.85) return ", so it starts picking less likely words.";
      if (t < 1.2) return ", so a lot of words are up for grabs.";
      return ", so its mostly guessing.";
    }

    // one sample per setting, so the headline holds still once you let go
    let t = 0;
    function sample() {
      for (const slot of slots) {
        const chance = t <= 0.3 ? 0 : slot.hot ? clamp((t - 1.1) / 0.4) * 0.6 : clamp((t - 0.3) / 0.9) * 0.85;
        set(slot, Math.random() < chance ? pick(slot.alts, t) : slot.orig);
      }
    }

    function setTemp(v) {
      const next = Math.round(clamp(v, 0, 1.5) * 10) / 10;
      if (next === t && value.textContent === t.toFixed(1)) return;
      t = next;
      value.textContent = t.toFixed(1);
      knob.setAttribute("aria-valuenow", t.toFixed(1));
      knob.classList.toggle("hot", t > 1.1);
      note.textContent = caption(t);
      sample();
    }

    // drag sideways to change it, a plain tap nudges it up
    knob.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      knob.classList.add("held");
      const x0 = e.clientX;
      const t0 = t;
      let moved = false;
      const move = (ev) => {
        if (Math.abs(ev.clientX - x0) > 3) moved = true;
        if (moved) setTemp(t0 + (ev.clientX - x0) / 110);
      };
      const up = () => {
        knob.classList.remove("held");
        knob.removeEventListener("pointermove", move);
        if (!moved) setTemp(t >= 1.5 ? 0 : t + 0.3);
      };
      knob.addEventListener("pointermove", move);
      knob.addEventListener("pointerup", up, { once: true });
      knob.addEventListener("pointercancel", up, { once: true });
    });
    knob.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 0.1, ArrowUp: 0.1, ArrowLeft: -0.1, ArrowDown: -0.1 }[e.key];
      if (step) setTemp(t + step);
      else if (e.key === "Home") setTemp(0);
      else if (e.key === "End") setTemp(1.5);
      else return;
      e.preventDefault();
    });

    // the wiggly underline shows up once the headline has finished typing
    setTimeout(() => knob.classList.add("drawn"), reduce ? 0 : 2600);
  }

  // hero drifts and fades as you leave it
  function heroOut() {
    const inner = document.querySelector(".hero-inner");
    if (!inner || reduce) return;
    onScroll.push((y, vh) => {
      if (y > vh * 1.3) return;
      const p = clamp(y / (vh * 0.6));
      return () => {
        inner.style.transform = `translate3d(0, ${(y * 0.22).toFixed(1)}px, 0) scale(${(1 - p * 0.04).toFixed(4)})`;
        inner.style.opacity = (1 - p).toFixed(3);
      };
    });
  }

  // project cards stack up, the one underneath sinks back a little
  function stack() {
    const cards = $$(".card");
    if (cards.length < 2 || reduce) return;
    let stickyTops = [];
    let sticky = [];
    function measure() {
      stickyTops = cards.map((c) => parseFloat(getComputedStyle(c).top) || 0);
      sticky = cards.map((c) => getComputedStyle(c).position === "sticky");
    }
    measure();
    window.addEventListener("resize", measure);

    // a plain overlay per card, so darkening one doesn't restyle everything inside it
    const shades = cards.map((card) => {
      const shade = document.createElement("span");
      shade.className = "card-shade";
      shade.setAttribute("aria-hidden", "true");
      card.appendChild(shade);
      return shade;
    });

    onScroll.push((y, vh) => {
      const tops = cards.map((c) => c.getBoundingClientRect().top);
      return () => {
        for (let i = 0; i < cards.length - 1; i++) {
          if (!sticky[i]) {
            cards[i].style.transform = "";
            shades[i].style.opacity = "0";
            continue;
          }
          const p = clamp((vh - tops[i + 1]) / (vh - stickyTops[i + 1]));
          cards[i].style.transform = p > 0 ? `scale(${(1 - p * 0.05).toFixed(4)})` : "";
          shades[i].style.opacity = (p * 0.05).toFixed(3);
        }
      };
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

  // hovering a post shows its first line in a little card that trails the cursor
  function peek() {
    const rows = $$("[data-peek]");
    if (!rows.length || !window.site.finePointer) return;
    const card = document.createElement("div");
    card.className = "peek";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = '<span class="cap"></span><p></p>';
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
        label.textContent = row.querySelector(".cap").textContent + " · " + row.querySelector(".kind").textContent;
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

  temperature(tokens(intro()));
  heroOut();
  weight();
  stack();
  chat();
  peek();
  ask();
  requestTick();
})();
