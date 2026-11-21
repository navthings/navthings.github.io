(function () {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  root.classList.add("js");

  // email copies itself, and falls back to opening the mail app

  for (const email of $$("a.email")) email.addEventListener("click", async (e) => {
    if (!navigator.clipboard) return;
    e.preventDefault();
    try {
      await navigator.clipboard.writeText("navneet.dagdiya@gmail.com");
      email.classList.add("copied");
      setTimeout(() => email.classList.remove("copied"), 1600);
    } catch (err) {
      console.warn("clipboard said no, opening mail instead", err);
      location.href = email.href;
    }
  });


  // colourways: lilac, tomato, phosphor. the new one wipes out from the swatch

  const ways = $$(".ways button");
  if (!ways.length) return;
  const metas = $$('meta[name="theme-color"]');
  const current = () => root.dataset.theme || "lilac";

  function sync() {
    for (const b of ways) b.setAttribute("aria-pressed", String(b.dataset.way === current()));
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    for (const m of metas) m.content = bg;
  }

  function setWay(w) {
    if (w === "lilac") delete root.dataset.theme;
    else root.dataset.theme = w;
    try { localStorage.setItem("colorway", w); } catch (err) { console.warn("couldnt save the colourway", err); }
    sync();
  }

  for (const b of ways) b.addEventListener("click", () => {
    const w = b.dataset.way;
    if (w === current()) return;
    if (!document.startViewTransition || reduce) return setWay(w);
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    root.style.setProperty("--tx", x + "px");
    root.style.setProperty("--ty", y + "px");
    root.style.setProperty("--tr", Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + "px");
    root.classList.add("theming");
    document.startViewTransition(() => setWay(w)).finished.finally(() => root.classList.remove("theming"));
  });
  sync();

})();
