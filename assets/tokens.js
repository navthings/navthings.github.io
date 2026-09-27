(function () {
  // lilstory's byte level bpe, rebuilt from its merges. same algorithm as huggingface tokenizers
  function tokenizer(buf) {
    const u16 = new Uint16Array(buf);
    let k = 0;
    const vocab = ["[UNK]", "[BOS]", "[EOS]", "[PAD]"];
    const nBase = u16[k++];
    for (let i = 0; i < nBase; i++) vocab.push(String.fromCharCode(u16[k++]));
    const first = vocab.length;
    const nMerges = u16[k++];
    const rank = new Map();
    for (let i = 0; i < nMerges; i++) {
      const a = u16[k++];
      const b = u16[k++];
      rank.set(a * 65536 + b, i);
      vocab.push(vocab[a] + vocab[b]);
    }
    const ids = new Map(vocab.map((s, i) => [s, i]));

    // gpt-2 maps every byte to a printable character so a token is always a plain string
    const byteChar = [];
    const charByte = new Map();
    let n = 0;
    for (let b = 0; b < 256; b++) {
      const keep = (b >= 33 && b <= 126) || (b >= 161 && b <= 172) || b >= 174;
      const c = String.fromCharCode(keep ? b : 256 + n++);
      byteChar[b] = c;
      charByte.set(c, b);
    }

    const SPLIT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
    const SPECIAL = /\[(?:UNK|BOS|EOS|PAD)\]/g;
    const utf8 = new TextEncoder();
    const cache = new Map();

    function word(piece) {
      if (cache.has(piece)) return cache.get(piece);
      let s = "";
      for (const b of utf8.encode(piece)) s += byteChar[b];
      let w = Array.from(s, (c) => (ids.has(c) ? ids.get(c) : 0));
      while (w.length > 1) {
        let best = -1;
        let bestRank = Infinity;
        for (let i = 0; i < w.length - 1; i++) {
          const r = rank.get(w[i] * 65536 + w[i + 1]);
          if (r !== undefined && r < bestRank) {
            bestRank = r;
            best = i;
          }
        }
        if (best < 0) break;
        const a = w[best];
        const b = w[best + 1];
        const merged = [];
        for (let i = 0; i < w.length; i++) {
          if (i < w.length - 1 && w[i] === a && w[i + 1] === b) {
            merged.push(first + bestRank);
            i++;
          } else merged.push(w[i]);
        }
        w = merged;
      }
      if (cache.size > 5000) cache.clear();
      cache.set(piece, w);
      return w;
    }

    // one group per pre-token, so the page can tell a whole word from a chopped up one
    function groups(text) {
      const out = [];
      const plain = (chunk) => {
        for (const piece of chunk.match(SPLIT) || []) out.push(word(piece));
      };
      let last = 0;
      for (const m of text.matchAll(SPECIAL)) {
        plain(text.slice(last, m.index));
        out.push([ids.get(m[0])]);
        last = m.index + m[0].length;
      }
      plain(text.slice(last));
      return out;
    }

    const utf8Out = new TextDecoder();
    const bytesOf = (id) => (id < 4 ? utf8.encode(vocab[id]) : Uint8Array.from(vocab[id], (c) => charByte.get(c)));
    return { groups, encode: (text) => groups(text).flat(), bytesOf, text: (id) => utf8Out.decode(bytesOf(id)), size: vocab.length };
  }

  if (typeof document === "undefined") {
    module.exports = tokenizer;
    return;
  }

  const root = document.querySelector("[data-tokenizer]");
  if (!root) return;
  const box = root.querySelector("textarea");
  const out = root.querySelector(".tok-out");
  const stats = root.querySelector(".tok-stats");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let tok = null;
  let loading = null;
  let shown = [];

  function load() {
    if (!loading) {
      loading = fetch(root.dataset.tokenizer)
        .then((r) => {
          if (!r.ok) throw new Error("tokenizer " + r.status);
          return r.arrayBuffer();
        })
        .then((buf) => {
          tok = tokenizer(buf);
          render(false);
        })
        .catch((err) => {
          console.error("couldnt load the tokenizer", err);
          stats.textContent = "couldnt load the tokenizer";
          loading = null;
        });
    }
    return loading;
  }

  new IntersectionObserver(
    (entries, io) => {
      if (entries[0].isIntersecting) {
        load();
        io.disconnect();
      }
    },
    { rootMargin: "600px 0px" }
  ).observe(root);

  // spaces and newlines are part of tokens, so they get drawn instead of vanishing
  function label(id) {
    const text = tok.text(id);
    if (text.includes("�")) return Array.from(tok.bytesOf(id), (b) => "<" + b.toString(16) + ">").join("");
    return text.replace(/ /g, "·").replace(/\n/g, "↵").replace(/\t/g, "⇥");
  }

  // only tokens that changed get rebuilt, so typing doesn't make the whole row flicker
  function render(stagger) {
    if (!tok) return;
    const text = box.value;
    const groups = tok.groups(text);
    const next = [];
    for (const g of groups) for (const id of g) next.push({ id, cut: g.length > 1 });

    const chips = out.children;
    let fresh = 0;
    next.forEach((t, i) => {
      const old = shown[i];
      if (old && old.id === t.id && old.cut === t.cut) return;
      const chip = document.createElement("span");
      chip.className = "tk" + (t.cut ? " cut" : "");
      chip.innerHTML = "<b></b><i></i>";
      chip.firstChild.textContent = label(t.id);
      chip.lastChild.textContent = t.id;
      if (!reduce) {
        chip.classList.add("new");
        chip.style.setProperty("--k", stagger ? fresh : 0);
        fresh++;
      }
      if (chips[i]) out.replaceChild(chip, chips[i]);
      else out.appendChild(chip);
    });
    while (chips.length > next.length) out.lastChild.remove();
    shown = next;

    const chars = Array.from(text).length;
    const cut = groups.filter((g) => g.length > 1 && /\p{L}/u.test(g.map((id) => tok.text(id)).join(""))).length;
    const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
    stats.textContent = next.length
      ? plural(next.length, "token") + " · " + plural(chars, "character") + (cut ? " · " + plural(cut, "word") + " chopped up" : "")
      : "nothing to read yet";
  }

  // the box grows with the text instead of scrolling inside itself
  function fit() {
    box.style.height = "auto";
    box.style.height = box.scrollHeight + "px";
  }

  box.addEventListener("input", () => {
    fit();
    render(false);
  });
  for (const b of root.querySelectorAll("[data-say]")) {
    b.addEventListener("click", () => {
      box.value = b.dataset.say;
      fit();
      shown = [];
      out.textContent = "";
      load().then(() => render(true));
    });
  }
  new ResizeObserver(fit).observe(root);
})();
