import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { readFile } from "node:fs/promises";
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function start(port) {
  const child = spawn(process.execPath, ["scripts/local-server.mjs", "--no-open", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", b => stdout += b); child.stderr.on("data", b => stderr += b);
  return { child, text: () => stdout + stderr, ready: new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(stdout + stderr || "Server timeout")); }, 15000);
    child.stdout.on("data", () => { const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("exit", code => { clearTimeout(timeout); if (code !== 0) reject(new Error(stderr)); });
  }) };
}

test("local server serves assets, rejects traversal, reuses its instance and skips occupied ports", { timeout: 30000 }, async () => {
  const running = start(0); let collision; let other;
  try {
    const port = await running.ready;
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(base); assert.equal(response.status, 200); assert.match(await response.text(), /Nhewr Studios/);
    const logo = await fetch(base + "/mascote.png"); assert.equal(logo.headers.get("content-type"), "image/png"); assert.ok((await logo.arrayBuffer()).byteLength > 10000);
    const health = await (await fetch(base + "/__nhewr_health")).json(); assert.equal(health.app, "nhewr-studio"); assert.equal(health.version, version);
    assert.equal((await fetch(base + "/..%2fpackage.json")).status, 404);
    assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
    const forbidden = await new Promise(resolve => { const request = http.get(base, { headers: { Host: "evil.example" } }, result => { result.resume(); resolve(result.statusCode); }); request.on("error", error => { throw error; }); });
    assert.equal(forbidden, 403);
    const reused = start(port); const exit = once(reused.child, "exit"); await reused.ready; assert.equal((await exit)[0], 0); assert.match(reused.text(), /ja esta aberto/);
    collision = http.createServer((req, res) => res.end("unrelated")); collision.listen(0, "127.0.0.1"); await once(collision, "listening");
    const occupiedPort = collision.address().port;
    other = start(occupiedPort); const chosen = await other.ready; assert.notEqual(chosen, occupiedPort);
    assert.equal(await (await fetch(`http://127.0.0.1:${occupiedPort}`)).text(), "unrelated");
  } finally {
    running.child.kill(); other?.child.kill(); collision?.close(); collision?.closeAllConnections();
  }
});
