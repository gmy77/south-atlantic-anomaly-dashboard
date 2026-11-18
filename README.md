# South Atlantic Anomaly Observatory

Dashboard dell'**Anomalia del Sud Atlantico (SAA)** che gira tutta su Cloudflare.

**Online:** https://saa-observatory.gimmy077.workers.dev

- **Cloudflare Worker** con **Cron Trigger** due volte al giorno (06:07 e 18:07 UTC):
  legge i feed NOAA SWPC e accumula lo storico in **D1** (SQLite). I feed NOAA
  tengono solo 3 giorni; qui lo storico cresce senza limiti e senza nessun
  programma acceso sul PC.
- **API JSON/CSV** e **dashboard** serviti dallo stesso indirizzo
  (Workers Static Assets).
- **Campo geomagnetico IGRF-14** calcolato nel browser dai 195 coefficienti
  ufficiali IAGA: mappe e isolinee per ogni anno 1900–2030, al suolo o a
  400 km (quota ISS), di intensità F, variazione annua dF/dt, componenti H e
  Z, inclinazione e declinazione. Clic su un punto: tutti i valori e la storia
  dal 1900 (all'apertura: Udine).
- **ISS in tempo reale** (wheretheiss.at, tramite il Worker con cache di 20 s):
  posizione, traccia ±1 h colorata dove attraversa la SAA (F < 22.000 nT alla
  sua quota), tempo al prossimo ingresso/uscita.
- **Statistiche dell'archivio**: record, ultimi 30 giorni, distribuzione del Kp,
  episodi di tempesta (Kp ≥ 5, Dst ≤ −50 nT, protoni S1+).
- **Grafici del modello**: minimo, area, deriva, dipolo terrestre (momento e
  polo), velocità di indebolimento P1/P2, spostamento del minimo.
- Un pulsante **?** accanto a ogni sezione spiega cosa si sta guardando
  (testi in `public/help.js`). Icona in `public/icon.svg` (+ PNG e manifest).
- Vista condivisibile dall'indirizzo: `?q=F|SV|H|Z|I|D&anno=1990&quota=400`.

## Cosa c'è

| Percorso | Contenuto |
|---|---|
| `public/index.html`, `public/app.js` | dashboard (Leaflet + Chart.js) |
| `public/help.js` | testi dei pulsanti «?» |
| `public/icon.svg` | icona (PNG generati con Edge headless) |
| `public/igrf.js` | sintesi IGRF-14 grado 13 (Legendre di Schmidt, conversione WGS84) |
| `public/igrf14-coeffs.js` | coefficienti, generati da `tools/build-coeffs.mjs` |
| `worker/src/index.js` | Worker: cron, D1, API |
| `worker/schema.sql` | tabelle `goes`, `kp`, `dst`, `runs` |
| `worker/test.mjs` | prove senza wrangler (D1 finto su `node:sqlite`) |
| `worker/dev.mjs` | server locale: dashboard + API vere su SQLite |
| `tools/igrf-saa.mjs` | serie storica della SAA 1900–2030 da IGRF-14 |
| `data/` | coefficienti ufficiali e serie calcolata (JSON/CSV) |
| `docs/saa_report_tecnico.md` | report tecnico con i numeri del modello |
| `legacy/` | prima versione (pagina singola con dati stimati a mano) |

## Dati raccolti dal cron

| Tabella | Fonte NOAA SWPC | Passo |
|---|---|---|
| `goes` | protoni integrali ≥10/≥50/≥100 MeV, elettroni ≥2 MeV, magnetometro Hp (GOES primario, file 3 giorni) | 5 min |
| `kp` | `noaa-planetary-k-index.json` | 3 h |
| `dst` | `kyoto-dst.json` (WDC Kyoto) | 1 h |
| `runs` | registro di ogni aggiornamento | — |

Ogni giro riscrive solo le ultime 6 ore già in archivio più i punti nuovi;
`COALESCE` evita che un valore mancante cancelli quello salvato. Un giro
saltato si recupera al successivo, perché i file coprono 3 giorni.

## API

Non sono pubblicizzate nella pagina (scelta di Gimmy); restano utili per altri
programmi. Tutte in sola lettura tranne `/api/update`, che vuole la chiave.

```
GET  /api/latest                                   ultimi valori + scale NOAA S/G
GET  /api/history?series=goes|kp|dst&days=7        storico (≈2000 punti, passo automatico)
         [&step=3600] [&format=csv]
GET  /api/model[?format=csv]                       serie SAA 1900–2030 (IGRF-14)
GET  /api/runs                                     ultimi aggiornamenti
GET  /api/health                                   503 se nessun dato da oltre 26 h
POST /api/update   Authorization: Bearer <token>   aggiornamento extra (solo proprietario)
```

## Aggiornamenti extra: solo il proprietario

`POST /api/update` funziona solo con il secret `UPDATE_TOKEN` del Worker
(confronto a tempo costante, al massimo uno al minuto). Nella dashboard: link
**chiave** in fondo alla pagina → incolla il token una volta; da quel browser
il pulsante **Aggiorna** interroga NOAA subito. Senza chiave il pulsante
ricarica soltanto i dati dall'archivio.

## Pubblicazione

```bash
cd worker
npx wrangler d1 create saa-history          # copia il database_id in wrangler.toml
npx wrangler d1 execute saa-history --remote --file=schema.sql
npx wrangler secret put UPDATE_TOKEN         # una stringa lunga e casuale
npx wrangler deploy
```

Il primo giro del cron arriva al successivo orario 06:07/18:07 UTC; per
riempire subito l'archivio: `POST /api/update` con il token.

**Piano:** interpretare i file GOES da ~0,8 MB costa qualche decina di ms di
CPU, oltre i 10 ms del piano Free: serve Workers Paid (`[limits] cpu_ms`).
D1: ~300 righe scritte al giorno, ben dentro i limiti.

## Prove in locale

`wrangler dev` non parte su questo PC, quindi:

```bash
node worker/test.mjs            # funzioni, D1 finto, HTTP, token + feed NOAA veri
node worker/test.mjs --offline  # senza rete
node worker/dev.mjs             # http://127.0.0.1:8797, token locale "dev"
```

Rigenerare coefficienti e serie del modello (solo se cambia l'IGRF):

```bash
node tools/build-coeffs.mjs
node tools/igrf-saa.mjs
```

## Numeri del modello (IGRF-14)

| | 1900 | 2000 | 2026 | 2030* |
|---|---|---|---|---|
| Minimo P1 al suolo | 25.421 nT, 21,7°S 37,0°O | 22.873 nT, 26,0°S 54,6°O | **22.037 nT, 25,9°S 60,2°O** | 21.907 nT |
| Lobo P2 (SW Africa) | — | — | 23.373 nT, 40,3°S 0,8°O | 23.023 nT |
| Minimo a 400 km | 21.772 nT | 19.640 nT | 18.980 nT | 18.878 nT |
| Area F < 24.000 nT | 0 | 7,5 M km² | 19,1 M km² | 21,7 M km² |

\* dopo il 2025 il modello si estrapola con la variazione secolare (valido fino al 2030).
Il lobo P2 è un vero minimo locale al suolo dal **2010**. La deriva del minimo
è verso **Ovest** (azimut ~270°), circa 20 km/anno negli ultimi decenni.

## Fonti e licenze

- IGRF-14: IAGA Division V Working Group V-MOD (coefficienti liberi).
- NOAA SWPC (dominio pubblico USA), WDC for Geomagnetism Kyoto (Dst).
- Mappa: Esri World Dark Gray, confini Natural Earth via world-atlas.

Codice: licenza MIT.
