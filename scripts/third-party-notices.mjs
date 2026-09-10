import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
let notices = "NHEWR STUDIOS - THIRD PARTY NOTICES\n\n";
for (const [directory, info] of Object.entries(lock.packages)) {
  if (!directory || info.dev) continue;
  let names; try { names = await readdir(directory); } catch { continue; }
  const license = names.find(name => /^licen[cs]e(?:\.|$)/i.test(name));
  notices += `\n${"=".repeat(72)}\n${directory.replace(/^node_modules\//, "")} ${info.version}\nLicense: ${info.license || "See package license"}\n\n`;
  if (license) notices += await readFile(path.join(directory, license), "utf8");
}
await writeFile("creditos/TERCEIROS.txt", notices);
console.log("Third-party notices generated.");
