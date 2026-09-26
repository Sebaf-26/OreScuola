# Changelog

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
