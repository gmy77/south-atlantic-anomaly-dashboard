// Serie storica della South Atlantic Anomaly calcolata dal modello IGRF-14.
//   node tools/igrf-saa.mjs
// Scrive data/saa_igrf14.json, data/saa_igrf14.csv, worker/src/model.json
// e public/model.json.
//
// Per ogni anno 1900–2030:
//   P1  minimo assoluto di F al suolo nel settore sudamericano/atlantico
//   P2  minimo locale nel settore sud-ovest africano, solo se è un vero
//       minimo (non sul bordo del riquadro di ricerca)
//   P1 a 400 km (quota ISS)
//   deriva di P1 (km/anno, azimut) su ±5 anni
//   superficie al suolo con F < 24.000 e < 23.000 nT
// Niente stime a mano: tutto esce dai coefficienti ufficiali.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { areaBelow, bearingDeg, distanceKm, findMinimum, YEAR_MAX, YEAR_MIN } from "../public/igrf.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const BOX_P1 = { latMin: -60, latMax: 10, lonMin: -110, lonMax: 40 };
const BOX_P2 = { latMin: -60, latMax: -15, lonMin: -15, lonMax: 40 };
const BOX_AREA = { latMin: -75, latMax: 25, lonMin: -130, lonMax: 70 };

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

const years = [];
for (let y = YEAR_MIN; y <= YEAR_MAX; y++) years.push(y);

const rows = [];
for (const y of years) {
  const p1 = findMinimum(y, BOX_P1);
  const p2 = findMinimum(y, BOX_P2);
  const iss = findMinimum(y, BOX_P1, 400);
  const a = findMinimum(Math.max(YEAR_MIN, y - 5), BOX_P1);
  const b = findMinimum(Math.min(YEAR_MAX, y + 5), BOX_P1);
  const dt = Math.min(YEAR_MAX, y + 5) - Math.max(YEAR_MIN, y - 5);
  rows.push({
    year: y,
    p1_lat: r2(p1.lat),
    p1_lon: r2(p1.lon),
    p1_nt: Math.round(p1.F),
    p2_active: !p2.onBorder,
    p2_lat: p2.onBorder ? null : r2(p2.lat),
    p2_lon: p2.onBorder ? null : r2(p2.lon),
    p2_nt: p2.onBorder ? null : Math.round(p2.F),
    iss_lat: r2(iss.lat),
    iss_lon: r2(iss.lon),
    iss_nt: Math.round(iss.F),
    drift_km_yr: r1(distanceKm(a.lat, a.lon, b.lat, b.lon) / dt),
    drift_az_deg: Math.round(bearingDeg(a.lat, a.lon, b.lat, b.lon)),
    area_24k_mkm2: r2(areaBelow(y, 24000, BOX_AREA)),
    area_23k_mkm2: r2(areaBelow(y, 23000, BOX_AREA)),
    source: y <= 2020 ? "DGRF" : y <= 2025 ? "IGRF" : "IGRF+SV",
  });
  process.stdout.write(`\r${y}`);
}
process.stdout.write("\n");

const out = {
  model: "IGRF-14 (IAGA V-MOD), grado 13",
  generated: new Date().toISOString().slice(0, 10),
  notes: [
    "Minimi dell'intensità totale F al suolo (ellissoide WGS84) e a 400 km di quota.",
    "1900-2020: DGRF/IGRF definitivi; 2020-2025 IGRF; dopo il 2025 estrapolazione con la variazione secolare (valida fino al 2030).",
    "P2 compare solo quando nel settore sud-ovest africano esiste un vero minimo locale di F al suolo.",
    "Deriva: spostamento del minimo P1 su una base di ±5 anni (meno rumore: il fondo del minimo è piatto).",
  ],
  columns: Object.keys(rows[0]),
  rows,
};
writeFileSync(root + "data/saa_igrf14.json", JSON.stringify(out, null, 1) + "\n");
writeFileSync(root + "worker/src/model.json", JSON.stringify(out) + "\n");
// copia per chi apre la pagina senza Worker
writeFileSync(root + "public/model.json", JSON.stringify(out) + "\n");
const csv = [out.columns.join(",")]
  .concat(rows.map((r) => out.columns.map((c) => (r[c] === null ? "" : r[c])).join(",")))
  .join("\n");
writeFileSync(root + "data/saa_igrf14.csv", csv + "\n");

const first2 = rows.find((r) => r.p2_active);
const now = rows.find((r) => r.year === 2026);
console.log("P2 vero minimo dal", first2?.year);
console.log("2026:", now);
