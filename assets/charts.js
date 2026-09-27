(function () {
  const DATA = {
    paper: {
      label: "train and validation loss for lilstory trained on 1, 5, 10 and 15 percent of tinystories",
      x: ["1%", "5%", "10%", "15%"],
      detail: ["22k stories", "110k stories", "220k stories", "330k stories"],
      series: [
        { name: "train", color: "#c9c9c6", values: [1.329, 1.701, 1.826, 1.737] },
        { name: "val", color: "#0f0f0f", values: [2.402, 1.932, 1.816, 1.837] },
      ],
      min: 1.2,
      max: 2.5,
      ticks: [1.2, 1.6, 2.0, 2.4],
      notes: [
        { at: 0, text: "memorising", kind: "gap" },
        { at: 2, text: "basically the same", kind: "above" },
      ],
    },
  };

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  function lineChart(el, cfg) {
    const H = parseFloat(el.dataset.height) || 240;
    let lastW = 0;
    let hideTip = () => {};
    document.addEventListener("pointerdown", (e) => !el.contains(e.target) && hideTip());

    function draw() {
      const W = Math.round(el.clientWidth);
      if (!W || W === lastW) return;
      lastW = W;
      const pad = { l: 34, r: 12, t: 26, b: 30 };
      const n = cfg.x.length;
      const inner = 18;
      const x = (i) => pad.l + inner + ((W - pad.l - pad.r - inner * 2) * i) / (n - 1);
      const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - cfg.min) / (cfg.max - cfg.min));
      const [a, b] = cfg.series;

      let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.label)}">`;
      s += '<g class="grid">';
      for (const t of cfg.ticks) {
        s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`;
        s += `<text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(1)}</text>`;
      }
      s += "</g>";
      cfg.x.forEach((label, i) => {
        s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${label}</text>`;
      });

      // the space between train and val is the story, so it gets a faint wash
      const top = b.values.map((v, i) => `${x(i)},${y(v)}`);
      const bottom = a.values.map((v, i) => `${x(i)},${y(v)}`).reverse();
      s += `<polygon class="gap" points="${top.concat(bottom).join(" ")}" fill="#0f0f0f" fill-opacity="0.045"/>`;

      // the notes need room, on a phone the legend and tooltip carry it
      for (const note of W > 420 ? cfg.notes || [] : []) {
        const nx = x(note.at);
        if (note.kind === "gap") {
          const y1 = y(b.values[note.at]) + 10;
          const y2 = y(a.values[note.at]) - 10;
          s += `<g class="gap"><line x1="${nx + 16}" x2="${nx + 16}" y1="${y1}" y2="${y2}" stroke="#a0a0a0" stroke-width="1"/>`;
          s += `<text class="endlabel" x="${nx + 24}" y="${(y1 + y2) / 2 + 4}">${esc(note.text)}</text></g>`;
        } else {
          const top = Math.min(...cfg.series.map((sr) => y(sr.values[note.at])));
          s += `<text class="endlabel gap" x="${nx}" y="${top - 14}" text-anchor="middle">${esc(note.text)}</text>`;
        }
      }

      for (const sr of cfg.series) {
        const d = sr.values.map((v, i) => (i ? "L" : "M") + x(i) + " " + y(v)).join(" ");
        s += `<path class="ln" d="${d}" stroke="${sr.color}"/>`;
      }
      s += `<line class="cross" x1="0" x2="0" y1="${pad.t - 8}" y2="${H - pad.b}" stroke="#d6d6d3" stroke-width="1" opacity="0"/>`;
      for (const sr of cfg.series) {
        sr.values.forEach((v, i) => {
          s += `<circle class="pt" style="--k: ${i}" cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${sr.color}"/>`;
        });
      }
      s += `<rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent"/>`;
      s += "</svg>";
      el.innerHTML = s + '<div class="tip" role="status"></div>';

      for (const path of el.querySelectorAll(".ln")) path.style.setProperty("--len", Math.ceil(path.getTotalLength()));

      const tip = el.querySelector(".tip");
      const cross = el.querySelector(".cross");
      const hit = el.querySelector(".hit");
      const show = (e) => {
        const box = el.getBoundingClientRect();
        const px = e.clientX - box.left;
        let best = 0;
        for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
        cross.setAttribute("x1", x(best));
        cross.setAttribute("x2", x(best));
        cross.setAttribute("opacity", "1");
        const rows = cfg.series
          .slice()
          .reverse()
          .map((sr) => `<span>${sr.name}</span> ${sr.values[best].toFixed(3)}`)
          .join("<br>");
        tip.innerHTML = `${cfg.x[best]} of the data, ${cfg.detail[best]}<br>${rows}`;
        tip.style.left = Math.min(Math.max(x(best), 90), W - 90) + "px";
        tip.style.top = Math.min(...cfg.series.map((sr) => y(sr.values[best]))) + "px";
        tip.classList.add("on");
      };
      const hide = () => {
        tip.classList.remove("on");
        cross.setAttribute("opacity", "0");
      };
      // a tap has no hover, so on touch the tooltip stays until you tap somewhere else
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", (e) => e.pointerType !== "touch" && hide());
      hideTip = hide;
    }

    draw();
    new ResizeObserver(draw).observe(el);
  }

  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        seen.unobserve(entry.target);
      }
    },
    { threshold: 0.35 }
  );

  for (const el of document.querySelectorAll("[data-chart]")) {
    const cfg = DATA[el.dataset.chart];
    if (!cfg) continue;
    lineChart(el, cfg);
    seen.observe(el);
  }
})();
