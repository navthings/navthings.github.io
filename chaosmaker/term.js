// my frontend for termos by chaosmaker
import { Termos, resolvePointerToHome } from "./termos.js";

const term = document.querySelector(".term");
const out = document.querySelector(".term-out");
const input = document.querySelector(".term-in");
const promptEl = document.querySelector(".term-prompt");
const HOME = "/home/nav";

const print = (text, cls) => {
  const s = document.createElement("span");
  if (cls) s.className = cls;
  s.textContent = text;
  out.append(s);
  term.scrollTop = term.scrollHeight;
};

print("loading termos...\n", "dim");
const json = await fetch("fs.json").then((r) => r.text());
const shell = await Termos.getShell({
  filesystem: { json },
  users: [{ username: "nav", groups: ["users"], home: HOME }],
  groups: ["users"],
  general: { user: "nav" },
});
out.textContent = "";
print("termos 0.1.1, a tiny unix in your browser by chaosmaker\n", "dim");
print("type help, or cat readme.md\n\n", "dim");

// a map of the files so tab can complete names
const tree = new Map();
const walk = (node, path) => {
  const kids = node.children || [];
  tree.set(path || "/", kids.map((k) => ({ name: k.name, dir: k.type === "directory" })));
  for (const k of kids) if (k.type === "directory") walk(k, (path === "/" ? "" : path) + "/" + k.name);
};
walk(JSON.parse(json).dev[0].tree, "/");

const cwd = () => resolvePointerToHome(shell.State, shell.Session.cwd);
const absCwd = () => cwd().replace(/^~/, HOME) || "/";
const setPrompt = () => (promptEl.textContent = `nav@navthings:${cwd()}$ `);
setPrompt();

let busy = false;
const history = [];
let hi = 0;

shell.on("stdout", (p) => {
  let text = new TextDecoder().decode(p.data);
  if (text.includes("\x1b[2J")) {
    out.textContent = "";
    text = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  }
  print(text);
});

shell.on("result", (p) => {
  if (p.result.type === "error") print(p.result.error.message + "\n", "err");
  busy = false;
  setPrompt();
  term.scrollTop = term.scrollHeight;
});

const HELP = `commands
  ls          list files (always long format here)
  cd <dir>    move around, ~ is home
  cat <file>  read a file
  pwd         where am i
  echo <txt>  say something
  touch <f>   make an empty file
  clear       clear the screen
  help        this
  exit        back to my site

ls is aliased to ls -l because termos doesnt do the short format yet.
`;

const run = async (line) => {
  print(promptEl.textContent + line + "\n");
  const trimmed = line.trim();
  if (!trimmed) return;
  history.push(trimmed);
  hi = history.length;
  const [cmd, ...args] = trimmed.split(/\s+/);

  // a few things handled here, the rest goes to termos
  if (cmd === "help") return print(HELP);
  if (cmd === "exit") return (location.href = "../");
  if (cmd === "sudo") return print("nav is not in the sudoers file. this incident will be reported.\n", "err");
  let toRun = trimmed;
  if (cmd === "ls" && !args.some((a) => a.startsWith("-"))) toRun = ["ls", "-l", ...args].join(" ");

  busy = true;
  await shell.execute(toRun);
};

const complete = () => {
  const val = input.value;
  const parts = val.split(" ");
  const last = parts.pop();
  const slash = last.lastIndexOf("/");
  const dirPart = slash >= 0 ? last.slice(0, slash + 1) : "";
  const prefix = last.slice(slash + 1);
  let base = dirPart.startsWith("/") ? dirPart : dirPart.startsWith("~") ? HOME + dirPart.slice(1) : absCwd() + "/" + dirPart;
  const stack = [];
  for (const seg of base.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  const kids = tree.get("/" + stack.join("/")) || [];
  const hits = kids.filter((k) => k.name.startsWith(prefix) && (prefix.startsWith(".") || !k.name.startsWith(".")));
  if (hits.length === 1) {
    const h = hits[0];
    input.value = [...parts, dirPart + h.name + (h.dir ? "/" : parts.length ? "" : " ")].join(" ");
  } else if (hits.length > 1) {
    print(promptEl.textContent + val + "\n");
    print(hits.map((h) => h.name + (h.dir ? "/" : "")).join("  ") + "\n");
  }
};

input.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (busy) return;
    const line = input.value;
    input.value = "";
    await run(line);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (hi > 0) input.value = history[--hi];
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    hi = Math.min(history.length, hi + 1);
    input.value = history[hi] ?? "";
  } else if (e.key === "Tab") {
    e.preventDefault();
    complete();
  } else if (e.key === "c" && e.ctrlKey) {
    e.preventDefault();
    if (busy) shell.sendInput("ctrl+c");
    else { print(promptEl.textContent + input.value + "^C\n"); input.value = ""; }
  } else if (e.key === "l" && e.ctrlKey) {
    e.preventDefault();
    out.textContent = "";
  }
});

// clicking anywhere in the terminal types into it, unless youre selecting text
term.addEventListener("click", () => {
  if (!getSelection().toString()) input.focus({ preventScroll: true });
});
