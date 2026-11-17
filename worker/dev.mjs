// Server di prova locale (wrangler dev non parte su questo PC):
//   node worker/dev.mjs [porta]        → http://127.0.0.1:8797
// Serve public/ e passa /api/* al Worker vero, con D1 simulato su un file
// SQLite in worker/.dev/. Al primo avvio scarica una volta i feed NOAA.
// Il token per /api/update in locale è "dev".

import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createD1 } from "./d1-shim.mjs";
import { handle, update } from "./src/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const pub = join(here, "..", "public");
mkdirSync(join(here, ".dev"), { recursive: true });
const env = { DB: createD1(join(here, ".dev", "saa.sqlite")), UPDATE_TOKEN: "dev" };
const port = Number(process.argv[2] ?? 8797);

const empty = !(await env.DB.prepare("SELECT COUNT(*) AS n FROM goes").first())?.n;
if (empty) console.log("primo avvio, lettura NOAA:", await update(env, "cron"));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".css": "text/css" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (url.pathname.startsWith("/api")) {
      const body = req.method === "POST" ? undefined : undefined;
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body }), env, { waitUntil() {} });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^([/\\])+/, "");
    const file = join(pub, rel);
    if (!file.startsWith(pub) || !existsSync(file)) {
      res.writeHead(404).end("404");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end("errore");
  }
}).listen(port, "127.0.0.1", () => console.log(`pronto su http://127.0.0.1:${port}`));
