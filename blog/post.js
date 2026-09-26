// stagger in whatever is on screen at load, then reveal the rest as you scroll
const items = document.querySelectorAll(".back, .post-title, .post-date, .post > *, .post-foot");
let shown = 0;

items.forEach(function (el) {
  el.classList.add("reveal");
});

const observer = new IntersectionObserver(
  function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.style.transitionDelay = Math.min(shown, 8) * 0.07 + "s";
      entry.target.classList.add("in");
      shown++;
      observer.unobserve(entry.target);
    });
    setTimeout(function () {
      shown = 0;
    }, 100);
  },
  { rootMargin: "0px 0px -40px 0px" }
);

items.forEach(function (el) {
  observer.observe(el);
});
