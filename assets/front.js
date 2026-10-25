(function () {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const home = $("#home");
  const view = $("#view");
  const viewTitle = $(".view-title");
  const viewBody = $(".view-body");
  const viewName = $(".view-name");
  const preview = $(".preview");
  const card = $(".preview-card");

  // perth time, shown when you hover the place

  const clock = $(".clock-time");
  const fmt = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Perth", hour: "numeric", minute: "2-digit" });
  const tickClock = () => (clock.textContent = fmt.format(new Date()).toLowerCase().replace(/\s/g, " "));
  tickClock();
  setInterval(tickClock, 15000);

  // first visit: the bio streams in a token at a time, then the rest settles

  function stream() {
    const bio = $("[data-stream]");
    let first = true;
    try {
      first = sessionStorage.getItem("streamed") !== "1";
      sessionStorage.setItem("streamed", "1");
    } catch (err) {
      first = false;
    }
    if (!first || reduce) return 0;

    const walker = document.createTreeWalker(bio, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(".secret-fill") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const toks = [];
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const piece of node.textContent.split(/(\s+)/)) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) {
          frag.appendChild(document.createTextNode(" "));
          continue;
        }
        for (const bit of piece.match(/[A-Za-z0-9]+|[^A-Za-z0-9]/g)) {
          const t = document.createElement("span");
          t.className = "tok";
          t.textContent = bit;
          frag.appendChild(t);
          toks.push(t);
        }
      }
      node.replaceWith(frag);
    }

    bio.removeAttribute("data-in");
    let at = 420;
    toks.forEach((t, i) => {
      setTimeout(() => t.classList.add("on"), at);
      at += 14 + t.textContent.length * 5 + (i % 3) * 6;
    });
    return at;
  }

  function enter() {
    const total = stream();
    if (total) for (const el of $$(".sections [data-in], .elsewhere")) el.style.setProperty("--d0", total * 0.75 + "ms");
    frame().then(() => home.classList.add("in"));
  }

  // previews: one card that slides along beside the row you're on

  const tpl = $("#t-previews").content;
  const tilts = [-1.6, 1.2, -0.6, 1.8, -1.2, 0.8];
  let shown = null;
  let hideTimer = 0;

  function fill(pv) {
    const src = tpl.querySelector(`[data-for="${pv}"]`);
    if (!src) return false;
    const el = src.cloneNode(true);
    el.classList.add("pv");
    card.classList.toggle("is-stack", el.classList.contains("stack"));
    for (const img of $$("img[data-src]", el)) {
      img.addEventListener("load", () => img.classList.add("ready"), { once: true });
      img.addEventListener("error", () => console.error("preview image didnt load", img.dataset.src), { once: true });
      img.src = img.dataset.src;
    }
    $$(".toks span", el).forEach((s, i) => s.style.setProperty("--n", i));
    const grid = $(".grid28", el);
    if (grid) drawDigit(grid);
    card.replaceChildren(el);
    card.classList.remove("swap");
    void card.offsetWidth;
    card.classList.add("swap");
    frame().then(() => {
      if (card.firstChild !== el) return;
      el.classList.add("play");
      countUp(el);
    });
    return true;
  }

  function countUp(el) {
    const n = $("[data-count]", el);
    if (!n) return;
    const to = Number(n.dataset.count);
    if (reduce) return (n.textContent = to);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 900);
      n.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1 && card.contains(n)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // a hand drawn 2, inked a pixel at a time
  const DIGIT = [
    "..............",
    "....#####.....",
    "...##...##....",
    "..........##..",
    "..........##..",
    ".........##...",
    "........##....",
    ".......##.....",
    "......##......",
    ".....##.......",
    "....##........",
    "...##.........",
    "...#########..",
    "..............",
  ];

  function drawDigit(grid) {
    const cells = [];
    DIGIT.join("").split("").forEach((c) => {
      const i = document.createElement("i");
      grid.appendChild(i);
      if (c === "#") cells.push(i);
    });
    cells.forEach((c, k) => setTimeout(() => c.classList.add("ink"), reduce ? 0 : 200 + k * 28));
  }

  function showPreview(row) {
    if (!hover) return;
    clearTimeout(hideTimer);
    const pv = row.dataset.pv;
    if (shown === pv) return;
    if (!fill(pv)) return hidePreview();
    const index = $$(".row", viewBody).indexOf(row);
    const top = row.getBoundingClientRect().top - preview.getBoundingClientRect().top;
    const offset = card.classList.contains("is-stack") ? -6 : -14;
    card.style.setProperty("--y", Math.max(0, top + offset) + "px");
    card.style.setProperty("--r", tilts[index % tilts.length] * 0.5 + "deg");
    preview.classList.add("on");
    shown = pv;
  }

  function hidePreview() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      preview.classList.remove("on");
      shown = null;
    }, 120);
  }

  viewBody.addEventListener("pointerover", (e) => {
    const row = e.target.closest(".row");
    if (row) showPreview(row);
  });
  viewBody.addEventListener("pointerleave", hidePreview);
  viewBody.addEventListener("focusin", (e) => {
    const row = e.target.closest(".row");
    if (row) showPreview(row);
  });
  viewBody.addEventListener("focusout", (e) => {
    if (!viewBody.contains(e.relatedTarget)) hidePreview();
  });

  // views: work, writing and playground open in place, with real urls so back works

  const SECTIONS = { work: "work", writing: "writing", playground: "playground" };
  const ALIASES = { play: "playground", sprout: "work", blog: "writing" };
  const labels = Object.fromEntries($$(".sections a").map((a) => [a.dataset.section, a.querySelector(".label")]));
  let current = null;

  const fromHash = () => {
    const h = location.hash.slice(1);
    return SECTIONS[h] ? h : ALIASES[h] || null;
  };

  // only one element can carry each transition name, so the word that flies is set right before each swap
  function markLabel(key) {
    for (const l of Object.values(labels)) l.style.viewTransitionName = "";
    if (key && labels[key]) labels[key].style.viewTransitionName = "title";
  }

  function render(key) {
    clearTimeout(hideTimer);
    preview.classList.remove("on");
    shown = null;
    if (!key) {
      view.hidden = true;
      home.hidden = false;
      home.classList.add("in");
      document.title = "nav";
    } else {
      viewTitle.textContent = SECTIONS[key];
      viewBody.replaceChildren($("#t-" + key).content.cloneNode(true));
      $$(".view-head, .group h3, .row, .aside", view).forEach((el, k) => el.style.setProperty("--k", k));
      home.hidden = true;
      view.hidden = false;
      document.title = SECTIONS[key] + " · nav";
    }
    current = key;
    window.scrollTo(0, 0);
  }

  function go(key, { animate = true } = {}) {
    if (key === current) return;
    const leaving = current;
    markLabel(key || leaving);
    if (!animate || reduce || !document.startViewTransition) {
      render(key);
      if (animate && key) {
        view.classList.remove("arriving");
        void view.offsetWidth;
        view.classList.add("arriving");
      }
    } else {
      document.startViewTransition(() => render(key));
    }
    if (key) requestAnimationFrame(() => viewTitle.focus({ preventScroll: true }));
    else if (leaving && labels[leaving]) requestAnimationFrame(() => labels[leaving].parentElement.focus({ preventScroll: true }));
  }

  for (const a of $$(".sections a")) {
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
      e.preventDefault();
      const key = a.dataset.section;
      history.pushState({ view: key }, "", "#" + key);
      go(key);
    });
  }

  function goHome(e) {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0)) return;
    if (e) e.preventDefault();
    if (!current) return;
    if (history.state && history.state.view) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      go(null);
    }
  }

  viewName.addEventListener("click", goHome);
  $(".name a").addEventListener("click", (e) => {
    if (!current) e.preventDefault();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) goHome();
  });
  addEventListener("popstate", () => go(fromHash()));

  // the secret: "make stuff up" downloads tale and it writes a story right under the bio

  const secret = $(".secret");
  const story = $(".story");
  const storyText = $(".story-text");
  const storyNote = $(".story-note");
  const again = $(".story-again");
  const done = $(".story-close");
  const START = "Once upon a time";

  const ENGINE = "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/index.js";
  const WASM = { default: "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/wasm/wllama.wasm" };
  const COMPAT = "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.6.1/wasm/";
  const UA = navigator.userAgent;
  const WEBKIT = /iPhone|iPad|iPod/.test(UA) || (/Safari/.test(UA) && !/Chrome|Chromium|Edg|Android/.test(UA));

  let llm = null;
  let busy = false;
  let aborter = null;

  async function load() {
    const { Wllama } = await import(ENGINE);
    const w = new Wllama(WASM, { suppressNativeLog: true });
    // safari passes the memory64 check but cant run that build
    if (WEBKIT) {
      const base = w.getWorkerResources.bind(w);
      w.getWorkerResources = () => ({ ...base(), wasmPath: COMPAT + "wllama.wasm", jsPath: COMPAT + "wllama.js", compat: true });
    }
    await w.loadModelFromUrl("https://huggingface.co/navthings/tale/resolve/main/tale-q8_0.gguf", {
      n_ctx: 384,
      progressCallback: ({ loaded, total }) => {
        if (!total) return;
        const p = Math.round((loaded / total) * 100);
        secret.style.setProperty("--p", p + "%");
        storyNote.textContent = "downloading tale, " + p + "% of 52mb";
      },
    });
    return w;
  }

  function caret() {
    const c = document.createElement("span");
    c.className = "caret";
    return c;
  }

  async function tell() {
    if (busy) return;
    busy = true;
    again.hidden = true;
    done.hidden = true;
    story.classList.add("open");
    const out = document.createElement("span");
    const head = document.createElement("span");
    head.style.color = "var(--ink-3)";
    head.textContent = START;
    storyText.replaceChildren(head, out, caret());

    if (!llm) {
      secret.classList.add("busy");
      storyNote.textContent = "downloading tale, 52mb";
      try {
        llm = await load();
      } catch (err) {
        console.error("tale didnt load", err);
        secret.classList.remove("busy");
        secret.style.setProperty("--p", "0%");
        storyText.replaceChildren("it couldnt load here. your browser might not have the memory for it.");
        storyNote.textContent = "";
        again.textContent = "try again";
        again.hidden = false;
        done.hidden = false;
        busy = false;
        return;
      }
      secret.classList.remove("busy");
      secret.classList.add("done");
      again.textContent = "another one";
    }

    storyNote.textContent = "tale, 52mb, running on your computer";
    aborter = new AbortController();
    let text = "";
    try {
      await llm.createCompletion({
        prompt: START,
        stream: true,
        abortSignal: aborter.signal,
        max_tokens: 140,
        temperature: 0.8,
        temp: 0.8,
        top_k: 40,
        penalty_repeat: 1.1,
        penalty_last_n: 64,
        onData: (chunk) => {
          const piece = chunk.choices && chunk.choices[0] ? chunk.choices[0].text : "";
          if (!piece) return;
          text += piece;
          out.textContent = text;
        },
      });
    } catch (err) {
      if (!aborter.signal.aborted) {
        console.error("tale stopped", err);
        storyNote.textContent = "it stopped halfway, sorry";
      }
    }

    // end on a full sentence if it got cut off
    const end = text.lastIndexOf(".");
    if (end > 40) out.textContent = text.slice(0, end + 1);
    storyText.lastChild.remove();
    busy = false;
    if (story.classList.contains("open")) {
      again.hidden = false;
      done.hidden = false;
    }
  }

  secret.addEventListener("click", tell);
  again.addEventListener("click", tell);
  done.addEventListener("click", () => {
    if (aborter) aborter.abort();
    story.classList.remove("open");
  });

  // leaving for a post or case study: the clicked title carries its name so it flies into that page
  viewBody.addEventListener("click", (e) => {
    const row = e.target.closest(".row[data-vt]");
    if (!row || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    row.querySelector(".t").style.viewTransitionName = row.dataset.vt;
  });

  // coming back from one: the title flies home into its row (a page from the back cache still has the name from the click)
  addEventListener("pagereveal", (e) => {
    const fromUrl = (window.navigation && navigation.activation && navigation.activation.from && navigation.activation.from.url) || document.referrer;
    if (!e.viewTransition || !fromUrl || !fromUrl.startsWith(location.origin)) return;
    const from = new URL(fromUrl).pathname.split("/").slice(-2).join("/");
    const row = viewBody.querySelector(`.row[href$="${from}"][data-vt]`);
    if (row) row.querySelector(".t").style.viewTransitionName = row.dataset.vt;
  });

  // start wherever the url says
  const startKey = fromHash();
  if (startKey) {
    render(startKey);
    frame().then(() => home.classList.add("in"));
  } else {
    current = null;
    enter();
  }
  markLabel(null);
})();
