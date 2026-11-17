# Report tecnico: South Atlantic Anomaly (SAA) — modello IGRF-14

Tutti i numeri di questo report escono dai coefficienti ufficiali IGRF-14
(`data/igrf/igrf14coeffs.txt`) tramite `tools/igrf-saa.mjs`; la serie annuale
completa è in `data/saa_igrf14.csv`. La prima versione del progetto usava
valori stimati a mano, oggi in `legacy/`: diversi non coincidevano con il
modello (vedi in fondo).

## 1. Stato al 2026

- **Minimo principale P1 (Sud America):** 22.037 nT a 25,9°S 60,2°O
  (Paraguay / Nord Argentina, regione del Chaco).
- **Calo rispetto al 1900:** −13,3% (25.421 nT, allora a 21,7°S 37,0°O, in
  mare al largo del Brasile).
- **Lobo secondario P2 (Sud-Ovest Africa):** 23.373 nT a 40,3°S 0,8°O,
  nell'Atlantico meridionale a sud-ovest del Sudafrica. È un minimo locale
  separato dal **2010** e si approfondisce più in fretta di P1
  (circa −88 nT/anno contro −31 nT/anno nel 2020–2026).
- **A 400 km di quota (ISS):** minimo 18.980 nT a 22,8°S 59,7°O.
- **Superficie con F < 24.000 nT:** 19,1 milioni di km² (7,5 nel 2000).
- **Superficie con F < 23.000 nT:** 6,4 milioni di km².

## 2. Deriva

Il minimo P1 si sposta verso **Ovest** (azimut ~270°): dal 1900 ha percorso
23° di longitudine, in media 0,18°/anno. Su base ±5 anni la velocità è stata
di 15–23 km/anno nel secondo dopoguerra e circa 20 km/anno oggi. I valori
1945–1960 sono rumorosi perché i coefficienti DGRF di quegli anni sono i meno
affidabili della serie.

## 3. Origine

La SAA nasce da macchie di flusso inverso al confine nucleo-mantello
(~2.890 km di profondità), sotto l'Atlantico meridionale e l'Africa
australe, dove le linee di campo rientrano nel nucleo invece di uscirne. Il
loro rafforzamento e la deriva verso ovest abbassano l'intensità in
superficie. La comparsa del secondo minimo dal 2010 è coerente con quanto
osservato dalla costellazione ESA Swarm. Non è di per sé un indizio di
inversione imminente: anomalie simili compaiono nella variabilità ordinaria
del campo non dipolare.

## 4. Effetti per quota

- **Suolo:** nessun effetto radiologico; l'atmosfera ferma i protoni
  intrappolati.
- **Aviazione (10–12 km):** la dose viene dai raggi cosmici secondari, non
  dalle fasce; il campo debole conta per i guasti elettronici (SEU).
- **Orbita bassa (~400 km):** la fascia interna di Van Allen scende fin sotto
  la quota dell'ISS; una parte rilevante della dose degli equipaggi
  (complessivamente ~0,5–1 mSv/giorno) arriva nei transiti SAA, e lì si
  concentrano errori e reset dei satelliti in LEO.

## 5. Differenze rispetto alla prima versione

| Grandezza | Prima versione | IGRF-14 |
|---|---|---|
| P1 2026 | 22.150 nT, 26,1°S 58,4°O (CSV) oppure 25,8°S 54,9°O (pagina) | 22.037 nT, 25,9°S 60,2°O |
| P2 2026 | 22.680 nT, 34,2°S 12,1°E | 23.373 nT, 40,3°S 0,8°O |
| Comparsa P2 | 1970 (pagina) / 2010 (CSV) | 2010 |
| Azimut deriva | 288° (ONO) | ~271° (O) |
| P1 1840 | 27.500 nT (fuori dal modello) | IGRF parte dal 1900 |

Il 1840 e il 2035 non sono più mostrati: l'IGRF copre 1900–2030.
