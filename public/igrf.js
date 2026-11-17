// Sintesi del campo geomagnetico IGRF-14 (grado 13).
//
// Usato sia dalla dashboard (mappa del campo calcolata nel browser) sia da
// tools/igrf-saa.mjs (serie storica dei minimi della SAA). I coefficienti
// arrivano da igrf14-coeffs.js, generato da tools/build-coeffs.mjs a partire
// dal file ufficiale IAGA data/igrf/igrf14coeffs.txt.
//
// Validità del modello: 1900.0 – 2030.0. Fra due epoche i coefficienti si
// interpolano linearmente; dopo il 2025 si usa la variazione secolare.

import { COEFFS } from "./igrf14-coeffs.js";

const A = 6371.2; // raggio di riferimento IGRF, km
const NMAX = 13;
const WGS84_A = 6378.137;
const WGS84_B = 6356.7523142;

export const YEAR_MIN = COEFFS.epochs[0];
export const YEAR_MAX = COEFFS.epochs.at(-1) + 5;

const cache = new Map();
const P = Array.from({ length: NMAX + 1 }, () => new Float64Array(NMAX + 1));
const dP = Array.from({ length: NMAX + 1 }, () => new Float64Array(NMAX + 1));
const COS = new Float64Array(NMAX + 1);
const SIN = new Float64Array(NMAX + 1);

/** Coefficienti g[n][m], h[n][m] per un anno decimale (memorizzati). */
export function coefficientsFor(year) {
  const y = Math.min(Math.max(year, YEAR_MIN), YEAR_MAX);
  const key = Math.round(y * 1000);
  if (cache.has(key)) return cache.get(key);
  const { epochs, sv, rows, values } = COEFFS;
  const last = epochs.length - 1;
  let i = Math.min(Math.floor((y - epochs[0]) / 5), last);
  const g = Array.from({ length: NMAX + 1 }, () => new Float64Array(NMAX + 1));
  const h = Array.from({ length: NMAX + 1 }, () => new Float64Array(NMAX + 1));
  for (let k = 0; k < rows.length; k++) {
    const [type, n, m] = rows[k];
    const v = values[k];
    let c;
    if (i >= last) {
      c = v[last] + sv[k] * (y - epochs[last]);
    } else {
      const t = (y - epochs[i]) / 5;
      c = v[i] + (v[i + 1] - v[i]) * t;
    }
    (type === "g" ? g : h)[n][m] = c;
  }
  const out = { g, h };
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

/**
 * Campo totale F (nT) e componenti nel punto geodetico (lat, lon in gradi,
 * quota in km sull'ellissoide WGS84) per l'anno decimale `year`.
 * F non dipende dal sistema di riferimento, quindi basta convertire la
 * posizione da geodetica a geocentrica.
 */
export function field(latDeg, lonDeg, altKm, year, coeffs = coefficientsFor(year)) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  // geodetica -> geocentrica
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const a2 = WGS84_A * WGS84_A;
  const b2 = WGS84_B * WGS84_B;
  const rho = Math.sqrt(a2 * cosLat * cosLat + b2 * sinLat * sinLat);
  const r = Math.sqrt(altKm * altKm + 2 * altKm * rho + (a2 * a2 * cosLat * cosLat + b2 * b2 * sinLat * sinLat) / (rho * rho));
  const cd = (altKm + rho) / r;
  const sd = ((a2 - b2) / rho) * cosLat * sinLat / r;
  const sinTh = cosLat * cd - sinLat * sd; // seno della colatitudine geocentrica
  const cosTh = sinLat * cd + cosLat * sd;
  const st = Math.max(sinTh, 1e-10);

  const { g, h } = coeffs;
  // Legendre semi-normalizzate di Schmidt e derivate rispetto a theta
  // (buffer riusati: la funzione non è rientrante, ma JS è a thread singolo)
  P[0][0] = 1;
  P[1][1] = sinTh;
  dP[1][1] = cosTh;
  for (let n = 1; n <= NMAX; n++) {
    if (n >= 2) {
      const k = Math.sqrt((2 * n - 1) / (2 * n));
      P[n][n] = k * sinTh * P[n - 1][n - 1];
      dP[n][n] = k * (cosTh * P[n - 1][n - 1] + sinTh * dP[n - 1][n - 1]);
    }
    for (let m = 0; m < n; m++) {
      const den = Math.sqrt(n * n - m * m);
      const kk = n >= 2 ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
      const p2 = n >= 2 ? P[n - 2][m] : 0;
      const dp2 = n >= 2 ? dP[n - 2][m] : 0;
      P[n][m] = ((2 * n - 1) * cosTh * P[n - 1][m] - kk * p2) / den;
      dP[n][m] = ((2 * n - 1) * (cosTh * dP[n - 1][m] - sinTh * P[n - 1][m]) - kk * dp2) / den;
    }
  }

  for (let m = 0; m <= NMAX; m++) {
    COS[m] = Math.cos(m * lon);
    SIN[m] = Math.sin(m * lon);
  }
  let br = 0, bt = 0, bp = 0;
  let ar = (A / r) * (A / r);
  for (let n = 1; n <= NMAX; n++) {
    ar *= A / r; // (a/r)^(n+2)
    for (let m = 0; m <= n; m++) {
      const cm = COS[m];
      const sm = SIN[m];
      const gh = g[n][m] * cm + h[n][m] * sm;
      br += ar * (n + 1) * gh * P[n][m];
      bt -= ar * gh * dP[n][m];
      bp += ar * m * (g[n][m] * sm - h[n][m] * cm) * P[n][m];
    }
  }
  bp /= st;
  const F = Math.sqrt(br * br + bt * bt + bp * bp);
  return { F, br, bt, bp };
}

/** Solo l'intensità totale, in nT. */
export function intensity(lat, lon, altKm, year, coeffs) {
  return field(lat, lon, altKm, year, coeffs).F;
}

/**
 * Minimo locale di F dentro un riquadro: griglia a `step` gradi, poi
 * raffinamento a passo decrescente. `onBorder` dice se il minimo cade sul
 * bordo del riquadro (cioè non è un vero minimo locale).
 */
export function findMinimum(year, box, altKm = 0, step = 1) {
  const coeffs = coefficientsFor(year);
  let best = { lat: 0, lon: 0, F: Infinity };
  for (let lat = box.latMin; lat <= box.latMax + 1e-9; lat += step) {
    for (let lon = box.lonMin; lon <= box.lonMax + 1e-9; lon += step) {
      const F = intensity(lat, lon, altKm, year, coeffs);
      if (F < best.F) best = { lat, lon, F };
    }
  }
  for (let s = step / 2; s >= 0.005; s /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dl, dn] of [[s, 0], [-s, 0], [0, s], [0, -s], [s, s], [s, -s], [-s, s], [-s, -s]]) {
        const lat = best.lat + dl;
        const lon = best.lon + dn;
        if (lat < box.latMin || lat > box.latMax || lon < box.lonMin || lon > box.lonMax) continue;
        const F = intensity(lat, lon, altKm, year, coeffs);
        if (F < best.F) {
          best = { lat, lon, F };
          improved = true;
        }
      }
    }
  }
  const tol = 0.05;
  const onBorder =
    best.lat - box.latMin < tol || box.latMax - best.lat < tol ||
    best.lon - box.lonMin < tol || box.lonMax - best.lon < tol;
  return { ...best, onBorder };
}

/** Distanza ortodromica in km fra due punti (gradi). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Azimut iniziale (gradi da Nord, senso orario) da 1 a 2. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toR) * Math.cos(lat2 * toR);
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lon2 - lon1) * toR);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Superficie (milioni di km²) dove F < soglia, integrata su una griglia a
 * `step` gradi nel riquadro dato.
 */
export function areaBelow(year, threshold, box, altKm = 0, step = 0.5) {
  const coeffs = coefficientsFor(year);
  const R = 6371.0;
  const toR = Math.PI / 180;
  let area = 0;
  for (let lat = box.latMin + step / 2; lat < box.latMax; lat += step) {
    const cell = R * R * (step * toR) * (step * toR) * Math.cos(lat * toR);
    for (let lon = box.lonMin + step / 2; lon < box.lonMax; lon += step) {
      if (intensity(lat, lon, altKm, year, coeffs) < threshold) area += cell;
    }
  }
  return area / 1e6;
}
