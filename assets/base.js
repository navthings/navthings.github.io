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


})();
