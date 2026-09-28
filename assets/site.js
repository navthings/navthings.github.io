const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// one scroll loop for everything that follows the page position
const onScroll = [];
let lenis = null;
let ticking = false;

// handlers measure first and can hand back a function that writes, so reads and writes never interleave
function tick() {
  ticking = false;
  const y = window.scrollY;
  const vh = window.innerHeight;
  const writes = [];
  for (const fn of onScroll) {
    const write = fn(y, vh);
    if (typeof write === "function") writes.push(write);
  }
  for (const write of writes) write();
}

function requestTick() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(tick);
  }
}

if (!reduce && window.Lenis && !document.body.hasAttribute("data-native-scroll")) {
  lenis = new window.Lenis({ autoRaf: true, lerp: 0.11 });
  lenis.on("scroll", tick);
} else {
  window.addEventListener("scroll", requestTick, { passive: true });
}
window.addEventListener("resize", requestTick);

function scrollToTarget(target) {
  if (lenis) lenis.scrollTo(target, { offset: typeof target === "number" ? 0 : -88, duration: 1.4 });
  else if (typeof target === "number") window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
  else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
}

// squircles: smooth corners as a clip-path, recomputed whenever the box changes size
function squirclePath(w, h, r, s, corners) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const budget = Math.min(w, h) / 2;

  function corner(on) {
    if (!on || !r) return { p: 0 };
    const cr = Math.min(r, budget);
    let sm = s;
    let p = (1 + sm) * cr;
    if (p > budget) {
      sm = Math.max(0, budget / cr - 1);
      p = budget;
    }
    const arcLen = Math.sin(rad((90 * (1 - sm)) / 2)) * cr * Math.SQRT2;
    const alpha = (90 - 90 * (1 - sm)) / 2;
    const c = cr * Math.tan(rad(alpha / 2)) * Math.cos(rad(45 * sm));
    const d = c * Math.tan(rad(45 * sm));
    const b = (p - arcLen - c - d) / 3;
    return { p, a: 2 * b, b, c, d, arcLen, r: cr };
  }

  const [tl, tr, br, bl] = corners.map(corner);
  const f = (n) => Math.round(n * 100) / 100;
  let d = `M ${f(tl.p)} 0 L ${f(w - tr.p)} 0`;
  if (tr.r) d += ` c ${f(tr.a)} 0 ${f(tr.a + tr.b)} 0 ${f(tr.a + tr.b + tr.c)} ${f(tr.d)} a ${f(tr.r)} ${f(tr.r)} 0 0 1 ${f(tr.arcLen)} ${f(tr.arcLen)} c ${f(tr.d)} ${f(tr.c)} ${f(tr.d)} ${f(tr.b + tr.c)} ${f(tr.d)} ${f(tr.a + tr.b + tr.c)}`;
  d += ` L ${f(w)} ${f(h - br.p)}`;
  if (br.r) d += ` c 0 ${f(br.a)} 0 ${f(br.a + br.b)} ${f(-br.d)} ${f(br.a + br.b + br.c)} a ${f(br.r)} ${f(br.r)} 0 0 1 ${f(-br.arcLen)} ${f(br.arcLen)} c ${f(-br.c)} ${f(br.d)} ${f(-(br.b + br.c))} ${f(br.d)} ${f(-(br.a + br.b + br.c))} ${f(br.d)}`;
  d += ` L ${f(bl.p)} ${f(h)}`;
  if (bl.r) d += ` c ${f(-bl.a)} 0 ${f(-(bl.a + bl.b))} 0 ${f(-(bl.a + bl.b + bl.c))} ${f(-bl.d)} a ${f(bl.r)} ${f(bl.r)} 0 0 1 ${f(-bl.arcLen)} ${f(-bl.arcLen)} c ${f(-bl.d)} ${f(-bl.c)} ${f(-bl.d)} ${f(-(bl.b + bl.c))} ${f(-bl.d)} ${f(-(bl.a + bl.b + bl.c))}`;
  d += ` L 0 ${f(tl.p)}`;
  if (tl.r) d += ` c 0 ${f(-tl.a)} 0 ${f(-(tl.a + tl.b))} ${f(tl.d)} ${f(-(tl.a + tl.b + tl.c))} a ${f(tl.r)} ${f(tl.r)} 0 0 1 ${f(tl.arcLen)} ${f(-tl.arcLen)} c ${f(tl.c)} ${f(-tl.d)} ${f(tl.b + tl.c)} ${f(-tl.d)} ${f(tl.a + tl.b + tl.c)} ${f(-tl.d)}`;
  return d + " Z";
}

const squircleObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const el = entry.target;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) continue;
    const r = parseFloat(getComputedStyle(el).getPropertyValue("--r")) || 28;
    const which = el.dataset.sq || "";
    const corners = which === "top" ? [1, 1, 0, 0] : which === "bottom" ? [0, 0, 1, 1] : [1, 1, 1, 1];
    el.style.clipPath = `path("${squirclePath(w, h, r, 0.6, corners)}")`;
    el.dataset.sqDone = "";
  }
});

const nativeSquircles = window.CSS && CSS.supports("corner-shape", "squircle");

function squircles(root = document) {
  if (nativeSquircles) return;
  for (const el of $$(".sq", root)) squircleObserver.observe(el);
}

// wrap every word in a span so it can be animated on its own, leaving inline elements alone
function splitWords(el) {
  let i = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement.closest("[data-atom]")) continue;
    const parts = node.textContent.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(" "));
        continue;
      }
      const span = document.createElement("span");
      span.className = "w";
      span.style.setProperty("--i", i++);
      span.textContent = part;
      frag.appendChild(span);
    }
    node.replaceWith(frag);
  }
  for (const atom of $$("[data-atom]", el)) {
    atom.classList.add("w");
    atom.style.setProperty("--i", i++);
  }
  return i;
}

// reveals
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      el.classList.add("in");
      revealObserver.unobserve(el);
      // once it has arrived, hand transitions back to the element's own hover styles
      if (el.hasAttribute("data-reveal")) {
        const delay = parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0;
        const settle = () =>
          document.documentElement.classList.contains("intro")
            ? setTimeout(settle, 400)
            : setTimeout(() => el.removeAttribute("data-reveal"), delay * 1000 + 1200);
        settle();
      }
    }
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
);

function reveals(root = document) {
  for (const group of $$("[data-stagger]", root)) {
    const step = parseFloat(group.dataset.stagger) || 0.07;
    const base = parseFloat(getComputedStyle(group).getPropertyValue("--d")) || 0;
    $$(":scope > [data-reveal]", group).forEach((child, i) => {
      child.style.setProperty("--d", (base + i * step).toFixed(2) + "s");
    });
  }
  for (const el of $$("[data-words]", root)) splitWords(el);
  for (const el of $$("[data-reveal], [data-words]", root)) revealObserver.observe(el);
}

// big titles rise letter by letter on a fresh load, and stay put when a page transition already carried them in
function letters() {
  const els = $$("[data-letters]");
  if (!els.length || reduce) return;
  for (const el of els) {
    const text = el.textContent.trim();
    const read = document.createElement("span");
    read.className = "sr";
    read.textContent = text;
    const shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    const count = text.replace(/\s/g, "").length;
    const step = Math.min(34, 720 / count);
    let i = 0;
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        shown.appendChild(document.createTextNode(" "));
        continue;
      }
      const w = document.createElement("span");
      w.className = "lw";
      for (const ch of part) {
        const l = document.createElement("span");
        l.className = "l";
        l.style.transitionDelay = Math.round(80 + i++ * step) + "ms";
        l.textContent = ch;
        w.appendChild(l);
      }
      shown.appendChild(w);
    }
    el.textContent = "";
    el.append(read, shown);
  }
  // on a transition the reveal can come after this script, so wait for it before deciding
  const root = document.documentElement;
  const go = () => {
    if (root.classList.contains("vt-in")) return;
    els.forEach((el) => el.classList.add("rise"));
    // make the browser settle the hidden state first, or there is nothing to transition from
    getComputedStyle(els[0].querySelector(".l")).transform;
    const show = () => els.forEach((el) => el.classList.add("in"));
    // the first visit logo intro may be about to cover the page, so rise once it has gone
    setTimeout(() => {
      if (!root.classList.contains("intro")) return show();
      const watch = new MutationObserver(() => {
        if (root.classList.contains("intro")) return;
        watch.disconnect();
        show();
      });
      watch.observe(root, { attributes: true, attributeFilter: ["class"] });
    });
  };
  if (!("onpagereveal" in window) || root.matches(".revealed, .vt-in")) go();
  else addEventListener("pagereveal", go, { once: true });
}

// big statements that fill in word by word as you scroll through them
function scrubs() {
  for (const el of $$(".scrub")) {
    const count = splitWords(el);
    const words = $$(".w", el);
    let last = -1;
    onScroll.push((y, vh) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -vh || rect.top > vh * 2) return;
      const p = clamp((vh * 0.82 - rect.top) / (rect.height + vh * 0.3));
      const lit = p * (count + 2);
      if (Math.abs(lit - last) < 0.01) return;
      last = lit;
      return () =>
        words.forEach((w, i) => {
          w.style.opacity = (0.14 + 0.86 * clamp(lit - i)).toFixed(3);
        });
    });
  }
}

// things that lean towards the cursor when it comes near, and spring back when it leaves or lands on them
const leaners = [];
function leanOn(el, R, pull, mx, my) {
  if (el) leaners.push({ el, R, pull, mx, my, tx: 0, ty: 0 });
}
function lean() {
  if (!finePointer || reduce) return;
  leanOn(document.querySelector(".nav .island"), 150, 0.12, 14, 9);
  for (const el of $$(".card-go")) leanOn(el, 120, 0.2, 12, 8);
  if (!leaners.length) return;
  let x = -1e4;
  let y = -1e4;
  let raf = 0;
  function frame() {
    raf = 0;
    // read every rect first, then write, so one move costs one layout
    const rects = leaners.map((L) => L.el.getBoundingClientRect());
    leaners.forEach((L, i) => {
      const r = rects[i];
      // where it sits at rest, so leaning never changes what counts as near
      const dx = x - (r.left + r.width / 2 - L.tx);
      const dy = y - (r.top + r.height / 2 - L.ty);
      const d = Math.hypot(Math.max(Math.abs(dx) - r.width / 2, 0), Math.max(Math.abs(dy) - r.height / 2, 0));
      const f = d > 0 && d < L.R ? (1 - d / L.R) ** 1.5 : 0;
      const nx = clamp(dx * L.pull * f, -L.mx, L.mx);
      const ny = clamp(dy * L.pull * f, -L.my, L.my);
      if (Math.abs(nx - L.tx) < 0.1 && Math.abs(ny - L.ty) < 0.1) return;
      L.tx = nx;
      L.ty = ny;
      L.el.style.translate = nx || ny ? `${nx.toFixed(1)}px ${ny.toFixed(1)}px` : "";
    });
  }
  addEventListener(
    "pointermove",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    { passive: true }
  );
  document.documentElement.addEventListener("pointerleave", () => {
    x = y = -1e4;
    if (!raf) raf = requestAnimationFrame(frame);
  });
}

// a quick rubbery squash while something is pressed, springing back when it is let go
function squash(el, sx = 1.04, sy = 0.9) {
  if (!el || reduce || !el.animate) return;
  let held = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    held = el.animate([{ scale: "1 1" }, { scale: `${sx} ${sy}` }], { duration: 110, easing: "ease-out", fill: "forwards" });
  });
  const release = () => {
    if (!held) return;
    held.cancel();
    held = null;
    el.animate([{ scale: `${sx} ${sy}` }, { scale: `${2 - sx * 1.02} ${1 + (1 - sy) * 0.35}`, offset: 0.45 }, { scale: "1 1" }], { duration: 460, easing: "ease-out" });
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointerleave", release);
  el.addEventListener("pointercancel", release);
}

function squashes() {
  squash(document.querySelector(".nav .island"));
  for (const el of $$(".btn, .say")) squash(el, 1.03, 0.9);
  // links that squash hold the page change for a moment so the spring back plays out instead of getting cut off
  if (reduce) return;
  for (const a of $$(".nav .island a[href], a.btn[href]")) {
    a.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (!/^https?:$/.test(url.protocol)) return;
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      setTimeout(() => (location.href = url.href), 240);
    });
  }
}

// a small note drops out of the bottom of the pill like a droplet, hangs there, then gets pulled back in.
// the liquid neck comes from a goo filter on a layer of plain shapes behind the real pill, so no text gets blurred
let drop = () => {};
function droplets() {
  const bar = document.querySelector(".nav");
  const pill = bar && bar.querySelector(".island");
  if (!pill) return;
  const NS = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(NS, "svg");
  defs.setAttribute("class", "goo-defs");
  defs.setAttribute("aria-hidden", "true");
  defs.innerHTML =
    '<filter id="goo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" /><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" /></filter>';
  document.body.appendChild(defs);
  const goo = document.createElement("div");
  goo.className = "goo";
  goo.setAttribute("aria-hidden", "true");
  const base = document.createElement("i");
  const blob = document.createElement("i");
  goo.append(base, blob);
  const note = document.createElement("p");
  note.className = "drop-note";
  note.setAttribute("role", "status");
  bar.prepend(goo);
  bar.appendChild(note);
  let timer = 0;

  drop = (text) => {
    clearTimeout(timer);
    for (const an of [...blob.getAnimations(), ...note.getAnimations()]) an.cancel();
    const nb = bar.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    const cs = getComputedStyle(pill);
    const bottom = p.bottom - nb.top;
    note.textContent = text;
    note.style.cssText = `left:${p.left + p.width / 2 - nb.left}px; top:${bottom + 10}px; color:${cs.color}`;
    if (reduce || !blob.animate) {
      note.style.background = cs.backgroundColor;
      note.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 1800 });
      return;
    }
    goo.style.color = cs.backgroundColor;
    base.style.cssText = `left:${p.left - nb.left + 3}px; top:${p.top - nb.top + 3}px; width:${p.width - 6}px; height:${p.height - 6}px`;
    blob.style.left = p.left + p.width / 2 - nb.left + "px";
    blob.style.top = bottom + "px";
    const W = note.offsetWidth;
    const frames = [
      { width: "14px", height: "14px", transform: "translate(-50%, -18px)" },
      { width: "22px", height: "22px", transform: "translate(-50%, -6px)", offset: 0.3 },
      { width: "20px", height: "26px", transform: "translate(-50%, 9px)", offset: 0.55 },
      { width: `${W * 1.08}px`, height: "26px", transform: "translate(-50%, 12px)", offset: 0.8 },
      { width: `${W}px`, height: "30px", transform: "translate(-50%, 10px)" },
    ];
    goo.classList.add("on");
    blob.animate(frames, { duration: 680, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "forwards" });
    note.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 500, fill: "forwards" });
    timer = setTimeout(() => {
      note.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" });
      const reversed = frames.map((f, i) => ({ ...f, offset: 1 - (f.offset ?? i / (frames.length - 1)) })).reverse();
      const back = blob.animate(reversed, { duration: 560, delay: 60, easing: "cubic-bezier(0.55, 0, 0.75, 0.3)", fill: "forwards" });
      back.finished.then(() => goo.classList.remove("on"), () => {});
    }, 2000);
  };
}

// selected text gets a highlighter stroke instead of the flat block. the real selection is still there, just see-through
function highlighter() {
  if (!window.getSelection) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "hl");
  svg.setAttribute("aria-hidden", "true");
  document.body.appendChild(svg);
  document.documentElement.classList.add("hl-on");

  // a marker stroke a little past each end of the line, slightly slanted, with a soft wobble along its edges
  function stroke(x, y, w, h) {
    const seed = Math.round(x) * 7.1 + Math.round(y) * 13.7;
    const rnd = (k) => {
      const v = Math.sin(seed + k * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    const t = y + h * 0.16;
    const b = y + h * 0.94;
    const x0 = x - 3 - rnd(1) * 2;
    const x1 = x + w + 2 + rnd(2) * 3;
    const mid = (x0 + x1) / 2;
    const tilt = (rnd(3) - 0.5) * 3;
    const wob = (k) => (rnd(k) - 0.5) * 2.4;
    const p = document.createElementNS(NS, "path");
    p.setAttribute(
      "d",
      `M${x0.toFixed(1)} ${(t + tilt).toFixed(1)} Q${mid.toFixed(1)} ${(t - 1 + wob(4)).toFixed(1)} ${x1.toFixed(1)} ${(t - tilt + wob(5)).toFixed(1)} ` +
        `L${(x1 + 1.5).toFixed(1)} ${(b - tilt).toFixed(1)} Q${mid.toFixed(1)} ${(b + 1 + wob(6)).toFixed(1)} ${(x0 + 1).toFixed(1)} ${(b + tilt + wob(7)).toFixed(1)} Z`
    );
    return p;
  }

  let raf = 0;
  function draw() {
    raf = 0;
    const sel = getSelection();
    const a = document.activeElement;
    const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    // form fields and the jump menu keep the normal selection
    if (!sel.rangeCount || sel.isCollapsed || (a && a.matches("input, textarea")) || (node && node.closest(".jump"))) {
      if (svg.firstChild) svg.replaceChildren();
      return;
    }
    const lines = [];
    for (let i = 0; i < sel.rangeCount; i++) {
      for (const r of sel.getRangeAt(i).getClientRects()) {
        if (r.width < 2 || r.height < 4) continue;
        const line = lines.find((l) => Math.abs(l.top + l.bottom - r.top - r.bottom) < Math.min(l.bottom - l.top, r.height));
        if (line) {
          line.left = Math.min(line.left, r.left);
          line.right = Math.max(line.right, r.right);
          line.top = Math.min(line.top, r.top);
          line.bottom = Math.max(line.bottom, r.bottom);
        } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
    }
    svg.replaceChildren(...lines.map((l) => stroke(l.left + scrollX, l.top + scrollY, l.right - l.left, l.bottom - l.top)));
  }
  const redraw = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };
  document.addEventListener("selectionchange", redraw);
  addEventListener("resize", redraw);
  // sticky and pinned things move against the page while scrolling
  onScroll.push(() => {
    if (svg.firstChild) redraw();
  });
}

// buttons lean towards the cursor a little
function magnetic() {
  if (!finePointer || reduce) return;
  for (const el of $$(".btn, [data-magnetic]")) {
    const pull = parseFloat(el.dataset.magnetic) || 0.22;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * pull}px, ${y * pull * 1.3}px)`;
      const inner = el.querySelector(".inner");
      if (inner) inner.style.transform = `translate(${x * pull * 0.5}px, ${y * pull * 0.6}px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
      const inner = el.querySelector(".inner");
      if (inner) inner.style.transform = "";
    });
  }
}

// the nav is one pill: it shows which part of the page you're in and opens into the menu
function nav() {
  const bar = document.querySelector(".nav");
  const el = bar && bar.querySelector(".island");
  if (!el) return;
  const now = el.querySelector(".island-now");
  const links = el.querySelector(".island-links");
  const foot = document.querySelector(".foot");
  const sheet = document.querySelector(".sheet");
  const fallback = bar.dataset.label || "navthings";
  const current = bar.dataset.current || "";
  // the menu gets a way into the jump menu too, labelled for the keyboard people actually have
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const k = document.createElement("button");
  k.type = "button";
  k.className = "island-k";
  k.textContent = finePointer ? (mac ? "⌘K" : "ctrl K") : "find";
  k.setAttribute("aria-label", "jump to a page");
  k.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(false);
    openJump();
  });
  links.appendChild(k);
  // on a keyboard, the closed pill shows the shortcut so people know it exists
  const kbd = document.createElement("kbd");
  kbd.className = "island-kbd";
  kbd.setAttribute("aria-hidden", "true");
  kbd.textContent = k.textContent;
  if (finePointer) el.appendChild(kbd);
  const anchors = $$("a, button", links);
  anchors.forEach((a, i) => a.style.setProperty("--i", i));
  const labelled = $$("[data-label]").filter((n) => n !== bar && n !== foot);
  let label = null;
  let open = false;
  let mini = false;
  let closeTimer = 0;

  function size() {
    const text = now.querySelector("span:not(.out)");
    const closed = 50 + (text ? text.offsetWidth : 0) + (kbd.isConnected ? 18 + kbd.offsetWidth + 12 : 20);
    const opened = 44 + links.offsetWidth + 8;
    el.style.setProperty("--w", Math.round(open ? opened : mini ? 46 : closed) + "px");
  }

  // scrolling down fast tucks the pill down to just the logo, and any scroll back up brings it out again
  function setMini(v) {
    if (v === mini) return;
    mini = v;
    el.classList.toggle("mini", v);
    size();
  }

  function setLabel(text) {
    if (text === label) return;
    const first = label === null;
    if (first) now.textContent = "";
    label = text;
    const span = document.createElement("span");
    span.textContent = text;
    for (const old of $$("span:not(.out)", now)) {
      if (first || reduce) old.remove();
      else {
        old.classList.add("out");
        setTimeout(() => old.remove(), 420);
      }
    }
    if (!first && !reduce) span.classList.add("in");
    now.appendChild(span);
    for (const a of anchors) a.classList.toggle("on", a.textContent === text || a.textContent === current);
    size();
  }

  function setOpen(v) {
    clearTimeout(closeTimer);
    if (v === open) return;
    open = v;
    if (v) setMini(false);
    el.classList.toggle("open", v);
    size();
  }

  el.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && setOpen(true));
  el.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") closeTimer = setTimeout(() => setOpen(false), 160);
  });
  el.addEventListener("focusin", () => setOpen(true));
  el.addEventListener("focusout", (e) => !el.contains(e.relatedTarget) && setOpen(false));
  // on touch the first tap opens it, links only work once it is open
  el.addEventListener("click", (e) => {
    if (!open && !e.target.closest(".island-mark")) {
      e.preventDefault();
      setOpen(true);
    }
  });
  document.addEventListener("pointerdown", (e) => !el.contains(e.target) && setOpen(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));

  setLabel(fallback);
  new ResizeObserver(size).observe(links);
  requestAnimationFrame(() => el.classList.add("ready"));
  if (document.fonts) document.fonts.ready.then(size);

  let lastY = window.scrollY;
  let prevY = window.scrollY;
  let down = 0;
  let up = 0;
  onScroll.push((y, vh) => {
    const dy = y - prevY;
    prevY = y;
    if (dy > 0) {
      down += dy;
      up = 0;
    } else if (dy < 0) {
      up -= dy;
      down = 0;
    }
    let text = fallback;
    for (const n of labelled) {
      if (n.getBoundingClientRect().top < vh * 0.4) text = n.dataset.label;
      else break;
    }
    // the footer is sticky and always sits behind the sheet, so go by how much the sheet has uncovered
    const uncovered = sheet ? vh - sheet.getBoundingClientRect().bottom : 0;
    if (foot && foot.dataset.label && uncovered > vh * 0.45) text = foot.dataset.label;
    const hovered = el.matches(":hover");

    const tuck = mini ? !(up > 24 || y < 160) : dy > 9 && down > 140 && y > 300;
    return () => {
      setLabel(text);
      el.classList.toggle("light", !!foot && uncovered > vh - 40);
      if (!reduce) setMini(tuck && !open && !hovered);
      if (open && Math.abs(y - lastY) > 60 && !hovered) setOpen(false);
      if (!open) lastY = y;
    };
  });

  for (const a of $$("a[href^='#']")) {
    a.addEventListener("click", (e) => {
      const target = document.getElementById(a.hash.slice(1));
      if (!target) return;
      e.preventDefault();
      setOpen(false);
      scrollToTarget(target);
      history.replaceState(null, "", a.hash);
    });
  }
}

// copy the email instead of opening a mail app, same as before
// the old word lifts out and the new one rises into its place
async function roll(el, text) {
  if (reduce || !el.animate) {
    el.textContent = text;
    return;
  }
  const out = el.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(-0.4em)", opacity: 0 }], { duration: 140, easing: "ease-in", fill: "forwards" });
  await out.finished;
  el.textContent = text;
  out.cancel();
  el.animate([{ transform: "translateY(0.4em)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(0.2, 0.7, 0.1, 1)" });
}

function email() {
  for (const el of $$("[data-email]")) {
    const label = el.querySelector(".inner") || el;
    const original = label.textContent;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      if (!navigator.clipboard) {
        window.location.href = "mailto:navneet.dagdiya@gmail.com";
        return;
      }
      navigator.clipboard.writeText("navneet.dagdiya@gmail.com").then(
        () => {
          drop("copied");
          if (el.closest(".nav")) return;
          roll(label, "copied.");
          setTimeout(() => roll(label, original), 1800);
        },
        () => {
          window.location.href = "mailto:navneet.dagdiya@gmail.com";
        }
      );
    });
  }
}

// the hand drawn mark in the footer draws itself as the footer comes into view
async function footer() {
  const foot = document.querySelector(".foot");
  if (!foot) return;
  for (const b of $$("[data-top]")) b.addEventListener("click", () => scrollToTarget(0));

  const mark = foot.querySelector("[data-mark]");
  const icon = document.querySelector(".island-mark img");
  if (!mark || !icon) return;
  try {
    const svg = await (await fetch(icon.src)).text();
    const glyph = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("g");
    if (!glyph) return;
    mark.innerHTML = glyph.innerHTML;
  } catch (err) {
    console.error("couldnt load the footer mark", err);
    return;
  }

  const shapes = $$("path, circle", mark);
  const lengths = shapes.map((s) => s.getTotalLength());
  shapes.forEach((s, i) => {
    s.style.strokeDasharray = lengths[i];
    s.style.strokeDashoffset = reduce ? 0 : lengths[i];
  });
  if (reduce) return;

  const sheet = document.querySelector(".sheet");
  onScroll.push((y, vh) => {
    const uncovered = vh - sheet.getBoundingClientRect().bottom;
    if (uncovered <= 0) return;
    const p = clamp(uncovered / foot.offsetHeight);
    const draw = clamp((p - 0.2) / 0.6);
    return () => {
      shapes.forEach((s, i) => {
        s.style.strokeDashoffset = (lengths[i] * (1 - draw)).toFixed(1);
      });
      mark.style.setProperty("--fill", clamp((draw - 0.7) / 0.3).toFixed(3));
    };
  });
  requestTick();
}

// anything marked data-live gets .live once most of it is on screen
function lives() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("live");
        entry.target.dispatchEvent(new CustomEvent("live"));
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.35 }
  );
  for (const el of $$("[data-live]")) io.observe(el);
}

// the same curve as --ease, so a number can land exactly when its bar does
function bezier(x1, y1, x2, y2) {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

// numbers count up as they arrive, the ones on bars ride along with their bar
function counters() {
  if (reduce) return;
  const ease = bezier(0.2, 0.7, 0.1, 1);
  const els = $$(".hbar em, .cs-meta dd, .specs dd").filter((el) => !el.children.length && /^\d/.test(el.textContent.trim()));
  const info = new Map();
  for (const el of els) {
    const text = el.textContent;
    const m = text.match(/\d[\d,]*(?:\.\d+)?/);
    const decimals = (m[0].split(".")[1] || "").length;
    const commas = m[0].includes(",");
    const fmt = (v) => {
      const n = commas ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals);
      return text.slice(0, m.index) + n + text.slice(m.index + m[0].length);
    };
    info.set(el, { text, fmt, target: parseFloat(m[0].replace(/,/g, "")) });
    el.textContent = fmt(0);
  }

  function run(el, delay, duration) {
    const { text, fmt, target } = info.get(el);
    const start = performance.now() + delay;
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      el.textContent = p < 1 ? fmt(target * ease(p)) : text;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        run(entry.target, 150, 1100);
      }
    },
    { threshold: 0.6 }
  );
  for (const el of els) {
    const live = el.closest("[data-live]");
    if (el.matches(".hbar em") && live) {
      const k = parseFloat(el.parentElement.style.getPropertyValue("--k")) || 0;
      live.addEventListener("live", () => run(el, 150 + k * 90, 1200), { once: true });
    } else io.observe(el);
  }
  window.addEventListener("beforeprint", () => els.forEach((el) => (el.textContent = info.get(el).text)));
}

// model samples write themselves out word by word the first time they scroll in, like they did when it generated them
function generate() {
  if (reduce) return;
  for (const box of $$("[data-generate]")) {
    const paras = $$("p", box).map((p) => {
      const words = [];
      const parts = p.textContent.split(/(\s+)/);
      p.textContent = "";
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          p.appendChild(document.createTextNode(" "));
          continue;
        }
        const w = document.createElement("span");
        w.className = "g";
        w.textContent = part;
        p.appendChild(w);
        words.push(w);
      }
      return { p, words };
    });
    box.classList.add("gen");

    const run = async () => {
      const rnd = seeded(paras.length * 97);
      for (const { p, words } of paras) {
        for (const w of words) {
          w.classList.add("on");
          await new Promise((r) => setTimeout(r, 16 + rnd() * 34));
        }
        p.classList.add("done");
        await new Promise((r) => setTimeout(r, 380));
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        run();
      },
      { threshold: 0.3 }
    );
    io.observe(box);
    window.addEventListener("beforeprint", () => {
      paras.forEach(({ p, words }) => {
        words.forEach((w) => w.classList.add("on"));
        p.classList.add("done");
      });
    });
  }
}

// cmd+k: jump to any page, post, model or link from anywhere
const JUMP = [
  ["navthings", "/", "home", "start hi about"],
  ["the models so far", "/work/", "timeline", "work models history every model"],
  ["what i've written", "/blog/", "writing", "posts blog"],
  ["talk to my models", "/playground/", "playground", "chat try run browser"],
  ["lilbase", "/work/lilbase.html", "case study", "pretraining jax tpu base model gpt-2 hellaswag lambada"],
  ["lilchat", "/work/lilchat.html", "case study", "finetuning mlx chat sft melbourne"],
  ["the paper", "/work/corpus-size.html", "case study", "research corpus size data tinystories zenodo"],
  ["sprout", "/work/sprout.html", "case study", "finished 523m wsd sharded adamw results samples"],
  ["how the playground works", "/work/playground.html", "case study", "wllama webassembly webgpu safari firefox inference"],
  ["talk to lilchat", "/playground/?model=lilchat", "model", "chat try"],
  ["lilbase, continues whatever you start", "/playground/?model=lilbase", "model", "try"],
  ["tale, bedtime stories", "/playground/?model=tale", "model", "try stories"],
  ["lilstory, tinier bedtime stories", "/playground/?model=lilstory", "model", "try stories"],
  ["lilstory's tokenizer", "/playground/#tokenizer", "playground", "tokens bpe pieces"],
  ["a digit net with no libraries", "/playground/#digits", "playground", "mnist draw neural net sllm"],
  ["teaching lilbase to talk", "/blog/lilchat.html", "post", "sep 26 lilchat finetuning"],
  ["lilbase, 297m params on a free tpu", "/blog/lilbase.html", "post", "sep 23 pretraining"],
  ["tale, bedtime stories for my little brother", "/blog/tale.html", "post", "sep 12"],
  ["i wrote a paper on how much data matters", "/blog/dataset-size-paper.html", "post", "sep 5 research"],
  ["lilstory, my first real language model", "/blog/lilstory.html", "post", "sep 4"],
  ["bigtransformer, now it reads a whole file", "/blog/bigtransformer.html", "post", "aug 31"],
  ["my first transformer", "/blog/liltransformer.html", "post", "aug 30 liltransformer one sentence"],
  ["github", "https://github.com/navthings", "link", "code repos"],
  ["hugging face", "https://huggingface.co/navthings", "link", "weights models"],
  ["ollama", "https://ollama.com/navthings", "link", "models run"],
  ["zenodo, the paper", "https://doi.org/10.5281/zenodo.22340667", "link", "research doi"],
  ["orcid", "https://orcid.org/0009-0002-2764-866X", "link", "research id"],
  ["rss feed", "/feed.xml", "link", "posts subscribe"],
  ["copy my email", "copy", "action", "say hi contact mail"],
  ["back to top", "top", "action", "scroll up"],
].map(([title, href, kind, words]) => ({ title, href, kind, hay: (title + " " + kind + " " + words).toLowerCase() }));

// the first time someone visits, point at the shortcut once, then never again
function jumpHint(open) {
  if (!finePointer) return;
  try {
    if (localStorage.getItem("jump-hint")) return;
    localStorage.setItem("jump-hint", "1");
  } catch (err) {
    return;
  }
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const tip = document.createElement("button");
  tip.type = "button";
  tip.className = "jump-hint";
  tip.innerHTML = "press <kbd>" + (mac ? "⌘K" : "ctrl K") + "</kbd> to jump anywhere";
  tip.addEventListener("click", () => {
    tip.remove();
    open();
  });
  const show = () => {
    document.body.appendChild(tip);
    requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add("on")));
    setTimeout(() => {
      tip.classList.remove("on");
      setTimeout(() => tip.remove(), 600);
    }, 5200);
  };
  // wait for the first visit logo intro if there is one
  const wait = () => (document.documentElement.classList.contains("intro") ? setTimeout(wait, 400) : setTimeout(show, 1600));
  setTimeout(wait, 600);
}

function jump() {
  const box = document.createElement("dialog");
  box.className = "jump sq";
  box.setAttribute("aria-label", "jump to");
  box.innerHTML =
    '<input class="jump-in" type="text" placeholder="where to?" aria-label="where to" role="combobox" aria-expanded="true" aria-controls="jump-list" autocomplete="off" spellcheck="false" />' +
    '<ul class="jump-list" id="jump-list" role="listbox"></ul>' +
    '<p class="jump-foot cap">↑ ↓ to move, enter to go, esc to close</p>';
  document.body.appendChild(box);
  squircles(box.parentElement);
  const input = box.querySelector("input");
  const list = box.querySelector("ul");
  const foot = box.querySelector(".jump-foot");
  let shown = [];
  let active = 0;

  // every word has to show up somewhere, and a hit at the start of the title counts most
  function search(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return JUMP.slice(0, 9);
    const hits = [];
    JUMP.forEach((item, i) => {
      let score = 0;
      for (const w of words) {
        const t = item.title.toLowerCase();
        if (t.startsWith(w)) score += 4;
        else if (t.includes(" " + w)) score += 3;
        else if (item.hay.includes(w)) score += 1;
        else return;
      }
      hits.push({ item, score, i });
    });
    return hits.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 9).map((h) => h.item);
  }

  function render(fresh) {
    shown = search(input.value);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.classList.toggle("fresh", !!fresh);
    list.innerHTML = shown.length ? "" : '<li class="jump-none">nothing called that. try a model name, or "post"</li>';
    shown.forEach((item, i) => {
      const li = document.createElement("li");
      li.id = "jump-o-" + i;
      li.setAttribute("role", "option");
      li.style.setProperty("--i", i);
      li.innerHTML = '<span class="jt"></span><span class="jk cap"></span>';
      li.firstChild.textContent = item.title;
      li.lastChild.textContent = item.kind;
      li.addEventListener("pointermove", () => select(i));
      li.addEventListener("click", () => go(item));
      list.appendChild(li);
    });
    select(active);
  }

  function select(i) {
    active = i;
    $$("li[role=option]", list).forEach((li, k) => li.setAttribute("aria-selected", k === i));
    const li = list.children[i];
    if (li && li.id) {
      input.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    }
  }

  function go(item) {
    if (item.href === "copy") {
      const email = "navneet.dagdiya@gmail.com";
      if (!navigator.clipboard) return (window.location.href = "mailto:" + email);
      navigator.clipboard.writeText(email).then(() => {
        close();
        setTimeout(() => drop("copied"), 380);
      });
      return;
    }
    close();
    if (item.href === "top") return scrollToTarget(0);
    if (/^https?:/.test(item.href)) return window.open(item.href, "_blank", "noopener");
    const url = new URL(item.href, location.origin);
    const here = url.pathname === location.pathname && !url.search;
    const target = url.hash && document.getElementById(url.hash.slice(1));
    if (here && target) scrollToTarget(target);
    else if (here && !url.hash) scrollToTarget(0);
    else window.location.href = url.href;
  }

  // the panel grows out of the nav pill and shrinks back into it: it starts moved up to the pill and cut down to its shape
  const pill = document.querySelector(".nav .island");
  const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  function fromPill() {
    if (!pill || reduce || !box.animate) return null;
    const p = pill.getBoundingClientRect();
    const d = box.getBoundingClientRect();
    const side = Math.max(0, (d.width - p.width) / 2);
    return [
      { transform: `translateY(${(p.top - d.top).toFixed(1)}px)`, clipPath: `inset(0 ${side.toFixed(1)}px ${Math.max(0, d.height - p.height).toFixed(1)}px round ${(p.height / 2).toFixed(1)}px)` },
      { transform: "none", clipPath: "inset(0 0 0 round 22px)" },
    ];
  }

  function open() {
    if (box.open) return close();
    input.value = "";
    active = 0;
    foot.textContent = "↑ ↓ to move, enter to go, esc to close";
    render(true);
    box.showModal();
    input.focus();
    const frames = fromPill();
    if (frames) {
      box.animate(frames, { duration: 560, easing: "cubic-bezier(0.55, 0, 0.1, 1)" });
      for (const c of box.children) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 140, easing: "ease-out", fill: "backwards" });
    }
  }

  let closing = false;
  function close() {
    if (!box.open || closing) return;
    const frames = fromPill();
    if (!frames) return box.close();
    closing = true;
    for (const c of box.children) c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });
    const shrink = box.animate(frames.slice().reverse(), { duration: 320, easing: EASE, fill: "forwards" });
    shrink.finished.then(() => {
      box.close();
      box.getAnimations({ subtree: true }).forEach((an) => an.cancel());
      closing = false;
    });
  }
  // esc goes through the same shrink
  box.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });

  // the keycap in the pill goes down like a real key, then the panel comes out of the pill
  function press() {
    const key = document.querySelector(".island-kbd");
    if (!key || reduce || !key.animate || box.open) return 0;
    key.animate(
      [
        { translate: "0 0", scale: "1", color: "#9a9a9a", borderColor: "#3a3a3a" },
        { translate: "0 2px", scale: "0.9", color: "#ffffff", borderColor: "#8a8a8a", offset: 0.35 },
        { translate: "0 0", scale: "1", color: "#9a9a9a", borderColor: "#3a3a3a" },
      ],
      { duration: 360, easing: "ease-out" }
    );
    return 130;
  }

  input.addEventListener("input", () => {
    active = 0;
    render(false);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) select((active + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      go(shown[active]);
    }
  });
  // a click on the dim area outside the panel closes it
  box.addEventListener("click", (e) => e.target === box && close());
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (e.repeat) return;
      const wait = press();
      if (wait) setTimeout(open, wait);
      else open();
    }
  });
  return open;
}

// printing skips the scroll, so everything that would have animated in shows up as it ends
function printable() {
  window.addEventListener("beforeprint", () => {
    for (const el of $$("[data-reveal], [data-words], [data-chart]")) el.classList.add("in");
    for (const el of $$("[data-live]")) el.classList.add("live");
    for (const el of $$("[data-scrib]:not([data-scrib-on])")) el.classList.add("drawn");
  });
}

// rows in a list get a soft background that glides from one to the next
function followers() {
  for (const list of $$(".follow")) {
    const ghost = document.createElement("div");
    ghost.className = "ghost sq";
    ghost.style.setProperty("--r", "16px");
    list.prepend(ghost);
    squircles(list);
    for (const row of $$(":scope > a, :scope > .row-item", list)) {
      row.addEventListener("pointerenter", () => {
        ghost.style.height = row.offsetHeight + "px";
        ghost.style.transform = `translateY(${row.offsetTop}px)`;
        ghost.style.opacity = "1";
      });
    }
    list.addEventListener("pointerleave", () => (ghost.style.opacity = "0"));
  }
}

// hand drawn marks: circles and underlines with a bit of wobble, seeded so they look the same every visit
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothPath(pts) {
  const f = (n) => n.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

function scribblePaths(kind, w, h, rnd, fs) {
  const paths = [];
  if (kind === "circle") {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2 + fs * 0.16 + rnd() * fs * 0.05;
    const ry = h / 2 + fs * 0.08 + rnd() * fs * 0.04;
    const start = -Math.PI * 0.8 + rnd() * 0.5;
    const turns = 1.1 + rnd() * 0.12;
    const tilt = (rnd() - 0.5) * 0.08;
    const ph = [rnd() * 6.3, rnd() * 6.3];
    const pts = [];
    for (let i = 0; i <= 56; i++) {
      const t = i / 56;
      const a = start + t * turns * Math.PI * 2;
      const wob = 1 + 0.035 * Math.sin(a * 2 + ph[0]) + 0.02 * Math.sin(a * 3 + ph[1]);
      const spiral = 1 + (t - 0.5) * 0.09;
      const x = rx * wob * spiral * Math.cos(a);
      const y = ry * wob * spiral * Math.sin(a);
      pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    paths.push(smoothPath(pts));
  } else {
    // underline, sometimes with a second quicker pass back
    const passes = kind === "double" ? 2 : 1;
    for (let k = 0; k < passes; k++) {
      const y0 = h + fs * (0.06 + k * 0.1) + rnd() * 2;
      const x0 = -fs * 0.06 + (k ? w * 0.12 : 0);
      const x1 = w + fs * 0.08 - (k ? w * 0.05 : 0);
      const pts = [];
      const ph = rnd() * 6.3;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const x = k ? x1 + (x0 - x1) * t : x0 + (x1 - x0) * t;
        const bow = Math.sin(t * Math.PI) * fs * 0.03;
        const lift = (k ? 1 - t : t) * t * -fs * 0.05;
        pts.push([x, y0 + bow + lift + Math.sin(t * 7 + ph) * fs * 0.012]);
      }
      paths.push(smoothPath(pts));
    }
  }
  return paths;
}

function scribbles(root = document) {
  const drawn = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const delay = parseFloat(el.dataset.scribDelay || "0.15");
        setTimeout(() => el.classList.add("drawn"), delay * 1000);
        drawn.unobserve(el);
      }
    },
    { threshold: 1, rootMargin: "0px 0px -12% 0px" }
  );

  for (const el of $$("[data-scrib]", root)) {
    const kind = el.dataset.scrib;
    let seed = 0;
    for (const ch of el.textContent) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("scrib-svg");
    el.appendChild(svg);

    const draw = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const pad = fs * 0.5;
      svg.setAttribute("viewBox", `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
      svg.style.cssText = `left:${-pad}px;top:${-pad}px;width:${w + pad * 2}px;height:${h + pad * 2}px`;
      const sw = Math.min(4, Math.max(1.7, fs * 0.034));
      // measure with transitions off, otherwise a new path flashes fully drawn before it hides itself
      svg.classList.add("measuring");
      svg.innerHTML = scribblePaths(kind, w, h, seeded(seed), fs)
        .map((d, i) => `<path d="${d}" stroke-width="${sw.toFixed(2)}" style="--k:${i}"/>`)
        .join("");
      for (const path of svg.querySelectorAll("path")) {
        const len = Math.ceil(path.getTotalLength());
        path.style.strokeDasharray = len;
        path.style.setProperty("--len", len);
      }
      svg.getBoundingClientRect();
      svg.classList.remove("measuring");
    };
    new ResizeObserver(draw).observe(el);
    if (el.dataset.scribOn === "hover" || el.dataset.scribOn === "manual") continue;
    if (reduce) el.classList.add("drawn");
    else drawn.observe(el);
  }
}

window.site = { scribbles, onScroll, requestTick, squircles, reveals, splitWords, scrollToTarget, clamp, reduce, finePointer, $$ };

squircles();
const openJump = jump();
jumpHint(openJump);
letters();
reveals();
scrubs();
magnetic();
nav();
droplets();
lean();
squashes();
highlighter();
email();
footer();
followers();
lives();
counters();
generate();
printable();
scribbles();
requestAnimationFrame(tick);
