-- Archivio della dashboard South Atlantic Anomaly (D1 / SQLite).
-- Tempi: epoch Unix in secondi, UTC.

-- GOES primario, un punto ogni 5 minuti
--   p10, p50, p100  protoni integrali >=10, >=50, >=100 MeV (pfu)
--   e2              elettroni integrali >=2 MeV (pfu)
--   hp              magnetometro GOES, componente Hp (nT), media sui 5 minuti
CREATE TABLE IF NOT EXISTS goes (
  t    INTEGER PRIMARY KEY,
  p10  REAL,
  p50  REAL,
  p100 REAL,
  e2   REAL,
  hp   REAL
) WITHOUT ROWID;

-- Kp planetario NOAA, intervalli di 3 ore (t = inizio intervallo)
CREATE TABLE IF NOT EXISTS kp (
  t  INTEGER PRIMARY KEY,
  kp REAL
) WITHOUT ROWID;

-- Dst orario di Kyoto (nT)
CREATE TABLE IF NOT EXISTS dst (
  t   INTEGER PRIMARY KEY,
  dst REAL
) WITHOUT ROWID;

-- Registro degli aggiornamenti (cron o manuali)
CREATE TABLE IF NOT EXISTS runs (
  t       INTEGER PRIMARY KEY,
  trigger TEXT NOT NULL,
  rows    INTEGER NOT NULL,
  errors  TEXT
) WITHOUT ROWID;
