(function () {
  const tl = document.querySelector(".tl");
  if (!tl || !window.site) return;
  const { onScroll, requestTick, clamp, $$ } = window.site;
  const line = tl.querySelector(".tl-line");
  const fill = tl.querySelector(".tl-fill");
  const nodes = $$(".tl-node", tl);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // where each dot sits down the list, from layout offsets so the reveal slide doesnt skew it. the line runs from the first dot to the last
  let centers = [];
  let start = 0;
  let span = 1;
  function measure() {
    centers = nodes.map((n) => n.parentElement.offsetTop + n.offsetTop + n.offsetHeight / 2);
    start = centers[0];
    span = Math.max(1, centers[centers.length - 1] - start);
    line.style.top = start + "px";
    line.style.bottom = "auto";
    line.style.height = span + "px";
  }
  measure();
  window.addEventListener("resize", measure);
  document.fonts && document.fonts.ready.then(() => {
    measure();
    requestTick();
  });

  // the ink follows a point a little below the middle of the screen, and each dot pops when it gets there
  let last = -1;
  onScroll.push((y, vh) => {
    const top = tl.getBoundingClientRect().top;
    const reach = vh * 0.62 - top;
    if (Math.abs(reach - last) < 0.5) return;
    last = reach;
    return () => {
      fill.style.transform = `scaleY(${clamp((reach - start) / span).toFixed(4)})`;
      nodes.forEach((n, i) => {
        const on = reach >= centers[i] - 2;
        // the first time the ink gets to a dot it sends out one ring, and never again
        if (on && !reduce) n.classList.add("ping");
        n.classList.toggle("lit", on);
      });
    };
  });
  requestTick();
})();
