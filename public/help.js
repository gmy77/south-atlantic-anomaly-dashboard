// Testi dei pulsanti «?». Chiave = valore di data-help nella pagina.
// Linguaggio semplice: chi legge può non sapere nulla di geomagnetismo.

export const HELP = {
  p1: {
    t: "Minimo SAA al suolo (P1)",
    x: `Il punto della Terra dove il campo magnetico è più debole: oggi in Sud America, fra Paraguay e Argentina.
Il valore è l'intensità totale F in nanotesla (nT), calcolata dal modello ufficiale IGRF-14.
Per confronto: in Italia F vale circa 47.000–48.000 nT, ai poli oltre 55.000 nT. La percentuale indica di quanto si è indebolito il minimo dal 1900.`,
  },
  drift: {
    t: "Deriva del minimo",
    x: `Il minimo non sta fermo: si sposta verso Ovest di circa 20 km all'anno.
La velocità è misurata su una finestra di 10 anni (5 prima e 5 dopo) per togliere il rumore: il fondo dell'anomalia è molto piatto e il punto esatto del minimo "balla" facilmente.
L'azimut è la direzione in gradi da Nord in senso orario (270° = Ovest).`,
  },
  p2: {
    t: "Lobo africano (P2) e quota ISS",
    x: `Dal 2010 circa l'anomalia ha un secondo minimo separato, nell'Atlantico a sud-ovest del Sudafrica. Si indebolisce più in fretta del minimo principale: è il fenomeno che gli scienziati chiamano "divisione" della SAA.
Il valore piccolo sotto è il minimo del campo a 400 km di quota, dove vola la ISS: lassù il campo è più debole che al suolo perché ci si allontana dal nucleo.`,
  },
  protons: {
    t: "Protoni GOES ≥10 MeV",
    x: `Particelle cariche energetiche misurate dai satelliti meteo americani GOES, in orbita a 36.000 km. Si misurano in pfu (particelle per cm² al secondo per steradiante).
Sotto 10 pfu è quiete (S0). Da 10 pfu NOAA dichiara una tempesta di radiazione solare S1, poi S2 a 100, S3 a 1.000 e così via.
Non misura la SAA direttamente: dice quanta radiazione arriva dal Sole. Quando è alta, anche la SAA diventa più "calda" per i satelliti bassi.`,
  },
  geo: {
    t: "Kp e Dst",
    x: `Kp (da 0 a 9) misura quanto è agitato il campo magnetico ogni 3 ore, da una rete mondiale di osservatori. Da Kp 5 c'è una tempesta geomagnetica (G1), fino a G5 con Kp 9.
Dst (in nT) misura la corrente ad anello attorno alla Terra: vicino a zero è calma, sotto −50 nT tempesta moderata, sotto −100 nT tempesta intensa.
Hp è il campo misurato dal satellite GOES in orbita geostazionaria.`,
  },
  iss: {
    t: "ISS in tempo reale",
    x: `Posizione della Stazione Spaziale Internazionale, aggiornata ogni 20 secondi (fonte wheretheiss.at).
La dashboard calcola il campo magnetico IGRF-14 proprio nel punto e alla quota della ISS. Sotto 22.000 nT la consideriamo "dentro la SAA": a quella quota questa soglia disegna l'area dove i protoni intrappolati della fascia di Van Allen scendono più in basso.
Sulla mappa la traccia è rossa dove la ISS attraversa l'anomalia. Ogni giorno la ISS ci passa 5–6 volte, per 10–20 minuti.`,
  },
  map: {
    t: "Mappa del campo magnetico",
    x: `I colori sono calcolati nel tuo browser dai 195 coefficienti del modello IGRF-14, per l'anno scelto con il cursore (1900–2030).
Grandezze disponibili:
• F: intensità totale. Rosso = campo debole (l'anomalia).
• dF/dt: quanto cambia F in un anno. Rosso = si indebolisce, blu = si rafforza.
• H: componente orizzontale (quella che orienta la bussola).
• Z: componente verticale; positiva verso il basso (emisfero Nord).
• Inclinazione: angolo delle linee di campo rispetto all'orizzonte. La linea 0° è l'equatore magnetico.
• Declinazione: di quanti gradi la bussola si discosta dal Nord geografico.
Clicca un punto qualsiasi per vedere tutti i valori e la storia di quel punto dal 1900.`,
  },
  point: {
    t: "Il punto selezionato",
    x: `Tutti i valori del campo nel punto cliccato sulla mappa (all'inizio: Udine), per l'anno scelto.
Il grafico mostra come è cambiata l'intensità F in quel punto dal 1900 al 2030, confrontata con il minimo della SAA.
Dopo il 2025 il modello prosegue con la variazione secolare prevista: è una stima, valida fino al 2030.`,
  },
  history: {
    t: "Storico del meteo spaziale",
    x: `I dati NOAA in rete restano disponibili solo per 3 giorni. Qui un programma su Cloudflare (Worker) li legge due volte al giorno, alle 06:07 e 18:07 UTC, e li conserva in un database: lo storico cresce giorno dopo giorno.
Scegli l'intervallo con i pulsanti. Sui periodi lunghi i punti vengono raggruppati: per i flussi si mostra il massimo di ogni gruppo, così i picchi non spariscono.`,
  },
  chProtons: {
    t: "Protoni integrali",
    x: `Flusso di protoni sopra 10, 50 e 100 MeV misurato da GOES. Scala logaritmica: ogni riga è dieci volte la precedente.
La linea tratteggiata rossa è la soglia di tempesta S1 (10 pfu sopra 10 MeV). I picchi improvvisi arrivano con i brillamenti solari e le espulsioni di massa coronale.`,
  },
  chGeo: {
    t: "Kp e Dst",
    x: `Barre: indice Kp ogni 3 ore (verde calmo, giallo attivo, arancio tempesta G1–G2, rosso G3+).
Linea viola: Dst orario di Kyoto. Durante una tempesta il Dst scende bruscamente e poi risale in uno o due giorni.`,
  },
  chElectrons: {
    t: "Elettroni e campo GOES",
    x: `Elettroni sopra 2 MeV della fascia esterna di Van Allen, misurati da GOES: sono quelli che danneggiano i satelliti per carica interna. Salgono di solito 1–3 giorni dopo l'arrivo di vento solare veloce.
La linea verde è il campo magnetico (Hp) misurato in orbita geostazionaria: oscilla ogni giorno con la rotazione terrestre.`,
  },
  runs: {
    t: "Registro aggiornamenti",
    x: `Ogni volta che il Worker legge NOAA scrive qui una riga: ora, origine (cron = automatico, manuale = pulsante Aggiorna con la chiave), righe scritte nel database ed esito.
"parziale" vuol dire che una delle fonti non ha risposto: i dati mancanti si recuperano al giro successivo.`,
  },
  stats: {
    t: "Statistiche dell'archivio",
    x: `Riepilogo di tutto quello che il database ha raccolto finora: record, quante volte il Kp ha raggiunto ogni valore, e l'elenco degli episodi di tempesta.
Più l'archivio cresce, più queste statistiche diventano significative.`,
  },
  daily: {
    t: "Ultimi 30 giorni",
    x: `Un valore per giorno (UTC): Kp massimo (barre), Dst minimo (linea viola) e flusso massimo di protoni ≥10 MeV (linea azzurra, scala a destra, logaritmica).
Serve a vedere a colpo d'occhio i giorni agitati.`,
  },
  kphist: {
    t: "Distribuzione del Kp",
    x: `Quante volte, nell'archivio, il Kp è stato 0, 1, 2… fino a 9. Ogni valore conta un intervallo di 3 ore.
In un periodo normale la maggior parte dei valori sta fra 0 e 3; le barre arancio e rosse sono le tempeste.`,
  },
  events: {
    t: "Episodi",
    x: `Gli episodi sono raggruppati automaticamente:
• tempeste geomagnetiche: intervalli consecutivi con Kp ≥ 5;
• tempeste Dst: ore consecutive con Dst ≤ −50 nT;
• eventi protonici: periodi con protoni ≥10 MeV sopra 10 pfu (S1 o più).
Per ognuno: inizio, durata e picco.`,
  },
  modelF: {
    t: "Indebolimento del minimo",
    x: `Come è sceso il valore minimo del campo dal 1900: al suolo per il minimo principale (P1) e per il lobo africano (P2, dal 2010), e a 400 km di quota.
Dal 1900 il minimo è sceso di circa 3.400 nT, cioè del 13%.`,
  },
  modelArea: {
    t: "Estensione e deriva",
    x: `Superficie della Terra dove il campo al suolo è sotto 24.000 e 23.000 nT, in milioni di km² (l'Europa intera misura circa 10 milioni di km²).
Linea verde: velocità di spostamento del minimo P1. Il salto fra 1945 e 1960 viene dai coefficienti storici di quegli anni, i meno precisi della serie.`,
  },
  dipole: {
    t: "Il dipolo terrestre",
    x: `In prima approssimazione la Terra è un grande magnete (dipolo). Il suo momento magnetico, in 10²² A·m², cala da almeno due secoli: circa −8% dal 1900.
La linea viola è la latitudine del polo geomagnetico Nord: oggi si avvicina al polo geografico.
L'indebolimento del dipolo è una delle cause per cui la SAA si allarga.`,
  },
  rates: {
    t: "Velocità di indebolimento",
    x: `Quanti nT all'anno perde il campo nel minimo principale (P1) e nel lobo africano (P2).
Valori più negativi = indebolimento più rapido. Il lobo africano scende circa tre volte più in fretta del minimo principale: per questo gli scienziati lo seguono con attenzione.`,
  },
  track: {
    t: "Spostamento del minimo",
    x: `Longitudine e latitudine del minimo principale anno per anno. La longitudine scende costantemente (spostamento verso Ovest, dal largo del Brasile fino all'interno del Sud America), mentre la latitudine resta quasi ferma intorno a 26°S.`,
  },
  effects: {
    t: "Effetti per quota",
    x: `Al suolo la SAA non ha effetti sulla salute: l'atmosfera ferma le particelle. Conta per chi vola molto in alto e soprattutto per satelliti e astronauti in orbita bassa.
I valori sono ordini di grandezza indicativi dalla letteratura.`,
  },
  table: {
    t: "Tabella del modello",
    x: `Un riepilogo ogni 5 anni della serie calcolata da IGRF-14. In corsivo gli anni dopo il 2025, stimati con la variazione secolare.
La serie completa, anno per anno, si scarica con "CSV Modello".`,
  },
};
