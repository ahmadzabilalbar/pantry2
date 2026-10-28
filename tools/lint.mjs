/** `node --check` on every JavaScript file in the project. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const roots = ["api", "lib", "tools", "public/app.js"];
const files = [];
function walk(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  } else if (/\.(m?js)$/.test(p)) {
    files.push(p);
  }
}
roots.forEach(walk);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    failed++;
    console.error(`✗ ${f}\n${e.stderr}`);
  }
}
console.log(`${files.length - failed}/${files.length} files OK`);
process.exit(failed ? 1 : 0);
