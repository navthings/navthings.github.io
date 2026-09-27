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
  ask();
  requestTick();
})();
