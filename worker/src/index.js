// saa-observatory — South Atlantic Anomaly: storico su D1 + API + dashboard.
//
// Perché un Worker: i feed NOAA SWPC tengono solo pochi giorni. Qui un Cron
// Trigger di Cloudflare li legge due volte al giorno e accumula tutto in D1,
// così lo storico cresce senza nessun programma acceso sul PC.
// Ogni giro legge i file "3 giorni": anche se un giro salta, il successivo
// recupera il buco.
//
// Aggiornamenti extra solo per il proprietario:
//   POST /api/update   con  Authorization: Bearer <UPDATE_TOKEN>
// (UPDATE_TOKEN è un secret: `wrangler secret put UPDATE_TOKEN`). Al massimo
// uno ogni MIN_MANUAL_GAP secondi.
//
// API in sola lettura (JSON, oppure CSV con ?format=csv):
//   GET /api/latest                      ultimi valori + scale NOAA S/G
//   GET /api/history?series=goes|kp|dst&days=N[&step=s][&format=csv]
//   GET /api/model[?format=csv]          serie SAA 1900–2030 calcolata da IGRF-14
//   GET /api/runs                        ultimi aggiornamenti
//   GET /api/health
// Tutto il resto è la dashboard statica in public/ (Workers Static Assets).
//
// JavaScript e non Rust: su Workers il Rust diventa WebAssembly, più pesante
// da avviare, e qui il lavoro è solo leggere JSON e scrivere su SQLite.

import MODEL from "./model.json" with { type: "json" };

const BASE = "https://services.swpc.noaa.gov";
export const SOURCES = {
  protons: "/json/goes/primary/integral-protons-3-day.json",
  electrons: "/json/goes/primary/integral-electrons-3-day.json",
  mag: "/json/goes/primary/magnetometers-3-day.json",
  kp: "/products/noaa-planetary-k-index.json",
  dst: "/products/kyoto-dst.json",
};

const BIN = 300; // 5 minuti
const DAY = 86400;
const OVERLAP = 6 * 3600; // si riscrivono le ultime 6 ore già in archivio
const MIN_MANUAL_GAP = 60;
const MAX_ROWS = 50000;

export const SERIES = {
  goes: { table: "goes", cols: ["p10", "p50", "p100", "e2", "hp"], native: BIN },
  kp: { table: "kp", cols: ["kp"], native: 3 * 3600 },
  dst: { table: "dst", cols: ["dst"], native: 3600 },
};

// ---- lettura delle fonti ---------------------------------------------------

/** "2026-11-14T12:40:00", con o senza Z, con T o spazio → epoch in secondi. */
export function parseTime(tag) {
  if (typeof tag !== "string" || tag.length < 16) return null;
  let s = tag.trim().replace(" ", "T");
  if (!/[zZ]$/.test(s) && !/[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

const num = (v) => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

/**
 * Alcuni prodotti SWPC sono array di oggetti, i più vecchi array di array con
 * la riga d'intestazione in testa: li portiamo tutti a oggetti.
 */
export function toObjects(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  if (Array.isArray(data[0])) {
    const head = data[0].map(String);
    return data.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }
  return data.filter((r) => r && typeof r === "object");
}

const ENERGY = { ">=10 MeV": "p10", ">=50 MeV": "p50", ">=100 MeV": "p100" };

/** Dai file GOES ai punti a 5 minuti: Map t -> {p10,p50,p100,e2,hp}. */
export function goesBins(protons, electrons, mag) {
  const bins = new Map();
  const bin = (t) => {
    const k = Math.floor(t / BIN) * BIN;
    let b = bins.get(k);
    if (!b) bins.set(k, (b = { p10: null, p50: null, p100: null, e2: null, hp: null, _hs: 0, _hn: 0 }));
    return b;
  };
  for (const r of toObjects(protons)) {
    const col = ENERGY[r.energy];
    const t = parseTime(r.time_tag);
    const v = num(r.flux);
    if (col && t !== null && v !== null && v >= 0) bin(t)[col] = v;
  }
  for (const r of toObjects(electrons)) {
    const t = parseTime(r.time_tag);
    const v = num(r.flux);
    if (r.energy === ">=2 MeV" && t !== null && v !== null && v >= 0) bin(t).e2 = v;
  }
  for (const r of toObjects(mag)) {
    const t = parseTime(r.time_tag);
    const v = num(r.Hp);
    if (t === null || v === null || r.arcjet_flag === true || Math.abs(v) > 2000) continue;
    const b = bin(t);
    b._hs += v;
    b._hn += 1;
  }
  for (const b of bins.values()) {
    if (b._hn) b.hp = Math.round((b._hs / b._hn) * 100) / 100;
    delete b._hs;
    delete b._hn;
  }
  return bins;
}

/** Serie semplice t -> valore da un prodotto con campo `field`. */
export function simpleSeries(data, field) {
  const out = new Map();
  for (const r of toObjects(data)) {
    const t = parseTime(r.time_tag);
    const v = num(r[field]);
    if (t !== null && v !== null) out.set(t, v);
  }
  return out;
}

/** Scarica le fonti in parallelo; una fonte che fallisce non blocca le altre. */
export async function collect(fetchFn = fetch) {
  const names = Object.keys(SOURCES);
  const settled = await Promise.allSettled(
    names.map(async (name) => {
      const res = await fetchFn(BASE + SOURCES[name], {
        headers: { "User-Agent": "saa-observatory-worker", Accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  );
  const data = {};
  const errors = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") data[names[i]] = s.value;
    else errors.push(`${names[i]}: ${s.reason?.message ?? s.reason}`);
  });
  return { data, errors };
}

// ---- archivio --------------------------------------------------------------

/** INSERT multi-riga a blocchi (D1 accetta al massimo 100 parametri). */
function upserts(db, table, cols, rows) {
  const all = ["t", ...cols];
  const per = Math.floor(100 / all.length);
  const stmts = [];
  const set = cols.map((c) => `${c}=COALESCE(excluded.${c},${table}.${c})`).join(",");
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const ph = chunk.map(() => `(${all.map(() => "?").join(",")})`).join(",");
    const sql = `INSERT INTO ${table} (${all.join(",")}) VALUES ${ph} ON CONFLICT(t) DO UPDATE SET ${set}`;
    stmts.push(db.prepare(sql).bind(...chunk.flatMap((r) => all.map((c) => r[c] ?? null))));
  }
  return stmts;
}

/** Legge le fonti e aggiorna D1. `trigger` = "cron" | "manuale". */
export async function update(env, trigger, now = Date.now(), fetchFn = fetch) {
  const db = env.DB;
  const { data, errors } = await collect(fetchFn);
  const last = await db
    .prepare("SELECT (SELECT MAX(t) FROM goes) AS g, (SELECT MAX(t) FROM kp) AS k, (SELECT MAX(t) FROM dst) AS d")
    .first();
  const after = (max) => (max ? max - OVERLAP : 0);

  const goes = [...goesBins(data.protons, data.electrons, data.mag)]
    .filter(([t]) => t > after(last?.g))
    .map(([t, v]) => ({ t, ...v }))
    .filter((r) => SERIES.goes.cols.some((c) => r[c] !== null));
  const kp = [...simpleSeries(data.kp, "Kp")].filter(([t]) => t > after(last?.k)).map(([t, kp]) => ({ t, kp }));
  const dst = [...simpleSeries(data.dst, "dst")].filter(([t]) => t > after(last?.d)).map(([t, dst]) => ({ t, dst }));

  const stmts = [
    ...upserts(db, "goes", SERIES.goes.cols, goes),
    ...upserts(db, "kp", ["kp"], kp),
    ...upserts(db, "dst", ["dst"], dst),
  ];
  const rows = goes.length + kp.length + dst.length;
  stmts.push(
    db
      .prepare("INSERT OR REPLACE INTO runs (t, trigger, rows, errors) VALUES (?, ?, ?, ?)")
      .bind(Math.floor(now / 1000), trigger, rows, errors.length ? errors.join("; ") : null),
  );
  await db.batch(stmts);
  if (errors.length) console.warn("fonti non raggiunte:", errors.join("; "));
  return { trigger, rows, goes: goes.length, kp: kp.length, dst: dst.length, errors };
}

// ---- scale NOAA ------------------------------------------------------------

/** Scala S (tempeste di radiazione solare) dal flusso >=10 MeV. */
export function sScale(p10) {
  if (p10 === null || p10 === undefined) return null;
  const lv = [10, 100, 1e3, 1e4, 1e5];
  let s = 0;
  while (s < 5 && p10 >= lv[s]) s++;
  return s;
}

/** Scala G (tempeste geomagnetiche) dal Kp. */
export function gScale(kp) {
  if (kp === null || kp === undefined) return null;
  return kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0;
}

// ---- statistiche dell'archivio --------------------------------------------

/**
 * Raggruppa in episodi i tempi (ordinati) che superano una soglia: due punti
 * distano al massimo `gap` secondi per stare nello stesso episodio.
 */
export function episodes(rows, gap, pick = "max") {
  const out = [];
  let cur = null;
  for (const [t, v] of rows) {
    if (cur && t - cur.end <= gap) {
      cur.end = t;
      if (pick === "max" ? v > cur.peak : v < cur.peak) {
        cur.peak = v;
        cur.peak_t = t;
      }
    } else {
      cur = { start: t, end: t, peak: v, peak_t: t };
      out.push(cur);
    }
  }
  return out;
}

export async function stats(db, nowS) {
  const since30 = nowS - 30 * DAY;
  const q = (sql, ...b) => (b.length ? db.prepare(sql).bind(...b) : db.prepare(sql));
  const [count, kpHist, maxP10, maxP100, maxE2, maxKp, minDst, storms, protons, dstStorms, dKp, dDst, dGoes] = await db.batch([
    q(`SELECT (SELECT COUNT(*) FROM goes) AS goes, (SELECT COUNT(*) FROM kp) AS kp, (SELECT COUNT(*) FROM dst) AS dst,
              (SELECT COUNT(*) FROM runs) AS runs, (SELECT MIN(t) FROM goes) AS first, (SELECT MAX(t) FROM goes) AS last`),
    q("SELECT CAST(kp AS INTEGER) AS b, COUNT(*) AS n FROM kp GROUP BY b ORDER BY b"),
    q("SELECT t, p10 AS v FROM goes WHERE p10 IS NOT NULL ORDER BY p10 DESC LIMIT 1"),
    q("SELECT t, p100 AS v FROM goes WHERE p100 IS NOT NULL ORDER BY p100 DESC LIMIT 1"),
    q("SELECT t, e2 AS v FROM goes WHERE e2 IS NOT NULL ORDER BY e2 DESC LIMIT 1"),
    q("SELECT t, kp AS v FROM kp ORDER BY kp DESC LIMIT 1"),
    q("SELECT t, dst AS v FROM dst ORDER BY dst ASC LIMIT 1"),
    q("SELECT t, kp FROM kp WHERE kp >= 5 ORDER BY t LIMIT 5000"),
    q("SELECT t, p10 FROM goes WHERE p10 >= 10 ORDER BY t LIMIT 5000"),
    q("SELECT t, dst FROM dst WHERE dst <= -50 ORDER BY t LIMIT 5000"),
    q("SELECT (t / 86400) * 86400 AS d, MAX(kp) AS v FROM kp WHERE t > ? GROUP BY t / 86400 ORDER BY d", since30),
    q("SELECT (t / 86400) * 86400 AS d, MIN(dst) AS v FROM dst WHERE t > ? GROUP BY t / 86400 ORDER BY d", since30),
    q("SELECT (t / 86400) * 86400 AS d, MAX(p10) AS p10, MAX(e2) AS e2 FROM goes WHERE t > ? GROUP BY t / 86400 ORDER BY d", since30),
  ]);
  const one = (r) => (r.results[0] ? { t: r.results[0].t, time: isoT(r.results[0].t), v: r.results[0].v } : null);
  const ev = (list) =>
    list.map((e) => ({ start: isoT(e.start), end: isoT(e.end), peak: e.peak, peak_time: isoT(e.peak_t), hours: Math.round((e.end - e.start) / 360) / 10 }));
  const hist = Array(10).fill(0);
  for (const r of kpHist.results) if (r.b >= 0 && r.b <= 9) hist[r.b] += r.n;
  const daily = new Map();
  const day = (d) => daily.get(d) ?? daily.set(d, { day: isoT(d).slice(0, 10), kp: null, dst: null, p10: null, e2: null }).get(d);
  for (const r of dKp.results) day(r.d).kp = r.v;
  for (const r of dDst.results) day(r.d).dst = r.v;
  for (const r of dGoes.results) Object.assign(day(r.d), { p10: r.p10, e2: r.e2 });
  const c = count.results[0] ?? {};
  return {
    archive: { ...c, first: isoT(c.first), last: isoT(c.last), days: c.first ? Math.round(((c.last - c.first) / DAY) * 10) / 10 : 0 },
    records: { p10_max: one(maxP10), p100_max: one(maxP100), e2_max: one(maxE2), kp_max: one(maxKp), dst_min: one(minDst) },
    kp_histogram: hist,
    storms_g: ev(episodes(storms.results.map((r) => [r.t, r.kp]), 3 * 3600)).map((e) => ({ ...e, G: gScale(e.peak), hours: e.hours + 3 })),
    storms_dst: ev(episodes(dstStorms.results.map((r) => [r.t, r.dst]), 3600, "min")),
    proton_events: ev(episodes(protons.results.map((r) => [r.t, r.p10]), 1800)).map((e) => ({ ...e, S: sScale(e.peak) })),
    daily_30d: [...daily.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
  };
}

// ---- ISS in tempo reale -----------------------------------------------------

const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544/positions";

/**
 * Posizione della ISS ora e traccia da -30 a +65 minuti (passo 5 min), dal
 * servizio pubblico wheretheiss.at. Risposta tenuta 20 s nella cache di
 * Cloudflare: il servizio accetta circa una richiesta al secondo.
 */
async function iss(request, ctx, now, fetchFn) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL("/api/iss", request.url).toString());
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const t0 = Math.floor(now / 1000);
  const times = Array.from({ length: 20 }, (_, i) => t0 + (i - 6) * 300);
  const get = async (ts) => {
    const res = await fetchFn(`${ISS_URL}?timestamps=${ts.join(",")}&units=kilometers`, {
      headers: { "User-Agent": "saa-observatory-worker", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  try {
    // in sequenza: due richieste in parallelo possono superare il limite
    const a = await get([t0, ...times.slice(0, 9)]);
    const b = await get(times.slice(9));
    const pt = (p) => ({ t: p.timestamp, lat: p.latitude, lon: p.longitude, alt: Math.round(p.altitude * 10) / 10 });
    const nowP = a[0];
    const body = {
      now: { ...pt(nowP), velocity_kmh: Math.round(nowP.velocity), visibility: nowP.visibility },
      track: [...new Map([...a.slice(1), ...b].map((p) => [p.timestamp, pt(p)])).values()].sort((x, y) => x.t - y.t),
      source: "wheretheiss.at",
    };
    const res = json(body, 200, { "Cache-Control": "public, max-age=20" });
    if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return json({ error: `posizione ISS non disponibile (${e.message})` }, 502);
  }
}

// ---- HTTP ------------------------------------------------------------------

const CORS = { "Access-Control-Allow-Origin": "*" };

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function csv(name, columns, rows, extra = {}) {
  const esc = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const body = [columns.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      ...CORS,
      ...extra,
    },
  });
}

function intParam(value, fallback, min, max) {
  if (value === null || !/^\d{1,12}$/.test(value)) return fallback;
  return Math.min(Math.max(Number(value), min), max);
}

/** Confronto a tempo costante per il token. */
function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const isoT = (t) => (t ? new Date(t * 1000).toISOString().replace(".000Z", "Z") : null);

export async function handle(request, env, ctx, now = Date.now(), fetchFn = fetch) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const nowS = Math.floor(now / 1000);
  const wantCsv = url.searchParams.get("format") === "csv";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Authorization" },
    });
  }

  if (path === "/api/update") {
    if (request.method !== "POST") return json({ error: "usa POST" }, 405);
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!env.UPDATE_TOKEN || !sameToken(token, env.UPDATE_TOKEN)) {
      return json({ error: "non autorizzato" }, 401);
    }
    const lastRun = await env.DB.prepare("SELECT MAX(t) AS t FROM runs WHERE trigger = 'manuale'").first();
    if (lastRun?.t && nowS - lastRun.t < MIN_MANUAL_GAP) {
      return json({ error: `attendi ${MIN_MANUAL_GAP - (nowS - lastRun.t)} s` }, 429);
    }
    return json(await update(env, "manuale", now, fetchFn));
  }

  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "solo GET" }, 405);

  switch (path) {
    case "/api/latest": {
      // per ogni grandezza GOES l'ultimo valore presente: le fonti non
      // arrivano tutte allo stesso minuto, l'ultimo punto può essere parziale
      const gc = SERIES.goes.cols;
      const [k, d, r, gMax, ...gs] = await env.DB.batch([
        env.DB.prepare("SELECT t, kp FROM kp ORDER BY t DESC LIMIT 1"),
        env.DB.prepare("SELECT t, dst FROM dst ORDER BY t DESC LIMIT 1"),
        env.DB.prepare("SELECT t, trigger, rows, errors FROM runs ORDER BY t DESC LIMIT 1"),
        env.DB.prepare("SELECT MAX(p10) AS p10max, MAX(p100) AS p100max, MAX(e2) AS e2max FROM goes WHERE t > ?").bind(nowS - DAY),
        ...gc.map((c) => env.DB.prepare(`SELECT t, ${c} AS v FROM goes WHERE ${c} IS NOT NULL ORDER BY t DESC LIMIT 1`)),
      ]);
      let goes = null;
      gs.forEach((res, i) => {
        const row = res.results[0];
        if (!row) return;
        goes ??= { t: row.t, times: {} };
        goes[gc[i]] = row.v;
        goes.times[gc[i]] = isoT(row.t);
        goes.t = Math.max(goes.t, row.t);
      });
      const kp = k.results[0] ?? null;
      const dst = d.results[0] ?? null;
      const run = r.results[0] ?? null;
      return json(
        {
          goes: goes && { ...goes, time: isoT(goes.t) },
          kp: kp && { ...kp, time: isoT(kp.t) },
          dst: dst && { ...dst, time: isoT(dst.t) },
          last_24h: gMax.results[0] ?? null,
          scales: { S: sScale(goes?.p10), G: gScale(kp?.kp) },
          last_update: run && { ...run, time: isoT(run.t) },
          now: isoT(nowS),
        },
        200,
        { "Cache-Control": "public, max-age=60" },
      );
    }
    case "/api/history": {
      const name = url.searchParams.get("series") ?? "goes";
      const s = SERIES[name];
      if (!s) return json({ error: "series = goes | kp | dst" }, 400);
      const days = intParam(url.searchParams.get("days"), 7, 1, 3650);
      const since = nowS - days * DAY;
      // passo automatico: circa 2000 punti al massimo, mai sotto la cadenza nativa
      const auto = Math.max(s.native, Math.ceil((days * DAY) / 2000 / s.native) * s.native);
      const step = intParam(url.searchParams.get("step"), auto, s.native, 30 * DAY);
      const agg = s.cols.map((c) => (name === "goes" && c !== "hp" ? `MAX(${c})` : `ROUND(AVG(${c}),3)`) + ` AS ${c}`);
      const sql =
        step === s.native
          ? `SELECT t, ${s.cols.join(",")} FROM ${s.table} WHERE t > ?1 ORDER BY t LIMIT ${MAX_ROWS}`
          : `SELECT (t / ?2) * ?2 AS b, ${agg.join(",")} FROM ${s.table} WHERE t > ?1 GROUP BY t / ?2 ORDER BY 1 LIMIT ${MAX_ROWS}`;
      const stmt = env.DB.prepare(sql);
      const rows = await (step === s.native ? stmt.bind(since) : stmt.bind(since, step)).raw();
      const columns = ["t", ...s.cols];
      const cache = { "Cache-Control": "public, max-age=300" };
      if (wantCsv) {
        return csv(
          `saa_${name}_${days}g.csv`,
          ["time_utc", ...columns],
          rows.map((r) => [isoT(r[0]), ...r]),
          cache,
        );
      }
      return json(
        {
          series: name,
          columns,
          step,
          since,
          note: name === "goes" && step !== s.native ? "flussi: massimo nel passo; hp: media" : undefined,
          count: rows.length,
          rows,
        },
        200,
        cache,
      );
    }
    case "/api/model": {
      const cache = { "Cache-Control": "public, max-age=86400" };
      if (wantCsv) {
        return csv("saa_igrf14.csv", MODEL.columns, MODEL.rows.map((r) => MODEL.columns.map((c) => r[c])), cache);
      }
      return json(MODEL, 200, cache);
    }
    case "/api/stats":
      return json(await stats(env.DB, nowS), 200, { "Cache-Control": "public, max-age=600" });
    case "/api/iss":
      return iss(request, ctx, now, fetchFn);
    case "/api/runs": {
      const rows = await env.DB.prepare("SELECT t, trigger, rows, errors FROM runs ORDER BY t DESC LIMIT 50").all();
      return json(rows.results.map((r) => ({ ...r, time: isoT(r.t) })));
    }
    case "/api/health": {
      const row = await env.DB.prepare(
        "SELECT (SELECT COUNT(*) FROM goes) AS goes, (SELECT MIN(t) FROM goes) AS first, (SELECT MAX(t) FROM goes) AS last, (SELECT MAX(t) FROM runs) AS run",
      ).first();
      const age = row?.last ? nowS - row.last : null;
      // due giri al giorno: oltre 26 ore senza dati nuovi è un guasto
      const ok = age !== null && age < 26 * 3600;
      return json({ ok, ...row, first: isoT(row?.first), last: isoT(row?.last), run: isoT(row?.run), age_s: age }, ok ? 200 : 503);
    }
    case "/api":
      return json({
        endpoints: [
          "GET /api/latest",
          "GET /api/history?series=goes|kp|dst&days=7[&step=s][&format=csv]",
          "GET /api/model[?format=csv]",
          "GET /api/stats",
          "GET /api/iss",
          "GET /api/runs",
          "GET /api/health",
          "POST /api/update (Authorization: Bearer <token>)",
        ],
      });
    default:
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json({ error: "404" }, 404);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(update(env, "cron", event.scheduledTime));
  },
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (e) {
      console.error(e);
      return json({ error: "errore interno" }, 500);
    }
  },
};
