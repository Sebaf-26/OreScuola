# OreScuola

Web app self-hosted per contare le **ore funzionali all'insegnamento** (CCNL scuola, art. 29 c.3).

Per ogni impegno inserisci cosa è, la classe, la data, l'ora di inizio e l'ora di fine. La durata si calcola da sola e l'app tiene due contatori separati:

| Monte ore | Limite | Cosa ci rientra |
|---|---|---|
| **Lettera a)** Collegio e programmazione | 40 h | Collegio docenti, dipartimenti, programmazione e verifica, incontri con le famiglie |
| **Lettera b)** Consigli di classe | 40 h | Consigli di classe, interclasse, intersezione |
| Fuori monte ore | — | Scrutini, esami, altro |

Poi ci sono il riepilogo per classe, l'elenco diviso per mese, i filtri, l'esportazione CSV (si apre direttamente in Excel) e la scelta dell'anno scolastico, che parte dal 1° settembre. I limiti si possono cambiare, per esempio in proporzione per chi è in part-time.

## Stack

- `server.js`: server Node senza dipendenze. Serve `public/` ed espone una piccola API JSON.
- `public/`: HTML, CSS e JS senza build.
- I dati stanno in `/data/ore.json`, nel volume Docker `orescuola-data`.

## Deploy su Portainer

1. **Stacks → Add stack → Repository**
2. URL: `https://github.com/Sebaf-26/OreScuola`, riferimento `refs/heads/main`, compose path `docker-compose.yml`
3. Variabili d'ambiente:

   | Variabile | | |
   |---|---|---|
   | `ADMIN_USERNAME` | **obbligatoria** | nome utente per accedere |
   | `ADMIN_PASSWORD` | **obbligatoria** | password |
   | `PORT` | facoltativa | porta sull'host (default `8092`) |

4. Deploy, poi su Nginx Proxy Manager fai puntare un host a `http://<ip-docker>:8092`

## Accesso

Tutta l'app è protetta da login su `/login`: senza sessione le pagine rimandano lì e l'API risponde 401.

- La sessione dura 30 giorni (cookie `HttpOnly`, `SameSite=Lax`, `Secure` dietro HTTPS)
- Cambiando `ADMIN_USERNAME` o `ADMIN_PASSWORD` e rifacendo il deploy, tutti i dispositivi vengono disconnessi
- Dopo 5 tentativi sbagliati dallo stesso IP il login resta bloccato per 15 minuti
- Il segreto che firma le sessioni viene generato al primo avvio in `/data/session.secret`
- Senza `ADMIN_USERNAME` e `ADMIN_PASSWORD` il container non parte

## Sviluppo locale

```bash
ADMIN_USERNAME=prof ADMIN_PASSWORD=prova npm run dev   # http://localhost:3000, dati in ./data
```

## API

| Metodo | Percorso | |
|---|---|---|
| GET | `/api/entries` | elenco impegni |
| POST | `/api/entries` | `{tipo, classe, data, inizio, fine, note}` |
| PUT | `/api/entries/:id` | modifica |
| DELETE | `/api/entries/:id` | elimina |
| GET/PUT | `/api/settings` | `{limiteA, limiteB, classi}` |
| POST | `/api/login` | `{username, password}`, imposta il cookie di sessione |
| POST | `/api/logout` | cancella il cookie |
