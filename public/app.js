// Dashboard South Atlantic Anomaly: mappa IGRF-14, ISS, storico NOAA da D1.
import { field, coefficientsFor, dipole, secularF, YEAR_MIN, YEAR_MAX } from "./igrf.js";
import { HELP } from "./help.js";

// ---------------------------------------------------------------------------
// Stato e utilità
// ---------------------------------------------------------------------------
const API = new URLSearchParams(location.search).get("api") || "";
const nowDate = new Date();
const NOW_YEAR = nowDate.getUTCFullYear() + (nowDate.getUTCMonth() + nowDate.getUTCDate() / 31) / 12;
const CUR = Math.floor(NOW_YEAR);
const KEY_STORE = "saa-update-token";
const ISS_SAA_NT = 22000; // soglia "dentro la SAA" alla quota della ISS
const UDINE = { lat: 46.06, lon: 13.24, name: "Udine" };
const state = {
  year: Math.min(CUR, YEAR_MAX), alt: 0, qty: "F", days: 3, playing: null, model: null,
  point: { ...UDINE }, iss: null, issOn: true,
};

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(x)) ? "--" : x.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtSci = (x) => (x === null || x === undefined) ? "--" : x >= 100 ? fmt(x, 0) : x.toLocaleString("it-IT", { maximumSignificantDigits: 3 });
const isoShort = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");
const compass = (az) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"][Math.round(az / 22.5) % 16];
const latS = (v) => `${fmt(Math.abs(v), 2)}°${v < 0 ? "S" : "N"}`;
const lonS = (v) => `${fmt(Math.abs(v), 2)}°${v < 0 ? "O" : "E"}`;
const wrapLon = (l) => ((l + 540) % 360) - 180;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const store = {
  get() { try { return localStorage.getItem(KEY_STORE); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(KEY_STORE, v) : localStorage.removeItem(KEY_STORE); } catch {} },
};

function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = msg;
  $("toastBox").appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function getJSON(path) {
  const r = await fetch(API + path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

function modelRow(year) {
  return state.model?.rows.find((r) => r.year === Math.round(year)) ?? null;
}

// ---------------------------------------------------------------------------
// Pulsanti «?»
// ---------------------------------------------------------------------------
let helpBtn = null;
function closeHelp() {
  $("helpPop").style.display = "none";
  helpBtn?.setAttribute("aria-expanded", "false");
  helpBtn = null;
}
function openHelp(btn) {
  const h = HELP[btn.dataset.help];
  if (!h) return;
  if (helpBtn === btn) return closeHelp();
  closeHelp();
  helpBtn = btn;
  btn.setAttribute("aria-expanded", "true");
  $("helpTitle").textContent = h.t;
  $("helpText").textContent = h.x;
  const pop = $("helpPop");
  pop.style.display = "block";
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth, hgt = pop.offsetHeight;
  let left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
  let top = r.bottom + 8;
  if (top + hgt > window.innerHeight - 12) top = Math.max(12, r.top - hgt - 8);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}
function wireHelp() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.(".help");
    if (b) { e.stopPropagation(); openHelp(b); return; }
    if (!e.target.closest?.("#helpPop")) closeHelp();
  });
  $("helpClose").addEventListener("click", closeHelp);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeHelp(); });
  window.addEventListener("scroll", closeHelp, { passive: true });
  document.querySelectorAll(".help").forEach((b) => {
    b.setAttribute("aria-expanded", "false");
    b.title = HELP[b.dataset.help]?.t ?? "";
  });
}

// ---------------------------------------------------------------------------
// Grandezze della mappa e colori
// ---------------------------------------------------------------------------
const SEQ_F = [
  [0.00, [244, 63, 94, 0.78]], [0.18, [251, 113, 133, 0.62]], [0.38, [245, 158, 11, 0.50]],
  [0.60, [56, 189, 248, 0.28]], [0.85, [59, 130, 246, 0.10]], [1.00, [59, 130, 246, 0.0]],
];
const SEQ_H = [
  [0.00, [168, 85, 247, 0.70]], [0.35, [59, 130, 246, 0.45]], [0.70, [0, 229, 255, 0.30]], [1.00, [16, 185, 129, 0.20]],
];
const DIV = [
  [0.00, [244, 63, 94, 0.75]], [0.30, [251, 146, 60, 0.45]], [0.50, [148, 163, 184, 0.04]],
  [0.70, [56, 189, 248, 0.45]], [1.00, [59, 130, 246, 0.75]],
];
// scala neutra per grandezze con segno ma senza "buono/cattivo" (Z, I, D)
const DIVN = [
  [0.00, [168, 85, 247, 0.72]], [0.30, [129, 140, 248, 0.40]], [0.50, [148, 163, 184, 0.04]],
  [0.70, [45, 212, 191, 0.40]], [1.00, [16, 185, 129, 0.72]],
];
function ramp(stops, u) {
  u = Math.min(1, Math.max(0, u));
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i][0]) {
      const [u0, c0] = stops[i - 1], [u1, c1] = stops[i];
      const t = (u - u0) / (u1 - u0);
      return c0.map((v, k) => v + (c1[k] - v) * t);
    }
  }
  return stops.at(-1)[1];
}
const k400 = (alt) => (alt ? 0.83 : 1);
const QTY = {
  F: { title: "F (nT)", pal: SEQ_F, range: (a) => (a ? [18500, 27000] : [21500, 32000]), levels: (a) => (a ? [19000, 20000, 21000, 22000, 24000] : [22500, 23000, 24000, 26000, 28000, 30000]), strong: (a) => (a ? [22000] : [23000, 24000]), unit: "nT", d: 0 },
  SV: { title: "dF/dt (nT/anno)", pal: DIV, range: () => [-120, 120], levels: () => [-90, -60, -30, 0, 30, 60], strong: () => [0], unit: "nT/anno", d: 1 },
  H: { title: "H (nT)", pal: SEQ_H, range: (a) => [0, 40000 * k400(a)], levels: (a) => [5000, 10000, 15000, 20000, 25000, 30000].map((v) => v * k400(a)), strong: () => [], unit: "nT", d: 0 },
  Z: { title: "Z (nT, + verso il basso)", pal: DIVN, range: (a) => [-60000 * k400(a), 60000 * k400(a)], levels: (a) => [-40000, -20000, 0, 20000, 40000].map((v) => v * k400(a)), strong: () => [0], unit: "nT", d: 0 },
  I: { title: "Inclinazione (°)", pal: DIVN, range: () => [-90, 90], levels: () => [-60, -30, 0, 30, 60], strong: () => [0], unit: "°", d: 1 },
  D: { title: "Declinazione (°, + Est)", pal: DIVN, range: () => [-40, 40], levels: () => [-30, -20, -10, 0, 10, 20, 30], strong: () => [0], unit: "°", d: 1 },
};

/** Valore della grandezza scelta in un punto. */
function qtyAt(q, lat, lon, alt, year, c0, c1) {
  if (q === "SV") return field(lat, lon, alt, year + 0.5, c1).F - field(lat, lon, alt, year - 0.5, c0).F;
  const f = field(lat, lon, alt, year, c0);
  return f[q];
}

function drawColorbar() {
  const c = $("colorbar"), ctx = c.getContext("2d");
  const Q = QTY[state.qty];
  ctx.clearRect(0, 0, c.width, c.height);
  for (let x = 0; x < c.width; x++) {
    const [r, g, b, a] = ramp(Q.pal, x / (c.width - 1));
    ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(a, 0.18)})`;
    ctx.fillRect(x, 0, 1, c.height);
  }
  const [lo, hi] = Q.range(state.alt);
  $("cbTitle").textContent = Q.title + (state.alt ? " · 400 km" : " · suolo");
  $("cbMin").textContent = (state.qty === "F" ? "" : "≤ ") + fmt(lo);
  $("cbMid").textContent = Q.pal === DIV || Q.pal === DIVN ? "0" : "";
  $("cbMax").textContent = "≥ " + fmt(hi);
}

// ---------------------------------------------------------------------------
// Mappa
// ---------------------------------------------------------------------------
const BOX = { s: -75, n: 25, w: -130, e: 70 };
let map, fieldLayer, contourLayer, markLayer, issLayer, pointMarker;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

function computeField(year, alt, q, fast) {
  const c0 = coefficientsFor(q === "SV" ? year - 0.5 : year);
  const c1 = q === "SV" ? coefficientsFor(year + 0.5) : null;
  const Q = QTY[q];
  const W = fast ? 200 : 400, H = fast ? 120 : 240;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  const yN = mercY(BOX.n), yS = mercY(BOX.s);
  const [lo, hi] = Q.range(alt);
  for (let j = 0; j < H; j++) {
    const lat = invMercY(yN - ((j + 0.5) / H) * (yN - yS));
    for (let i = 0; i < W; i++) {
      const lon = BOX.w + ((i + 0.5) / W) * (BOX.e - BOX.w);
      const v = qtyAt(q, lat, lon, alt, year, c0, c1);
      const [r, g, b, a] = ramp(Q.pal, (v - lo) / (hi - lo));
      const k = (j * W + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const step = fast ? 2 : 1;
  const lats = [], lons = [];
  for (let la = BOX.s; la <= BOX.n; la += step) lats.push(la);
  for (let lo2 = BOX.w; lo2 <= BOX.e; lo2 += step) lons.push(lo2);
  const grid = lats.map((la) => lons.map((lo2) => qtyAt(q, la, lo2, alt, year, c0, c1)));
  return { url: canvas.toDataURL(), lats, lons, grid };
}

/** Marching squares: segmenti dell'isolinea `lv`. */
function contour(lats, lons, grid, lv) {
  const segs = [];
  const ip = (a, b, fa, fb) => a + (b - a) * ((lv - fa) / (fb - fa));
  for (let j = 0; j < lats.length - 1; j++) {
    for (let i = 0; i < lons.length - 1; i++) {
      const f00 = grid[j][i], f10 = grid[j][i + 1], f01 = grid[j + 1][i], f11 = grid[j + 1][i + 1];
      // salta le celle a cavallo del salto ±180° della declinazione
      if (Math.max(f00, f10, f01, f11) - Math.min(f00, f10, f01, f11) > 90 && state.qty === "D") continue;
      const p = [];
      if ((f00 < lv) !== (f10 < lv)) p.push([lats[j], ip(lons[i], lons[i + 1], f00, f10)]);
      if ((f10 < lv) !== (f11 < lv)) p.push([ip(lats[j], lats[j + 1], f10, f11), lons[i + 1]]);
      if ((f01 < lv) !== (f11 < lv)) p.push([lats[j + 1], ip(lons[i], lons[i + 1], f01, f11)]);
      if ((f00 < lv) !== (f01 < lv)) p.push([ip(lats[j], lats[j + 1], f00, f01), lons[i]]);
      if (p.length === 2) segs.push(p);
      else if (p.length === 4) { segs.push([p[0], p[1]]); segs.push([p[2], p[3]]); }
    }
  }
  return segs;
}

function initMap() {
  map = L.map("realMap", { center: [-22, -30], zoom: 3, minZoom: 2, maxZoom: 7, worldCopyJump: true, preferCanvas: true });
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Esri, HERE, Garmin | IGRF-14 IAGA | ISS: wheretheiss.at", maxZoom: 16,
  }).addTo(map);
  fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((w) => L.geoJSON(topojson.feature(w, w.objects.countries), { style: { color: "#3a5a8c", weight: 0.7, fill: false }, interactive: false }).addTo(map))
    .catch(() => {});
  fieldLayer = L.imageOverlay("data:,", [[BOX.s, BOX.w], [BOX.n, BOX.e]], { opacity: 1, interactive: false }).addTo(map);
  contourLayer = L.layerGroup().addTo(map);
  markLayer = L.layerGroup().addTo(map);
  issLayer = L.layerGroup().addTo(map);
  pointMarker = L.circleMarker([state.point.lat, state.point.lon], { radius: 6, color: "#fbbf24", weight: 2, fillColor: "#060911", fillOpacity: 1 }).addTo(map);
  map.on("mousemove", (e) => {
    const { lat, lng } = e.latlng;
    if (Math.abs(lat) > 89) return;
    const lon = wrapLon(lng);
    const Q = QTY[state.qty];
    const c0 = coefficientsFor(state.qty === "SV" ? state.year - 0.5 : state.year);
    const c1 = state.qty === "SV" ? coefficientsFor(state.year + 0.5) : null;
    const v = qtyAt(state.qty, lat, lon, state.alt, state.year, c0, c1);
    $("mapHud").innerHTML = hudBase() + ` • cursore ${latS(lat)} ${lonS(lon)}: <strong>${fmt(v, Q.d)} ${Q.unit}</strong>`;
  });
  map.on("mouseout", () => ($("mapHud").innerHTML = hudBase()));
  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (Math.abs(lat) > 89) return;
    setPoint({ lat, lon: wrapLon(lng), name: null });
  });
}

function hudBase() {
  const r = modelRow(state.year);
  const where = state.alt ? "400 km" : "suolo";
  if (!r) return `ANNO <strong>${state.year}</strong> • ${where}`;
  const p = state.alt ? { lat: r.iss_lat, lon: r.iss_lon, nt: r.iss_nt } : { lat: r.p1_lat, lon: r.p1_lon, nt: r.p1_nt };
  return `ANNO <strong>${state.year}</strong> • ${where} • minimo F <strong style="color:#fda4af">${fmt(p.nt)} nT</strong> a ${latS(p.lat)} ${lonS(p.lon)}`;
}

let drawToken = 0;
function drawMap(fast = false) {
  if (!map) return;
  const my = ++drawToken;
  requestAnimationFrame(() => {
    if (my !== drawToken) return;
    const Q = QTY[state.qty];
    const { url, lats, lons, grid } = computeField(state.year, state.alt, state.qty, fast);
    fieldLayer.setUrl(url);
    contourLayer.clearLayers();
    const strong = Q.strong(state.alt);
    for (const lv of Q.levels(state.alt)) {
      const segs = contour(lats, lons, grid, lv);
      if (!segs.length) continue;
      const s = strong.includes(lv);
      L.polyline(segs, { color: s ? "#fde68a" : "#94a3b8", weight: s ? 1.6 : 0.8, opacity: s ? 0.95 : 0.55, interactive: false }).addTo(contourLayer);
    }
    drawMarks();
    $("mapHud").innerHTML = hudBase();
  });
}

function drawMarks() {
  markLayer.clearLayers();
  const rows = state.model?.rows;
  if (!rows) return;
  const iss = state.alt === 400;
  const pts = rows.map((r) => [iss ? r.iss_lat : r.p1_lat, iss ? r.iss_lon : r.p1_lon]);
  L.polyline(pts, { color: "#00e5ff", weight: 2, opacity: 0.85 }).addTo(markLayer);
  rows.filter((r) => r.year % 10 === 0 || r.year === YEAR_MAX).forEach((r) => {
    L.circleMarker([iss ? r.iss_lat : r.p1_lat, iss ? r.iss_lon : r.p1_lon], { radius: 3, color: "#00e5ff", weight: 1.5, fillColor: "#060911", fillOpacity: 1 })
      .bindTooltip(`<b>${r.year}</b>: ${fmt(iss ? r.iss_nt : r.p1_nt)} nT`, { className: "saa-tip" })
      .on("click", (e) => { L.DomEvent.stopPropagation(e); setYear(r.year); })
      .addTo(markLayer);
  });
  const r = modelRow(state.year);
  if (!r) return;
  const lat = iss ? r.iss_lat : r.p1_lat, lon = iss ? r.iss_lon : r.p1_lon;
  L.circleMarker([lat, lon], { radius: 7, color: "#f43f5e", weight: 3, fillColor: "#fff", fillOpacity: 1 })
    .bindTooltip(`<b>Minimo P1 ${r.year}</b><br>${fmt(iss ? r.iss_nt : r.p1_nt)} nT<br>${latS(lat)} ${lonS(lon)}`, { className: "saa-tip" })
    .addTo(markLayer);
  const km = r.drift_km_yr * 50, az = (r.drift_az_deg * Math.PI) / 180;
  const dLat = (km * Math.cos(az)) / 111.2, dLon = (km * Math.sin(az)) / (111.2 * Math.cos((lat * Math.PI) / 180));
  L.polyline([[lat, lon], [lat + dLat, lon + dLon]], { color: "#10b981", weight: 3 })
    .bindTooltip(`Deriva ${fmt(r.drift_km_yr, 1)} km/anno verso ${compass(r.drift_az_deg)} (${r.drift_az_deg}°) — freccia = 50 anni`, { className: "saa-tip", sticky: true })
    .addTo(markLayer);
  if (!iss && r.p2_active) {
    L.circleMarker([r.p2_lat, r.p2_lon], { radius: 6, color: "#f43f5e", weight: 2, fillColor: "#a855f7", fillOpacity: 1 })
      .bindTooltip(`<b>Lobo P2 (SW Africa) ${r.year}</b><br>${fmt(r.p2_nt)} nT<br>${latS(r.p2_lat)} ${lonS(r.p2_lon)}`, { className: "saa-tip" })
      .addTo(markLayer);
  }
}

function setYear(y, fast = false) {
  state.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(Number(y))));
  $("yearSlider").value = state.year;
  $("yearDisplay").textContent = state.year;
  drawMap(fast);
  narrate();
  if (!fast) updatePoint(false);
}

function narrate() {
  const r = modelRow(state.year);
  if (!r) return;
  const proj = r.source === "IGRF+SV" ? " <span style='color:#fbbf24'>(estrapolazione con variazione secolare)</span>" : "";
  const p2 = r.p2_active ? `P2 SW Africa ${fmt(r.p2_nt)} nT a ${latS(r.p2_lat)} ${lonS(r.p2_lon)}` : "P2 non ancora separato";
  const dp = dipole(state.year);
  $("epochNarrative").innerHTML =
    `<strong style="color:#00e5ff">[${r.year}]</strong>${proj} P1 ${fmt(r.p1_nt)} nT a ${latS(r.p1_lat)} ${lonS(r.p1_lon)} • ${p2} • ` +
    `deriva ${fmt(r.drift_km_yr, 1)} km/anno verso ${compass(r.drift_az_deg)} • area &lt;24k nT ${fmt(r.area_24k_mkm2, 1)} M km² • ` +
    `dipolo ${fmt(dp.moment, 2)}·10²² A·m², polo Nord geomagnetico ${latS(dp.poleLat)} ${lonS(dp.poleLon)}`;
}

function togglePlay() {
  if (state.playing) {
    clearInterval(state.playing);
    state.playing = null;
    $("playBtn").textContent = "▶ Play";
    setYear(state.year);
    return;
  }
  $("playBtn").textContent = "⏸ Pausa";
  state.playing = setInterval(() => setYear(state.year >= YEAR_MAX ? YEAR_MIN : state.year + 1, true), state.qty === "SV" ? 380 : 230);
}

// ---------------------------------------------------------------------------
// Punto selezionato
// ---------------------------------------------------------------------------
function setPoint(p) {
  state.point = p;
  pointMarker?.setLatLng([p.lat, p.lon]);
  updatePoint(true);
}

function updatePoint(redrawChart) {
  const p = state.point;
  const f = field(p.lat, p.lon, state.alt, state.year);
  const sv = secularF(p.lat, p.lon, state.alt, state.year);
  $("ptTitle").textContent = `${p.name ? p.name + " — " : ""}${latS(p.lat)} ${lonS(p.lon)} · ${state.year} · ${state.alt ? "400 km" : "suolo"}`;
  const pv = (k, v, wide) => `<div class="pv${wide ? " wide" : ""}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const r = modelRow(state.year);
  const ratio = r ? (f.F / (state.alt ? r.iss_nt : r.p1_nt)) : null;
  $("pointVals").innerHTML =
    pv("F intensità", `${fmt(f.F)} nT`) +
    pv("dF/dt", `${sv > 0 ? "+" : ""}${fmt(sv, 1)} nT/anno`) +
    pv("H orizzontale", `${fmt(f.H)} nT`) +
    pv("Z verticale", `${fmt(f.Z)} nT`) +
    pv("Inclinazione", `${fmt(f.I, 2)}°`) +
    pv("Declinazione", `${fmt(f.D, 2)}° ${f.D >= 0 ? "E" : "O"}`) +
    pv("X Nord / Y Est", `${fmt(f.X)} / ${fmt(f.Y)} nT`, true) +
    (ratio ? pv("Rispetto al minimo SAA", `${fmt(ratio, 2)} volte`, true) : "");
  if (redrawChart || !charts.chPoint) pointChart();
}

function pointChart() {
  const p = state.point;
  const ys = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) ys.push(y);
  const ptF = ys.map((y) => ({ x: y, y: Math.round(field(p.lat, p.lon, state.alt, y).F) }));
  const ptI = ys.map((y) => ({ x: y, y: Math.round(field(p.lat, p.lon, state.alt, y).I * 100) / 100 }));
  const minF = (state.model?.rows ?? []).map((r) => ({ x: r.year, y: state.alt ? r.iss_nt : r.p1_nt }));
  makeChart("chPoint", {
    type: "line",
    data: {
      datasets: [
        { label: "F nel punto (nT)", data: ptF, borderColor: "#fbbf24", backgroundColor: "#fbbf24", borderWidth: 2, pointRadius: 0, yAxisID: "y" },
        { label: "Minimo SAA (nT)", data: minF, borderColor: "#f43f5e", backgroundColor: "#f43f5e", borderWidth: 1.6, borderDash: [5, 4], pointRadius: 0, yAxisID: "y" },
        { label: "Inclinazione (°)", data: ptI, borderColor: "#a855f7", backgroundColor: "#a855f7", borderWidth: 1.4, pointRadius: 0, yAxisID: "y2" },
      ],
    },
    options: yearOpts({
      y: { title: { display: true, text: "nT" } },
      y2: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "inclinazione °" } },
    }),
  });
}

// ---------------------------------------------------------------------------
// ISS in tempo reale
// ---------------------------------------------------------------------------
const decYear = (t) => { const d = new Date(t * 1000); return d.getUTCFullYear() + (d.getUTCMonth() + d.getUTCDate() / 31) / 12; };
const issF = (p) => field(p.lat, p.lon, p.alt, decYear(p.t)).F;

async function loadIss() {
  if (!state.issOn || document.hidden) return;
  try {
    const d = await getJSON("/api/iss");
    state.iss = d;
    drawIss();
  } catch {
    $("kTagIss").textContent = "NON DISPONIBILE";
    $("kIssSub").textContent = "posizione ISS non raggiungibile ora";
  }
}

function drawIss() {
  issLayer.clearLayers();
  const d = state.iss;
  if (!d) return;
  const now = d.now;
  const F = issF(now);
  const inside = F < ISS_SAA_NT;
  // traccia: segmenti rossi dentro la SAA, azzurri fuori; spezzata al salto ±180°
  const pts = d.track.map((p) => ({ ...p, inside: issF(p) < ISS_SAA_NT }));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.abs(a.lon - b.lon) > 180) continue;
    const future = b.t > now.t;
    L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
      color: a.inside && b.inside ? "#f43f5e" : "#00e5ff", weight: 2.4, opacity: future ? 0.9 : 0.45, dashArray: future ? null : "4 5", interactive: false,
    }).addTo(issLayer);
  }
  L.marker([now.lat, now.lon], { icon: L.divIcon({ className: "iss-icon", html: "🛰", iconSize: [22, 22], iconAnchor: [11, 11] }) })
    .bindTooltip(`<b>ISS</b> ${isoShort(now.t)} UTC<br>${latS(now.lat)} ${lonS(now.lon)} · ${fmt(now.alt, 0)} km<br>F = ${fmt(F)} nT ${inside ? "— <b style='color:#fda4af'>dentro la SAA</b>" : ""}`, { className: "saa-tip" })
    .addTo(issLayer);
  // prossimo cambio di stato sulla traccia futura (passo 5 minuti)
  const next = pts.find((p) => p.t > now.t && p.inside !== inside);
  const mins = next ? Math.max(5, Math.round((next.t - now.t) / 60 / 5) * 5) : null;
  const card = $("issCard");
  card.classList.toggle("iss-in", inside);
  card.classList.toggle("danger", inside);
  $("kTagIss").textContent = inside ? "DENTRO LA SAA" : "FUORI DALLA SAA";
  $("kTagIss").className = "kpi-tag" + (inside ? " danger" : "");
  $("kIss").innerHTML = `${fmt(F)} <small>nT</small>`;
  $("kIssSub").innerHTML = `a <strong>${fmt(now.alt, 0)} km</strong> • ${latS(now.lat)} ${lonS(now.lon)}<br>${fmt(now.velocity_kmh)} km/h • ${now.visibility === "daylight" ? "al sole" : "in ombra"}` +
    (mins ? `<br>${inside ? "esce" : "entra"} tra circa <strong>${mins} min</strong>` : inside ? "" : "<br>nessun passaggio nei prossimi 65 min");
}

// ---------------------------------------------------------------------------
// Grafici
// ---------------------------------------------------------------------------
Chart.defaults.color = "#8fa4c4";
Chart.defaults.borderColor = "#1a2844";
Chart.defaults.font.family = "Consolas, monospace";
Chart.defaults.font.size = 11;
const charts = {};
function makeChart(id, config) {
  charts[id]?.destroy();
  charts[id] = new Chart($(id), config);
}
const timeTick = (days) => (v) => {
  const d = new Date(v * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return days <= 7 ? `${dd}/${mm} ${String(d.getUTCHours()).padStart(2, "0")}h` : `${dd}/${mm}/${String(d.getUTCFullYear()).slice(2)}`;
};
function baseOpts(days, scales = {}) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { title: (it) => (it.length ? isoShort(it[0].parsed.x) + " UTC" : "") } } },
    scales: { x: { type: "linear", ticks: { callback: timeTick(days), maxTicksLimit: 7, maxRotation: 0 } }, ...scales },
  };
}
function yearOpts(scales) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { title: (it) => (it.length ? String(it[0].parsed.x) : "") } } },
    scales: { x: { type: "linear", min: YEAR_MIN, max: YEAR_MAX, ticks: { stepSize: 10, callback: (v) => String(v) } }, ...scales },
  };
}
const lineDS = (label, rows, idx, color, extra = {}) => ({
  label, borderColor: color, backgroundColor: color, borderWidth: 1.6, pointRadius: 0, tension: 0.15,
  data: rows.map((r) => ({ x: r[0], y: r[idx] })), ...extra,
});
const kpColor = (v) => (v >= 7 ? "#f43f5e" : v >= 5 ? "#f59e0b" : v >= 4 ? "#eab308" : "#10b981");

async function loadHistory() {
  const d = state.days;
  try {
    const [g, k, ds] = await Promise.all([
      getJSON(`/api/history?series=goes&days=${d}`),
      getJSON(`/api/history?series=kp&days=${d}`),
      getJSON(`/api/history?series=dst&days=${d}`),
    ]);
    const pos = (v) => (v !== null && v > 0 ? v : null);
    const gr = g.rows.map((r) => [r[0], pos(r[1]), pos(r[2]), pos(r[3]), pos(r[4]), r[5]]);
    const x0 = gr[0]?.[0] ?? Math.floor(Date.now() / 1000) - d * 86400, x1 = gr.at(-1)?.[0] ?? Math.floor(Date.now() / 1000);
    makeChart("chProtons", {
      type: "line",
      data: { datasets: [
        lineDS("≥10 MeV", gr, 1, "#00e5ff"), lineDS("≥50 MeV", gr, 2, "#f59e0b"), lineDS("≥100 MeV", gr, 3, "#f43f5e"),
        { label: "S1", data: [{ x: x0, y: 10 }, { x: x1, y: 10 }], borderColor: "#f43f5e", borderDash: [5, 4], borderWidth: 1, pointRadius: 0 },
      ] },
      options: baseOpts(d, { y: { type: "logarithmic", title: { display: true, text: "pfu" } } }),
    });
    makeChart("chGeo", {
      data: { datasets: [
        { type: "bar", label: "Kp", data: k.rows.map((r) => ({ x: r[0] + k.step / 2, y: r[1] })), backgroundColor: k.rows.map((r) => kpColor(r[1])), yAxisID: "y", barPercentage: 1, categoryPercentage: 1 },
        { type: "line", label: "Dst (nT)", data: ds.rows.map((r) => ({ x: r[0], y: r[1] })), borderColor: "#a855f7", backgroundColor: "#a855f7", borderWidth: 1.6, pointRadius: 0, yAxisID: "y2" },
      ] },
      options: baseOpts(d, {
        y: { min: 0, max: 9, title: { display: true, text: "Kp" } },
        y2: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Dst nT" } },
      }),
    });
    makeChart("chElectrons", {
      type: "line",
      data: { datasets: [lineDS("e⁻ ≥2 MeV (pfu)", gr, 4, "#a855f7", { yAxisID: "y" }), lineDS("Hp (nT)", gr, 5, "#10b981", { yAxisID: "y2" })] },
      options: baseOpts(d, {
        y: { type: "logarithmic", title: { display: true, text: "pfu" } },
        y2: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Hp nT" } },
      }),
    });
  } catch (e) {
    toast("Storico non disponibile: " + e.message, true);
  }
}

async function loadStats() {
  try {
    const s = await getJSON("/api/stats");
    const a = s.archive;
    $("statsDesc").textContent = a.first
      ? `Archivio dal ${a.first.slice(0, 10)} (${fmt(a.days, 1)} giorni): ${fmt(a.goes)} punti GOES, ${fmt(a.kp)} valori Kp, ${fmt(a.dst)} valori Dst, ${fmt(a.runs)} aggiornamenti.`
      : "Archivio ancora vuoto.";
    const R = s.records;
    const rec = (k, v, t) => `<div class="pv"><div class="k">${k}</div><div class="v">${v}</div><div class="k" style="text-transform:none">${t ? isoShort(Date.parse(t) / 1000) + " UTC" : ""}</div></div>`;
    $("records").innerHTML =
      rec("Protoni ≥10 MeV max", `${fmtSci(R.p10_max?.v)} pfu`, R.p10_max?.time) +
      rec("Protoni ≥100 MeV max", `${fmtSci(R.p100_max?.v)} pfu`, R.p100_max?.time) +
      rec("Elettroni ≥2 MeV max", `${fmtSci(R.e2_max?.v)} pfu`, R.e2_max?.time) +
      rec("Kp massimo", fmt(R.kp_max?.v, 2), R.kp_max?.time) +
      rec("Dst minimo", `${fmt(R.dst_min?.v)} nT`, R.dst_min?.time) +
      rec("Tempeste G1+", fmt(s.storms_g.length), null);
    const days = s.daily_30d.map((r) => ({ ...r, x: Date.parse(r.day + "T12:00:00Z") / 1000 }));
    makeChart("chDaily", {
      data: { datasets: [
        { type: "bar", label: "Kp massimo", data: days.map((r) => ({ x: r.x, y: r.kp })), backgroundColor: days.map((r) => kpColor(r.kp ?? 0)), yAxisID: "y", barPercentage: 0.9, categoryPercentage: 1 },
        { type: "line", label: "Dst minimo (nT)", data: days.map((r) => ({ x: r.x, y: r.dst })), borderColor: "#a855f7", backgroundColor: "#a855f7", borderWidth: 1.6, pointRadius: 2, yAxisID: "y2" },
        { type: "line", label: "Protoni ≥10 MeV max (pfu)", data: days.map((r) => ({ x: r.x, y: r.p10 && r.p10 > 0 ? r.p10 : null })), borderColor: "#00e5ff", backgroundColor: "#00e5ff", borderWidth: 1.4, pointRadius: 2, yAxisID: "y3" },
      ] },
      options: {
        ...baseOpts(30, {
          y: { min: 0, max: 9, title: { display: true, text: "Kp" } },
          y2: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Dst nT" } },
          y3: { position: "right", type: "logarithmic", grid: { drawOnChartArea: false }, title: { display: true, text: "pfu" } },
        }),
        plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { title: (it) => (it.length ? new Date(it[0].parsed.x * 1000).toISOString().slice(0, 10) : "") } } },
      },
    });
    const total = s.kp_histogram.reduce((a2, b) => a2 + b, 0) || 1;
    makeChart("chKpHist", {
      type: "bar",
      data: {
        labels: s.kp_histogram.map((_, i) => String(i)),
        datasets: [{ label: "Intervalli di 3 ore", data: s.kp_histogram, backgroundColor: s.kp_histogram.map((_, i) => kpColor(i)) }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y} intervalli (${fmt((c.parsed.y / total) * 100, 1)}%)` } } },
        scales: { x: { title: { display: true, text: "Kp" } }, y: { beginAtZero: true, title: { display: true, text: "intervalli" } } },
      },
    });
    const ev = [
      ...s.storms_g.map((e) => ({ type: `Tempesta geomagnetica G${e.G}`, ...e, peakTxt: `Kp ${fmt(e.peak, 2)}` })),
      ...s.storms_dst.map((e) => ({ type: "Tempesta Dst", ...e, peakTxt: `${fmt(e.peak)} nT` })),
      ...s.proton_events.map((e) => ({ type: `Evento protonico S${e.S}`, ...e, peakTxt: `${fmtSci(e.peak)} pfu` })),
    ].sort((x, y) => (x.start < y.start ? 1 : -1));
    $("eventsBody").innerHTML = ev.length
      ? ev.map((e) => `<tr><td>${esc(e.type)}</td><td>${e.start.slice(0, 16).replace("T", " ")}</td><td>${fmt(e.hours, 1)} h</td><td>${e.peakTxt}</td><td>${e.peak_time.slice(0, 16).replace("T", " ")}</td></tr>`).join("")
      : `<tr><td colspan="5">Nessun episodio nell'archivio finora: Kp sempre sotto 5, Dst sopra −50 nT e protoni sotto 10 pfu.</td></tr>`;
  } catch (e) {
    $("statsDesc").textContent = "Statistiche non disponibili: " + e.message;
  }
}

function modelCharts() {
  const rows = state.model.rows;
  const pt = (f) => rows.map((r) => ({ x: r.year, y: r[f] }));
  const ds = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, ...extra });
  makeChart("chModelF", {
    type: "line",
    data: { datasets: [ds("P1 suolo", pt("p1_nt"), "#00e5ff"), ds("P2 SW Africa", pt("p2_nt"), "#f43f5e", { borderDash: [5, 4] }), ds("Minimo a 400 km", pt("iss_nt"), "#a855f7")] },
    options: yearOpts({ y: { title: { display: true, text: "nT" } } }),
  });
  makeChart("chModelArea", {
    type: "line",
    data: { datasets: [
      ds("Area < 24.000 nT", pt("area_24k_mkm2"), "#f59e0b", { fill: "origin", backgroundColor: "rgba(245,158,11,0.18)" }),
      ds("Area < 23.000 nT", pt("area_23k_mkm2"), "#f43f5e", { fill: "origin", backgroundColor: "rgba(244,63,94,0.22)" }),
      ds("Deriva P1 (km/anno)", pt("drift_km_yr"), "#10b981", { yAxisID: "y2" }),
    ] },
    options: yearOpts({
      y: { min: 0, title: { display: true, text: "milioni km²" } },
      y2: { position: "right", min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: "km/anno" } },
    }),
  });
  const dip = rows.map((r) => ({ y: r.year, ...dipole(r.year) }));
  makeChart("chDipole", {
    type: "line",
    data: { datasets: [
      ds("Momento (10²² A·m²)", dip.map((d) => ({ x: d.y, y: Math.round(d.moment * 1000) / 1000 })), "#00e5ff", { yAxisID: "y" }),
      ds("Latitudine polo Nord (°)", dip.map((d) => ({ x: d.y, y: Math.round(d.poleLat * 100) / 100 })), "#a855f7", { yAxisID: "y2" }),
    ] },
    options: yearOpts({
      y: { title: { display: true, text: "10²² A·m²" } },
      y2: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "° Nord" } },
    }),
  });
  // variazione annua centrata su ±2 anni
  const rate = (f) => rows.map((r, i) => {
    const a = rows[i - 2], b = rows[i + 2];
    if (!a || !b || a[f] === null || b[f] === null || r[f] === null) return { x: r.year, y: null };
    return { x: r.year, y: Math.round(((b[f] - a[f]) / (b.year - a.year)) * 10) / 10 };
  });
  makeChart("chRates", {
    type: "line",
    data: { datasets: [ds("P1 Sud America", rate("p1_nt"), "#00e5ff"), ds("P2 SW Africa", rate("p2_nt"), "#f43f5e"), ds("Minimo a 400 km", rate("iss_nt"), "#a855f7", { borderDash: [4, 4], borderWidth: 1.4 })] },
    options: yearOpts({ y: { title: { display: true, text: "nT/anno" } } }),
  });
  makeChart("chTrack", {
    type: "line",
    data: { datasets: [ds("Longitudine P1 (°)", pt("p1_lon"), "#10b981", { yAxisID: "y" }), ds("Latitudine P1 (°)", pt("p1_lat"), "#f59e0b", { yAxisID: "y2" })] },
    options: yearOpts({
      y: { title: { display: true, text: "longitudine °" } },
      y2: { position: "right", grid: { drawOnChartArea: false }, min: -30, max: -18, title: { display: true, text: "latitudine °" } },
    }),
  });
}

function modelTable() {
  $("modelBody").innerHTML = state.model.rows
    .filter((r) => r.year % 5 === 0 || r.year === CUR)
    .map((r) => `<tr class="${r.year === CUR ? "now" : r.source === "IGRF+SV" ? "proj" : ""}">
      <td>${r.year}${r.year === CUR ? " (oggi)" : ""}</td>
      <td style="color:#00e5ff">${fmt(r.p1_nt)}</td>
      <td>${latS(r.p1_lat)} ${lonS(r.p1_lon)}</td>
      <td style="color:${r.p2_active ? "#fda4af" : "#64748b"}">${r.p2_active ? `${fmt(r.p2_nt)} nT · ${latS(r.p2_lat)} ${lonS(r.p2_lon)}` : "non separato"}</td>
      <td>${fmt(r.iss_nt)} nT</td>
      <td>${fmt(r.drift_km_yr, 1)} km/a ${compass(r.drift_az_deg)}</td>
      <td>${fmt(r.area_24k_mkm2, 1)} M km²</td>
      <td>${fmt(r.area_23k_mkm2, 1)} M km²</td>
      <td>${r.source}</td>
    </tr>`).join("");
}

function modelKpis() {
  const r = modelRow(CUR), r1900 = modelRow(1900);
  if (!r) return;
  $("kP1").innerHTML = `${fmt(r.p1_nt)} <small>nT (${r.year})</small>`;
  $("kTagP1").textContent = `${fmt(((r.p1_nt - r1900.p1_nt) / r1900.p1_nt) * 100, 1)}% DAL 1900`;
  $("kP1sub").innerHTML = `${latS(r.p1_lat)} ${lonS(r.p1_lon)} • 1900: <strong>${fmt(r1900.p1_nt)} nT</strong> a ${lonS(r1900.p1_lon)}`;
  $("kDrift").innerHTML = `${fmt(r.drift_km_yr, 1)} <small>km/anno</small>`;
  $("kTagDrift").textContent = `AZIMUT ${r.drift_az_deg}° ${compass(r.drift_az_deg)}`;
  const lonShift = Math.abs(r.p1_lon - r1900.p1_lon);
  $("kDriftSub").innerHTML = `Dal 1900 spostato di <strong>${fmt(lonShift, 1)}°</strong> verso Ovest (media ${fmt(lonShift / (r.year - 1900), 2)}°/anno)`;
  $("kP2").innerHTML = r.p2_active ? `${fmt(r.p2_nt)} <small>nT</small>` : `-- <small>nT</small>`;
  const first = state.model.rows.find((x) => x.p2_active);
  $("kTagP2").textContent = first ? `SEPARATO DAL ${first.year}` : "NON SEPARATO";
  $("kP2sub").innerHTML = `${r.p2_active ? `${latS(r.p2_lat)} ${lonS(r.p2_lon)} • ` : ""}minimo a 400 km: <strong>${fmt(r.iss_nt)} nT</strong>`;
}

// ---------------------------------------------------------------------------
// Dati live dal Worker
// ---------------------------------------------------------------------------
async function loadLatest() {
  const badge = $("liveBadge"), dot = $("radarDot");
  try {
    const lt = await getJSON("/api/latest");
    const g = lt.goes, k = lt.kp, d = lt.dst, S = lt.scales.S, G = lt.scales.G;
    $("kP10").innerHTML = `${fmtSci(g?.p10)} <small>pfu</small>`;
    $("kTagS").textContent = S === null ? "S--" : S === 0 ? "S0 QUIETE" : `S${S} TEMPESTA`;
    $("kTagS").className = "kpi-tag" + (S >= 1 ? " danger" : "");
    $("kP10sub").innerHTML = `≥100 MeV: <strong>${fmtSci(g?.p100)}</strong> • max 24 h: <strong>${fmtSci(lt.last_24h?.p10max)}</strong><br>${g ? isoShort(g.t) + " UTC" : ""}`;
    $("kKp").innerHTML = `Kp ${fmt(k?.kp, 2)}`;
    $("kTagG").textContent = G === null ? "G--" : G === 0 ? "G0 QUIETE" : `G${G} TEMPESTA`;
    $("kTagG").className = "kpi-tag " + (G >= 1 ? "warn" : "green");
    $("kKpSub").innerHTML = `Dst <strong>${fmt(d?.dst)} nT</strong> • Kp ${k ? isoShort(k.t) : "--"} • Dst ${d ? isoShort(d.t) : "--"} UTC<br>GOES Hp <strong>${fmt(g?.hp, 1)} nT</strong>`;
    const run = lt.last_update;
    $("lastRun").textContent = run ? `${isoShort(run.t)} UTC (${run.trigger})` : "mai";
    const age = g ? Date.now() / 1000 - g.t : Infinity;
    if (age < 14 * 3600) { badge.textContent = "ARCHIVIO: AGGIORNATO"; badge.className = "status-pill"; dot.className = "radar-dot"; }
    else if (age < 30 * 3600) { badge.textContent = "ARCHIVIO: IN ATTESA DEL PROSSIMO GIRO"; badge.className = "status-pill warn"; dot.className = "radar-dot stale"; }
    else { badge.textContent = "ARCHIVIO: FERMO"; badge.className = "status-pill bad"; dot.className = "radar-dot down"; }
  } catch {
    badge.textContent = "ARCHIVIO: NON RAGGIUNGIBILE"; badge.className = "status-pill bad"; dot.className = "radar-dot down";
    $("kP10sub").textContent = "nessun dato: Worker non raggiungibile";
  }
}

async function loadRuns() {
  try {
    const runs = await getJSON("/api/runs");
    $("runsBody").innerHTML = runs.map((r) => `<tr><td>${isoShort(r.t)}</td><td>${r.trigger}</td><td>${r.rows}</td><td style="color:${r.errors ? "#fbbf24" : "#6ee7b7"}" title="${esc(r.errors ?? "")}">${r.errors ? "parziale" : "ok"}</td></tr>`).join("")
      || `<tr><td colspan="4">nessun aggiornamento registrato</td></tr>`;
  } catch { $("runsBody").innerHTML = `<tr><td colspan="4">non disponibile</td></tr>`; }
}

async function refresh() {
  const btn = $("refreshBtn");
  btn.disabled = true;
  try {
    const token = store.get();
    if (token) {
      const r = await fetch(API + "/api/update", { method: "POST", headers: { Authorization: "Bearer " + token } });
      const body = await r.json().catch(() => ({}));
      if (r.ok) toast(`Archivio aggiornato da NOAA: ${body.rows} righe nuove o riviste${body.errors?.length ? " (fonti mancanti: " + body.errors.length + ")" : ""}.`);
      else if (r.status === 401) { toast("Chiave non valida: rimossa da questo browser.", true); store.set(null); }
      else toast(body.error ?? `Aggiornamento non riuscito (HTTP ${r.status})`, true);
    } else {
      toast("Dati ricaricati dall'archivio. Il Worker legge NOAA alle 06:07 e alle 18:07 UTC.");
    }
    await Promise.all([loadLatest(), loadHistory(), loadRuns(), loadStats(), loadIss()]);
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
function wire() {
  wireHelp();
  $("yearSlider").min = YEAR_MIN;
  $("yearSlider").max = YEAR_MAX;
  $("yearSlider").addEventListener("input", (e) => setYear(e.target.value, true));
  $("yearSlider").addEventListener("change", (e) => setYear(e.target.value, false));
  $("yearButtons").innerHTML = [1900, 1950, 1980, 2000, 2010, CUR, YEAR_MAX]
    .map((y) => `<button data-y="${y}">${y === CUR ? y + " (oggi)" : y === YEAR_MAX ? y + "*" : y}</button>`).join("");
  $("yearButtons").addEventListener("click", (e) => { const y = e.target.dataset?.y; if (y) setYear(y); });
  $("playBtn").addEventListener("click", togglePlay);
  $("qtySeg").addEventListener("click", (e) => {
    const q = e.target.dataset?.q;
    if (!q) return;
    state.qty = q;
    [...$("qtySeg").children].forEach((b) => b.classList.toggle("on", b.dataset.q === q));
    drawColorbar();
    drawMap();
  });
  const setAlt = (alt) => {
    state.alt = alt;
    $("altGround").classList.toggle("on", alt === 0);
    $("altIss").classList.toggle("on", alt === 400);
    drawColorbar();
    drawMap();
    updatePoint(true);
  };
  $("altGround").addEventListener("click", () => setAlt(0));
  $("altIss").addEventListener("click", () => setAlt(400));
  $("issToggle").addEventListener("click", () => {
    state.issOn = !state.issOn;
    $("issToggle").classList.toggle("on", state.issOn);
    $("issToggle").setAttribute("aria-pressed", String(state.issOn));
    if (state.issOn) loadIss(); else issLayer?.clearLayers();
  });
  $("rangeSeg").addEventListener("click", (e) => {
    const d = Number(e.target.dataset?.days);
    if (!d) return;
    state.days = d;
    [...$("rangeSeg").children].forEach((b) => b.classList.toggle("on", Number(b.dataset.days) === d));
    loadHistory();
  });
  $("refreshBtn").addEventListener("click", refresh);
  $("keyBtn").addEventListener("click", () => {
    const cur = store.get();
    const v = prompt(cur ? "Chiave salvata in questo browser. Lascia vuoto per rimuoverla, oppure incollane una nuova:" : "Chiave per gli aggiornamenti manuali (solo proprietario):", "");
    if (v === null) return;
    store.set(v.trim() || null);
    toast(v.trim() ? "Chiave salvata in questo browser: «Aggiorna» ora interroga NOAA." : "Chiave rimossa.");
  });
  $("pngBtn").addEventListener("click", () => {
    const { url } = computeField(state.year, state.alt, state.qty, false);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saa_${state.qty}_${state.year}_${state.alt ? "400km" : "suolo"}.png`;
    a.click();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadIss(); });
}

/** Vista iniziale dall'indirizzo: ?q=F|SV|H|Z|I|D &anno=1900..2030 &quota=400 */
function fromUrl() {
  const u = new URLSearchParams(location.search);
  const q = u.get("q");
  if (q && QTY[q]) {
    state.qty = q;
    [...$("qtySeg").children].forEach((b) => b.classList.toggle("on", b.dataset.q === q));
  }
  const y = Number(u.get("anno"));
  if (Number.isInteger(y) && y >= YEAR_MIN && y <= YEAR_MAX) state.year = y;
  if (u.get("quota") === "400") {
    state.alt = 400;
    $("altGround").classList.remove("on");
    $("altIss").classList.add("on");
  }
}

async function start() {
  fromUrl();
  wire();
  drawColorbar();
  if (typeof L !== "undefined") initMap();
  try {
    state.model = await getJSON("/api/model");
  } catch {
    try { state.model = await (await fetch("./model.json")).json(); } catch { toast("Serie del modello non disponibile", true); }
  }
  if (state.model) { modelKpis(); modelTable(); modelCharts(); }
  setYear(state.year);
  updatePoint(true);
  loadLatest();
  loadHistory();
  loadRuns();
  loadStats();
  loadIss();
  setInterval(loadLatest, 10 * 60 * 1000);
  setInterval(loadIss, 20 * 1000);
}
start();
