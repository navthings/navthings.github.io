(function () {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // the header settles in one line after another
  $$(".page-head > *").forEach((el, k) => el.style.setProperty("--k", k));

  // things fade in once as they scroll into view
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      seen.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const el of $$("[data-reveal]")) reduce ? el.classList.add("in") : seen.observe(el);

  // charts and bars start drawing when they're mostly on screen
  const live = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("live");
      e.target.dispatchEvent(new CustomEvent("live"));
      live.unobserve(e.target);
    }
  }, { threshold: 0.3 });
  for (const el of $$("[data-live]")) live.observe(el);

  // text a model wrote types itself out a word at a time
  for (const box of $$("[data-generate]")) {
    if (reduce) continue;
    const paras = $$("p", box).map((p) => {
      const words = p.textContent.split(/(\s+)/).filter(Boolean);
      p.textContent = "";
      const spans = [];
      for (const w of words) {
        if (/^\s+$/.test(w)) {
          p.appendChild(document.createTextNode(" "));
          continue;
        }
        const s = document.createElement("span");
        s.className = "g";
        s.textContent = w;
        p.appendChild(s);
        spans.push(s);
      }
      return { p, spans };
    });
    box.classList.add("gen");
    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      for (const { p, spans } of paras) {
        for (const s of spans) {
          s.classList.add("on");
          await new Promise((r) => setTimeout(r, 18 + Math.random() * 30));
        }
        p.classList.add("done");
        await new Promise((r) => setTimeout(r, 350));
      }
    }, { threshold: 0.3 });
    io.observe(box);
  }

  // figures open bigger on click, esc or another click closes them
  for (const img of $$(".prose figure img, .cs-text figure img, .dark-fig img")) {
    img.classList.add("zoomable");
    img.addEventListener("click", () => {
      const zoom = document.createElement("div");
      zoom.className = "zoom";
      const big = img.cloneNode();
      big.removeAttribute("loading");
      big.classList.remove("zoomable");
      zoom.appendChild(big);
      document.body.appendChild(zoom);
      requestAnimationFrame(() => zoom.classList.add("on"));
      const close = () => {
        zoom.classList.remove("on");
        setTimeout(() => zoom.remove(), 300);
        removeEventListener("keydown", esc);
      };
      const esc = (e) => e.key === "Escape" && close();
      zoom.addEventListener("click", close);
      addEventListener("keydown", esc);
    });
  }
})();
