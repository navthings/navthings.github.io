const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// one scroll loop for everything that follows the page position
const onScroll = [];
let lenis = null;
let ticking = false;

function tick() {
  ticking = false;
  const y = window.scrollY;
  const vh = window.innerHeight;
  for (const fn of onScroll) fn(y, vh);
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
  if (lenis) lenis.scrollTo(target, { offset: -24, duration: 1.4 });
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

function squircles(root = document) {
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
      words.forEach((w, i) => {
        w.style.opacity = (0.14 + 0.86 * clamp(lit - i)).toFixed(3);
      });
    });
  }
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
  const fill = el.querySelector(".island-fill");
  const foot = document.querySelector(".foot");
  const sheet = document.querySelector(".sheet");
  const fallback = bar.dataset.label || "navthings";
  const current = bar.dataset.current || "";
  const anchors = $$("a", links);
  anchors.forEach((a, i) => a.style.setProperty("--i", i));
  const labelled = $$("[data-label]").filter((n) => n !== bar && n !== foot);
  let label = null;
  let open = false;
  let closeTimer = 0;

  function size() {
    const text = now.querySelector("span:not(.out)");
    const closed = 50 + (text ? text.offsetWidth : 0) + 20;
    const opened = 44 + links.offsetWidth + 8;
    el.style.setProperty("--w", Math.round(open ? opened : closed) + "px");
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
  onScroll.push((y, vh) => {
    let text = fallback;
    for (const n of labelled) {
      if (n.getBoundingClientRect().top < vh * 0.4) text = n.dataset.label;
      else break;
    }
    // the footer is sticky and always sits behind the sheet, so go by how much the sheet has uncovered
    const uncovered = sheet ? vh - sheet.getBoundingClientRect().bottom : 0;
    if (foot && foot.dataset.label && uncovered > vh * 0.45) text = foot.dataset.label;
    setLabel(text);

    const max = document.documentElement.scrollHeight - vh;
    fill.style.setProperty("--p", max > 0 ? clamp(y / max).toFixed(4) : 0);
    el.classList.toggle("light", !!foot && uncovered > vh - 40);
    if (open && Math.abs(y - lastY) > 60 && !el.matches(":hover")) setOpen(false);
    if (!open) lastY = y;
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
function email() {
  for (const el of $$("[data-email]")) {
    const label = el.querySelector(".inner") || el;
    const original = label.textContent;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigator.clipboard.writeText("navneet.dagdiya@gmail.com").then(
        () => {
          label.textContent = "copied.";
          setTimeout(() => (label.textContent = original), 1800);
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
    shapes.forEach((s, i) => {
      s.style.strokeDashoffset = (lengths[i] * (1 - draw)).toFixed(1);
    });
    mark.style.setProperty("--fill", clamp((draw - 0.7) / 0.3).toFixed(3));
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

// rows in a list get a soft background that glides from one to the next
function followers() {
  for (const list of $$(".follow")) {
    const ghost = document.createElement("div");
    ghost.className = "ghost sq";
    ghost.style.setProperty("--r", "16px");
    list.prepend(ghost);
    squircleObserver.observe(ghost);
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
reveals();
scrubs();
magnetic();
nav();
email();
footer();
followers();
lives();
scribbles();
requestAnimationFrame(tick);
