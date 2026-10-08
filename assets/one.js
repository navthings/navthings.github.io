const items = [...document.querySelectorAll(".index > li")];
const rows = items.map((li) => li.querySelector(".row"));
const fine = matchMedia("(hover: hover) and (pointer: fine)");
let hoverTimer;

function select(li, { remember = true } = {}) {
  for (const it of items) {
    const on = it === li;
    it.classList.toggle("is-active", on);
    it.querySelector(".row").setAttribute("aria-expanded", on);
  }
  if (remember) history.replaceState(null, "", "#" + li.querySelector(".panel").id);
}

for (const [i, li] of items.entries()) {
  const row = rows[i];
  row.setAttribute("aria-controls", li.querySelector(".panel").id);

  row.addEventListener("click", (e) => {
    e.preventDefault();
    select(li);
  });

  // a short wait so sweeping the mouse across the list doesnt flicker through every panel
  row.addEventListener("pointerenter", () => {
    if (!fine.matches) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => select(li), 70);
  });
  row.addEventListener("pointerleave", () => clearTimeout(hoverTimer));

  row.addEventListener("focus", () => select(li));

  row.addEventListener("keydown", (e) => {
    const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    rows[(next + rows.length) % rows.length].focus();
  });
}

const fromHash = items.find((li) => "#" + li.querySelector(".panel").id === location.hash);
select(fromHash || items[0], { remember: false });

const copy = document.querySelector("[data-copy]");
copy.addEventListener("click", () => {
  const addr = copy.dataset.copy;
  const mail = () => (location.href = "mailto:" + addr);
  if (!navigator.clipboard) return mail();
  navigator.clipboard.writeText(addr).then(() => {
    copy.textContent = "copied, talk soon";
    setTimeout(() => (copy.textContent = addr), 1600);
  }, mail);
});
