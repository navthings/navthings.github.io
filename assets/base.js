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


  // theme: a tap flips it, holding hands it back to the device

  const themeBtn = $(".theme");
  if (!themeBtn) return;
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const metas = $$('meta[name="theme-color"]');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : systemDark.matches);

  function syncTheme() {
    const dark = isDark();
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.setAttribute("aria-label", dark ? "switch to light mode" : "switch to dark mode");
    for (const m of metas) {
      if (root.dataset.theme) m.content = dark ? "#0c0c0c" : "#ffffff";
      else m.content = m.media.includes("dark") ? "#0c0c0c" : "#ffffff";
    }
  }

  function setTheme(value) {
    if (value) root.dataset.theme = value;
    else delete root.dataset.theme;
    try {
      if (value) localStorage.setItem("theme", value);
      else localStorage.removeItem("theme");
    } catch (err) {
      console.warn("couldnt save the theme", err);
    }
    syncTheme();
  }

  // the new colours spread out in a circle from the button
  function changeTheme(value) {
    const before = isDark();
    if (!document.startViewTransition || reduce) return setTheme(value);
    const r = themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    root.style.setProperty("--tx", x + "px");
    root.style.setProperty("--ty", y + "px");
    root.style.setProperty("--tr", Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + "px");
    root.classList.add("theming");
    const t = document.startViewTransition(() => {
      setTheme(value);
      if (isDark() === before) root.classList.remove("theming");
    });
    t.finished.finally(() => root.classList.remove("theming"));
  }

  let holdTimer = 0;
  let held = false;
  themeBtn.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    held = false;
    themeBtn.classList.add("holding");
    holdTimer = setTimeout(() => {
      held = true;
      themeBtn.classList.remove("holding", "pulse");
      void themeBtn.offsetWidth;
      themeBtn.classList.add("pulse", "told");
      changeTheme(null);
      setTimeout(() => themeBtn.classList.remove("told"), 1600);
    }, 600);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
    themeBtn.addEventListener(ev, () => {
      clearTimeout(holdTimer);
      themeBtn.classList.remove("holding");
    });
  }
  themeBtn.addEventListener("click", () => {
    if (held) return (held = false);
    changeTheme(isDark() ? "light" : "dark");
  });
  themeBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  systemDark.addEventListener("change", syncTheme);
  syncTheme();

})();
