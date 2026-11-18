// Prove del Worker senza wrangler:  node test.mjs  [--offline]
//
// 1. funzioni pure su dati finti;
// 2. aggiornamento completo contro D1 finto (node:sqlite) con dati finti;
// 3. percorsi HTTP, token, limite agli aggiornamenti manuali;
// 4. (online) feed NOAA veri: ogni serie deve produrre righe.

import assert from "node:assert/strict";
import { createD1 } from "./d1-shim.mjs";
import worker, { episodes, goesBins, gScale, handle, parseTime, simpleSeries, sScale, toObjects, update } from "./src/index.js";

const offline = process.argv.includes("--offline");
const ctx = { waitUntil: () => {} };

// ---- 1. funzioni pure --------------------------------------------------------
assert.equal(parseTime("2026-11-14T11:04:00Z"), 1794654240);
assert.equal(parseTime("2026-11-14T11:04:00"), 1794654240);
assert.equal(parseTime("2026-11-14 11:04:00.000"), 1794654240);
assert.equal(parseTime("boh"), null);

assert.deepEqual(toObjects([["time_tag", "Kp"], ["2026-11-10 00:00:00.000", "3.00"]]), [{ time_tag: "2026-11-10 00:00:00.000", Kp: "3.00" }]);
assert.equal(simpleSeries([["time_tag", "Kp"], ["2026-11-10 00:00:00.000", "3.00"]], "Kp").get(1794268800), 3);

const T0 = "2026-11-17T10:00:00Z";
const t0 = parseTime(T0);
const protons = [
  { time_tag: T0, energy: ">=10 MeV", flux: 0.3 },
  { time_tag: T0, energy: ">=50 MeV", flux: 0.1 },
  { time_tag: T0, energy: ">=100 MeV", flux: 0.05 },
  { time_tag: T0, energy: ">=1 MeV", flux: 60 },
  { time_tag: "2026-11-17T10:05:00Z", energy: ">=10 MeV", flux: -1e5 }, // valore di riempimento
];
const electrons = [{ time_tag: T0, energy: ">=2 MeV", flux: 3600 }];
const mag = [
  { time_tag: "2026-11-17T10:00:00Z", Hp: 100 },
  { time_tag: "2026-11-17T10:01:00Z", Hp: 110 },
  { time_tag: "2026-11-17T10:02:00Z", Hp: 99999 }, // fuori scala
  { time_tag: "2026-11-17T10:03:00Z", Hp: 50, arcjet_flag: true },
];
const bins = goesBins(protons, electrons, mag);
assert.deepEqual(bins.get(t0), { p10: 0.3, p50: 0.1, p100: 0.05, e2: 3600, hp: 105 });
assert.equal(bins.get(t0 + 300)?.p10 ?? null, null);

assert.equal(sScale(0.3), 0);
assert.equal(sScale(10), 1);
assert.equal(sScale(15000), 4);
assert.equal(gScale(4.67), 0);
assert.equal(gScale(5), 1);
assert.equal(gScale(9), 5);
assert.equal(sScale(null), null);
console.log("1. funzioni pure: ok");

// ---- 2. aggiornamento con fonti finte ----------------------------------------
function fakeFetch(files) {
  return async (url) => {
    const key = Object.keys(files).find((k) => url.endsWith(k));
    if (!key) return new Response("no", { status: 404 });
    return Response.json(files[key]);
  };
}
const FAKE = {
  "integral-protons-3-day.json": protons,
  "integral-electrons-3-day.json": electrons,
  "magnetometers-3-day.json": mag,
  "noaa-planetary-k-index.json": [{ time_tag: "2026-11-17T06:00:00", Kp: 5.33 }],
  // kyoto-dst manca: deve risultare fra gli errori senza bloccare il resto
};

const env = { DB: createD1(), UPDATE_TOKEN: "segreto-di-prova-123" };
const now = Date.parse("2026-11-17T12:00:00Z");
const r1 = await update(env, "cron", now, fakeFetch(FAKE));
assert.equal(r1.goes, 1);
assert.equal(r1.kp, 1);
assert.equal(r1.dst, 0);
assert.match(r1.errors.join(), /dst: HTTP 404/);
// un secondo giro con un valore nullo non deve cancellare quelli salvati
const r2 = await update(env, "cron", now + 1000, fakeFetch({ ...FAKE, "integral-electrons-3-day.json": [] }));
assert.equal(r2.goes, 1);
const row = await env.DB.prepare("SELECT * FROM goes").first();
assert.equal(row.e2, 3600);
console.log("2. aggiornamento su D1 finto: ok");

// ---- 3. HTTP -------------------------------------------------------------------
const get = async (path) => {
  const res = await handle(new Request("https://x" + path), env, ctx, now);
  return { status: res.status, type: res.headers.get("Content-Type"), body: await res.text() };
};
let res = await get("/api/latest");
assert.equal(res.status, 200);
let body = JSON.parse(res.body);
assert.equal(body.goes.p10, 0.3);
assert.equal(body.scales.S, 0);
assert.equal(body.scales.G, 1);
assert.equal(body.last_update.trigger, "cron");

res = await get("/api/history?series=goes&days=3");
body = JSON.parse(res.body);
assert.equal(body.count, 1);
assert.deepEqual(body.columns, ["t", "p10", "p50", "p100", "e2", "hp"]);

res = await get("/api/history?series=goes&days=3&step=3600");
body = JSON.parse(res.body);
assert.equal(body.step, 3600);
assert.equal(body.rows[0][0], Math.floor(t0 / 3600) * 3600);

res = await get("/api/history?series=kp&days=7&format=csv");
assert.match(res.type, /text\/csv/);
assert.match(res.body, /^time_utc,t,kp\n2026-11-17T06:00:00Z,\d+,5\.33\n$/);

res = await get("/api/history?series=boh");
assert.equal(res.status, 400);

res = await get("/api/model");
body = JSON.parse(res.body);
assert.ok(body.rows.length > 100);
assert.ok(body.rows.find((r) => r.year === 2026).p1_nt > 21000);
res = await get("/api/model?format=csv");
assert.match(res.body, /^year,p1_lat,p1_lon,p1_nt/);

res = await get("/api/health");
assert.equal(res.status, 200);

// token: assente, sbagliato, giusto, poi limite di frequenza
const post = (token) =>
  handle(
    new Request("https://x/api/update", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} }),
    env,
    ctx,
    now + 5000,
    fakeFetch(FAKE),
  );
assert.equal((await post()).status, 401);
assert.equal((await post("sbagliato")).status, 401);
assert.equal((await post("segreto-di-prova-123")).status, 200);
assert.equal((await post("segreto-di-prova-123")).status, 429);
assert.equal((await get("/api/update")).status, 405);
// senza secret configurato nessuno può aggiornare
assert.equal(
  (await handle(new Request("https://x/api/update", { method: "POST", headers: { Authorization: "Bearer x" } }), { DB: env.DB }, ctx, now)).status,
  401,
);
// percorso sconosciuto senza ASSETS
assert.equal((await get("/nulla")).status, 404);
console.log("3. HTTP, token e limiti: ok");

// ---- 3b. statistiche ed episodi ----------------------------------------------
assert.deepEqual(
  episodes([[0, 5], [10800, 6], [30000, 5.3]], 10800).map((e) => [e.start, e.end, e.peak]),
  [[0, 10800, 6], [30000, 30000, 5.3]],
);
res = await get("/api/stats");
body = JSON.parse(res.body);
assert.equal(body.archive.goes, 1);
assert.equal(body.kp_histogram[5], 1);
assert.equal(body.storms_g.length, 1);
assert.equal(body.storms_g[0].G, 1);
assert.equal(body.records.kp_max.v, 5.33);
assert.equal(body.proton_events.length, 0);
assert.ok(Array.isArray(body.daily_30d));

// ISS con servizio finto
const issFetch = async (url) => {
  const ts = new URL(url).searchParams.get("timestamps").split(",").map(Number);
  return Response.json(ts.map((t, i) => ({ timestamp: t, latitude: -20 + i, longitude: -50 + i, altitude: 420.12, velocity: 27600.4, visibility: "daylight" })));
};
const ri = await handle(new Request("https://x/api/iss"), env, ctx, now, issFetch);
body = await ri.json();
assert.equal(ri.status, 200);
assert.equal(body.now.lat, -20);
assert.equal(body.now.velocity_kmh, 27600);
assert.equal(body.track.length, 20);
const rbad = await handle(new Request("https://x/api/iss"), env, ctx, now, async () => new Response("no", { status: 503 }));
assert.equal(rbad.status, 502);
console.log("3b. statistiche e ISS: ok");

// ---- 4. fonti vere -------------------------------------------------------------
if (!offline) {
  const live = { DB: createD1() };
  const t = performance.now();
  const r = await update(live, "cron", Date.now());
  console.log(`4. NOAA vero: ${r.goes} punti GOES, ${r.kp} Kp, ${r.dst} Dst in ${(performance.now() - t).toFixed(0)} ms`, r.errors);
  assert.deepEqual(r.errors, []);
  assert.ok(r.goes > 500, "attesi ~860 punti GOES su 3 giorni");
  assert.ok(r.kp > 10);
  assert.ok(r.dst > 24);
  const latest = JSON.parse(await (await handle(new Request("https://x/api/latest"), live, ctx)).text());
  for (const c of ["p10", "p50", "p100", "e2", "hp"]) assert.equal(typeof latest.goes[c], "number", c);
  console.log("   ultimo GOES:", latest.goes, "Kp", latest.kp, "Dst", latest.dst);
}

assert.equal(typeof worker.fetch, "function");
assert.equal(typeof worker.scheduled, "function");
console.log("tutto ok");
