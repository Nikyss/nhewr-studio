import http from "node:http";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = path.join(project, "release");
const version = JSON.parse(await readFile(path.join(project, "package.json"), "utf8")).version;
const instance = createHash("sha256").update(project).digest("hex").slice(0, 20);
const noOpen = process.argv.includes("--no-open");
const at = process.argv.indexOf("--port");
let port = at >= 0 ? Number(process.argv[at + 1]) : 5173;
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Porta invalida.");
try { await stat(path.join(root, "index.html")); } catch { throw new Error("Interface nao encontrada. Execute INICIAR.bat ou npm run build."); }
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host ?? "")) { res.writeHead(403); res.end(); return; }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    if (pathname === "/__nhewr_health") {
      res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ app: "nhewr-studio", version, instance })); return;
    }
    if (pathname.includes("\0") || pathname.includes("\\")) { res.writeHead(400); res.end(); return; }
    const filename = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    const real = await realpath(filename);
    const relative = path.relative(root, real);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !(await stat(real)).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", mime[path.extname(real)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(real).on("error", () => res.destroy()).pipe(res);
  } catch { res.writeHead(404); res.end("Arquivo nao encontrado."); }
});

function openBrowser(url) {
  if (noOpen) return;
  const command = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => console.log("Abra este endereco no navegador: " + url)); child.unref();
}

for (let attempt = 0; attempt < 30; attempt++) {
  try {
    await new Promise((resolve, reject) => {
      const failed = error => { server.off("listening", ready); reject(error); };
      const ready = () => { server.off("error", failed); resolve(); };
      server.once("error", failed); server.once("listening", ready); server.listen(port, "127.0.0.1");
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`Nhewr Studios V${version}\n${url}\nMantenha esta janela aberta. Ctrl+C encerra o servidor.`);
    openBrowser(url); break;
  } catch (error) {
    if (error.code !== "EADDRINUSE" || attempt === 29) throw error;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__nhewr_health`, { signal: AbortSignal.timeout(1000) });
      const found = await response.json();
      if (found.app === "nhewr-studio" && found.instance === instance && found.version === version) {
        console.log(`Nhewr Studios ja esta aberto em http://127.0.0.1:${port}/`); openBrowser(`http://127.0.0.1:${port}/`); process.exit(0);
      }
    } catch { /* Occupied ports belonging to other apps are left untouched. */ }
    port++;
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.close(); server.closeAllConnections(); });
