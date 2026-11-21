// a tiny mini motorways city that plays itself
(() => {
  const canvas = document.querySelector(".city");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  let C = {};
  const colours = () => {
    const cs = getComputedStyle(root);
    const v = (k) => cs.getPropertyValue(k).trim();
    C = { ink: v("--ink"), acc: v("--accent"), road: v("--ink-4"), ink3: v("--ink-3"), line: v("--line"), bg: v("--bg") };
  };
  colours();
  new MutationObserver(colours).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  const CS = 26;
  let W, H, cols, rows, ox, oy;
  const size = () => {
    const dpr = devicePixelRatio || 1;
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.floor(W / CS); rows = Math.floor(H / CS);
    ox = (W - cols * CS) / 2; oy = (H - rows * CS) / 2;
  };
  size();

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b));
  const key = (x, y) => y * cols + x;
  const px = (x) => ox + (x + 0.5) * CS;
  const py = (y) => oy + (y + 0.5) * CS;

  // river, two cells wide, wiggling down the map
  const river = new Set();
  const riverX = [];
  const r0 = Math.floor(cols * 0.64);
  for (let y = 0; y < rows; y++) {
    const x = r0 + Math.round(Math.sin(y * 0.55) * 1.2);
    riverX.push(x);
    river.add(key(x, y)); river.add(key(x + 1, y));
  }

  const blocked = new Set();
  const roads = new Map(); // "a-b" edge -> {a, b, t}
  const building = [];
  const houses = [];
  const dests = [];
  const cars = [];
  let trips = 0;

  const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !blocked.has(key(x, y)) && !river.has(key(x, y));

  // two destinations, one per colour, on opposite sides of the river
  const placeDest = (colour, xmin, xmax) => {
    for (let n = 0; n < 200; n++) {
      const x = ri(xmin, xmax - 1), y = ri(1, rows - 3);
      const cells = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1], [x, y + 2]];
      if (!cells.every(([a, b]) => free(a, b))) continue;
      cells.slice(0, 4).forEach(([a, b]) => blocked.add(key(a, b)));
      const d = { x, y, colour, door: [x, y + 2], pop: 0 };
      dests.push(d);
      return d;
    }
  };
  placeDest("ink", 1, Math.max(3, r0 - 3));
  placeDest("acc", r0 + 3, cols - 1);

  // dijkstra that likes reusing roads and hates bridges
  const route = (from, to) => {
    const N = cols * rows, dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const s = key(...from), t = key(...to);
    dist[s] = 0;
    const open = [s];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const u = open.splice(bi, 1)[0];
      if (u === t) break;
      const ux = u % cols, uy = (u / cols) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = ux + dx, y = uy + dy, v = key(x, y);
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (blocked.has(v) && v !== t) continue;
        if (dx && dy && (blocked.has(key(ux + dx, uy)) || blocked.has(key(ux, uy + dy)))) continue;
        const e = Math.min(u, v) + "-" + Math.max(u, v);
        let c = (dx && dy ? 1.42 : 1) * (roads.has(e) ? 0.35 : 1);
        if (river.has(v)) c *= 3;
        if (dist[u] + c < dist[v]) {
          if (dist[v] === Infinity) open.push(v);
          dist[v] = dist[u] + c; prev[v] = u;
        }
      }
    }
    if (prev[t] < 0) return null;
    const path = [];
    for (let v = t; v !== -1; v = prev[v]) path.unshift([v % cols, (v / cols) | 0]);
    return path;
  };

  const building_queue = [];
  const lay = (path) => {
    for (let i = 1; i < path.length; i++) {
      const u = key(...path[i - 1]), v = key(...path[i]);
      const e = Math.min(u, v) + "-" + Math.max(u, v);
      if (roads.has(e)) continue;
      const r = { a: path[i - 1], b: path[i], t: calm ? 1 : 0 };
      roads.set(e, r);
      if (!calm) building_queue.push(r);
    }
  };

  const addHouse = () => {
    for (let n = 0; n < 120; n++) {
      const x = ri(0, cols), y = ri(0, rows);
      if (!free(x, y)) continue;
      const near = [...blocked].some((k) => Math.abs((k % cols) - x) + Math.abs(((k / cols) | 0) - y) < 2);
      if (near) continue;
      const colour = Math.random() < 0.5 ? "ink" : "acc";
      const d = dests.find((q) => q.colour === colour);
      if (!d) return;
      blocked.add(key(x, y));
      const path = route([x, y], d.door);
      if (!path) { blocked.delete(key(x, y)); continue; }
      lay(path);
      const h = { x, y, colour, path, dest: d, born: performance.now(), next: performance.now() + rnd(2500, 4500) };
      houses.push(h);
      return h;
    }
  };

  // a road out of the map edge that goes nowhere
  const deadY = ri(1, rows - 1);
  const dead = [];
  for (let x = 0; x < Math.min(6, r0 - 2); x++) {
    if (blocked.has(key(x, deadY))) break;
    dead.push([x, deadY]);
  }
  if (dead.length > 2) {
    lay(dead);
    // nothing else gets to use it
    dead.forEach(([x, y]) => blocked.add(key(x, y)));
  }
  let deadNext = performance.now() + 5000;

  for (let n = 0; n < (calm ? 10 : 3); n++) addHouse();
  let nextHouse = performance.now() + 2200;

  const polyLen = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  };
  const at = (pts, d) => {
    for (let i = 1; i < pts.length; i++) {
      const sx = pts[i][0] - pts[i - 1][0], sy = pts[i][1] - pts[i - 1][1], l = Math.hypot(sx, sy);
      if (d <= l || i === pts.length - 1) {
        const f = Math.min(1, d / (l || 1));
        return [pts[i - 1][0] + sx * f, pts[i - 1][1] + sy * f, Math.atan2(sy, sx)];
      }
      d -= l;
    }
    return [pts[0][0], pts[0][1], 0];
  };
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

  const drive = (cells, colour, onArrive, back = true, pause = 600) => {
    const pts = cells.map(([x, y]) => [x + 0.5, y + 0.5]);
    const L = polyLen(pts);
    cars.push({ pts, L, colour, t0: performance.now(), dur: (L / 2.6) * 1000 + 500, back, pause, onArrive, leg: 0, ang: null });
  };

  const roadDone = (h) => h.path.every((c, i) => {
    if (!i) return true;
    const u = key(...h.path[i - 1]), v = key(...c);
    const r = roads.get(Math.min(u, v) + "-" + Math.max(u, v));
    return r && r.t >= 1;
  });

  const tick = (now, dt) => {
    // roads lay down one tile after another
    let budget = dt / 70;
    while (budget > 0 && building_queue.length) {
      const r = building_queue[0];
      const need = 1 - r.t;
      r.t = Math.min(1, r.t + budget);
      budget -= need;
      if (r.t >= 1) building_queue.shift();
    }
    if (now > nextHouse && houses.length < 12) { addHouse(); nextHouse = now + rnd(2400, 4200); }
    for (const h of houses) {
      if (now < h.next || !roadDone(h)) continue;
      h.next = now + rnd(3500, 7000);
      drive(h.path, h.colour, () => { trips++; h.dest.pop = 1; });
    }
    if (dead.length > 2 && now > deadNext && !building_queue.length) {
      deadNext = now + rnd(8000, 12000);
      drive(dead, "ink3", null, true, 900);
    }
    for (const d of dests) d.pop = Math.max(0, d.pop - dt / 400);
  };

  const rrect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  };

  const draw = (now) => {
    ctx.clearRect(0, 0, W, H);
    // river
    ctx.strokeStyle = C.line;
    ctx.lineWidth = CS * 1.7;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    riverX.forEach((x, y) => (y ? ctx.lineTo(px(x) + CS / 2, py(y)) : ctx.moveTo(px(x) + CS / 2, py(y) - CS)));
    ctx.lineTo(px(riverX[rows - 1]) + CS / 2, py(rows - 1) + CS);
    ctx.stroke();

    const seg = (r) => {
      const ax = px(r.a[0]), ay = py(r.a[1]);
      return [ax, ay, ax + (px(r.b[0]) - ax) * r.t, ay + (py(r.b[1]) - ay) * r.t];
    };
    // bridges sit under the road where it crosses water
    ctx.strokeStyle = C.ink3;
    ctx.lineWidth = CS * 0.62;
    ctx.lineCap = "butt";
    for (const r of roads.values()) {
      if (!r.t || !(river.has(key(...r.a)) || river.has(key(...r.b)))) continue;
      const [a, b, c, d] = seg(r);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    }
    ctx.strokeStyle = C.road;
    ctx.lineWidth = CS * 0.44;
    ctx.lineCap = "round";
    for (const r of roads.values()) {
      if (!r.t) continue;
      const [a, b, c, d] = seg(r);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    }

    // dead end barrier and its sign
    if (dead.length > 2) {
      const [x, y] = dead[dead.length - 1];
      ctx.strokeStyle = C.acc; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px(x) + CS * 0.42, py(y) - CS * 0.32); ctx.lineTo(px(x) + CS * 0.42, py(y) + CS * 0.32); ctx.stroke();
      ctx.fillStyle = C.ink3;
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textBaseline = "middle";
      ctx.fillText("404", px(x) + CS * 0.7, py(y));
    }

    const col = (c) => (c === "ink" ? C.ink : c === "acc" ? C.acc : C.ink3);
    for (const d of dests) {
      const s = 1 + Math.sin(d.pop * Math.PI) * 0.12;
      const cx = ox + (d.x + 1) * CS, cy = oy + (d.y + 1) * CS, w = (CS * 2 - 6) * s;
      ctx.fillStyle = col(d.colour);
      rrect(cx - w / 2, cy - w / 2, w, w, 6); ctx.fill();
      // four little windows
      ctx.fillStyle = C.bg;
      const q = w * 0.17, gap = w * 0.1;
      for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        rrect(cx + i * (gap / 2 + q / 2) - q / 2, cy + j * (gap / 2 + q / 2) - q / 2, q, q, 2);
        ctx.fill();
      }
    }
    for (const h of houses) {
      const g = calm ? 1 : Math.min(1, (now - h.born) / 350);
      const s = CS * 0.52 * (1 + 2.7 * (g - 1) ** 3 + 1.7 * (g - 1) ** 2);
      ctx.fillStyle = col(h.colour);
      rrect(px(h.x) - s / 2, py(h.y) - s / 2, s, s, 3); ctx.fill();
    }

    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      let p = (now - c.t0) / c.dur;
      if (c.leg === 0 && p >= 1) {
        if (c.onArrive) c.onArrive();
        if (!c.back) { cars.splice(i, 1); continue; }
        c.leg = 1; c.t0 = now + c.pause; p = 0;
      } else if (c.leg === 1 && p >= 1) { cars.splice(i, 1); continue; }
      p = Math.max(0, Math.min(1, p));
      const d = c.L * (c.leg === 0 ? ease(p) : 1 - ease(p));
      const [x, y, a] = at(c.pts, d);
      const want = c.leg === 0 ? a : a + Math.PI;
      if (c.ang === null) c.ang = want;
      let diff = ((want - c.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      c.ang += diff * 0.25;
      ctx.save();
      ctx.translate(ox + x * CS - Math.sin(c.ang) * CS * 0.09, oy + y * CS + Math.cos(c.ang) * CS * 0.09);
      ctx.rotate(c.ang);
      ctx.fillStyle = col(c.colour);
      rrect(-CS * 0.2, -CS * 0.11, CS * 0.4, CS * 0.22, 2.5); ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = C.ink3;
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`trips: ${trips}`, ox + 4, H - 6);
  };

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(now - last, 50);
    last = now;
    tick(now, dt);
    draw(now);
    requestAnimationFrame(loop);
  };
  if (calm) draw(performance.now());
  else requestAnimationFrame(loop);
  // keep the same grid on resize, just recentre it
  addEventListener("resize", () => {
    const c = cols, r = rows;
    size();
    cols = c; rows = r;
    ox = (W - cols * CS) / 2; oy = (H - rows * CS) / 2;
  });
})();
