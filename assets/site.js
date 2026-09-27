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
  lenis = new window.Lenis({ autoRaf: true, lerp: 0.11, anchors: { offset: -24 } });
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
        setTimeout(() => el.removeAttribute("data-reveal"), delay * 1000 + 1200);
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

// nav hides going down, comes back going up, and the blob sits under the hovered or current link
function nav() {
  const bar = document.querySelector(".nav");
  if (!bar) return;
  const links = bar.querySelector(".links");
  const blob = links && links.querySelector(".blob");
  const progress = bar.querySelector(".progress");
  let lastY = window.scrollY;
  let current = null;

  function moveBlob(a) {
    if (!blob) return;
    if (!a) {
      blob.style.opacity = "0";
      return;
    }
    blob.style.opacity = "1";
    blob.style.width = a.offsetWidth + "px";
    blob.style.transform = `translateX(${a.offsetLeft}px)`;
  }

  if (links) {
    for (const a of $$("a:not(.pill)", links)) a.addEventListener("pointerenter", () => moveBlob(a));
    links.addEventListener("pointerleave", () => moveBlob(current));
  }

  // links that point at a section on this page light up while you are in it
  const spy = $$("a[href*='#']", links || bar)
    .map((a) => ({ a, el: document.getElementById(a.hash.slice(1)) }))
    .filter((s) => s.el);

  onScroll.push((y, vh) => {
    bar.classList.toggle("solid", y > 24);
    if (y > 240 && y > lastY + 4) bar.classList.add("away");
    else if (y < lastY - 4 || y < 240) bar.classList.remove("away");
    lastY = y;

    if (progress) {
      const max = document.documentElement.scrollHeight - vh;
      progress.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;
    }

    let active = null;
    for (const s of spy) {
      const r = s.el.getBoundingClientRect();
      if (r.top < vh * 0.4 && r.bottom > vh * 0.4) active = s.a;
    }
    if (active !== current && (!links || !links.matches(":hover"))) {
      if (current) current.classList.remove("on");
      current = active;
      if (current) current.classList.add("on");
      moveBlob(current);
    } else if (active !== current) {
      if (current) current.classList.remove("on");
      current = active;
      if (current) current.classList.add("on");
    }
  });

  for (const a of $$("a[href^='#']")) {
    a.addEventListener("click", (e) => {
      const target = document.getElementById(a.hash.slice(1));
      if (!target) return;
      e.preventDefault();
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
  const icon = document.querySelector(".brand img");
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

  onScroll.push((y, vh) => {
    const r = foot.getBoundingClientRect();
    if (r.top > vh) return;
    const p = clamp((vh - r.top) / r.height);
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

window.site = { onScroll, requestTick, squircles, reveals, splitWords, scrollToTarget, clamp, reduce, finePointer, $$ };

squircles();
reveals();
scrubs();
magnetic();
nav();
email();
footer();
followers();
lives();
requestAnimationFrame(tick);
