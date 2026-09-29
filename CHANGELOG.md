# Changelog

## [1.3.0] - 2026-09-29

- Login obbligatorio su `/login`, con credenziali prese dalle variabili d'ambiente `ADMIN_USERNAME` e `ADMIN_PASSWORD`. **Senza queste variabili il container non parte**
- Pagine e API sono protette: senza sessione le pagine rimandano a `/login` e l'API risponde 401
- La sessione dura 30 giorni, con un cookie firmato `HttpOnly`/`SameSite=Lax`, `Secure` dietro HTTPS. Il segreto sta in `/data/session.secret`; cambiando le credenziali si disconnettono tutti i dispositivi
- Dopo 5 tentativi sbagliati dallo stesso IP il login si blocca per 15 minuti
- Pulsante "Esci" in alto

## [1.2.0] - 2026-09-26

- Nuova sezione "Le mie classi" (pulsante in alto o "+ Inserisci le tue classi" nel modulo): inserisci le tue classi una volta, anche più di una insieme separandole con la virgola (es. `1A, 2A, 3B`), e le togli con ×
- Nel modulo le classi compaiono sempre come bottoni; il campo di testo resta solo per una classe fuori elenco
- Le classi vengono salvate sul server insieme ai limiti

## [1.1.1] - 2026-09-26

- Fix: dopo un aggiornamento il browser o Cloudflare potevano servire `style.css` e `app.js` vecchi insieme all'HTML nuovo, e la pagina si rompeva (tipi in lista di testo, riepiloghi vuoti). Ora CSS e JS hanno nel link un numero di versione che cambia a ogni deploy, e l'HTML non viene mai messo in cache
- Fix: il campo nota e il pulsante "Annulla" comparivano anche quando dovevano restare nascosti

## [1.1.0] - 2026-09-26

Inserimento più semplice.

- Tipo e classe si scelgono con dei bottoni al posto del menu a tendina; le classi già usate compaiono come scorciatoie e una classe nuova si scrive nel campo sotto
- Bottoni "Oggi" e "Ieri" per la data
- Bottoni di durata rapida (30 min, 45 min, 1 h, 1 h 30, 2 h) che calcolano da soli l'ora di fine
- Dopo "Aggiungi" il modulo resta pronto per il consiglio successivo: stesso tipo e stessa data, l'inizio parte dalla fine del precedente e la durata resta la stessa, quindi basta scegliere la classe
- La nota è nascosta dietro "+ Aggiungi una nota"

## [1.0.0] - 2026-09-26

Prima versione.

- Inserimento impegni: tipo, classe, data, ora inizio/fine, note; durata calcolata in automatico
- Due monte ore separati (art. 29 c.3 lett. a e b, 40 h ciascuno) con barra di avanzamento, ore residue e segnalazione del superamento
- Scrutini, esami e "altro" contati a parte, fuori dai due monte ore
- Riepilogo per classe, elenco per mese con modifica ed eliminazione, filtro per monte ore
- Selezione dell'anno scolastico (dal 1° settembre al 31 agosto)
- Limiti modificabili (part-time)
- Esportazione CSV compatibile con Excel
- Server Node senza dipendenze, dati JSON in un volume Docker, stack pronto per Portainer (porta 8092)
