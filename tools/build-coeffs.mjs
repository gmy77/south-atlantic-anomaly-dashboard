// Converte il file ufficiale IAGA data/igrf/igrf14coeffs.txt in
// public/igrf14-coeffs.js (modulo ES usato dal browser e dagli strumenti).
//   node tools/build-coeffs.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const txt = readFileSync(root + "data/igrf/igrf14coeffs.txt", "utf8");
const lines = txt.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));

const header = lines.find((l) => l.startsWith("g/h")).trim().split(/\s+/);
// "g/h n m 1900.0 ... 2025.0 2025-30"
const epochs = header.slice(3, -1).map(Number);
if (!epochs.every((e, i) => e === 1900 + 5 * i)) throw new Error("epoche inattese: " + epochs.join(","));

const rows = [];
const values = [];
const sv = [];
for (const l of lines) {
  const p = l.trim().split(/\s+/);
  if (p[0] !== "g" && p[0] !== "h") continue;
  const nums = p.slice(3).map(Number);
  if (nums.length !== epochs.length + 1 || nums.some((x) => !Number.isFinite(x))) {
    throw new Error("riga non valida: " + l);
  }
  rows.push([p[0], Number(p[1]), Number(p[2])]);
  values.push(nums.slice(0, -1));
  sv.push(nums.at(-1));
}
if (rows.length !== 195) throw new Error(`attese 195 righe, trovate ${rows.length}`);

const out =
  "// Generato da tools/build-coeffs.mjs: non modificare a mano.\n" +
  "// Fonte: IAGA Working Group V-MOD, IGRF-14 (igrf14coeffs.txt), coefficienti\n" +
  "// di Schmidt semi-normalizzati in nT, variazione secolare 2025-2030 in nT/anno.\n" +
  "export const COEFFS = " +
  JSON.stringify({ model: "IGRF-14", epochs, rows, values, sv }) +
  ";\n";
writeFileSync(root + "public/igrf14-coeffs.js", out);
console.log(`scritte ${rows.length} righe, epoche ${epochs[0]}–${epochs.at(-1)}`);
