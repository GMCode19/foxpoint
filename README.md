# Fox Point - Lake Fox

App interna dei Lake Fox: classifica Fox Point, taglie, ranked PBI.

- Frontend: React + Vite (`src/`)
  - `App.jsx` accesso, caricamento dati, azioni e classifica
  - `Bounties.jsx` bacheca "RICERCATO" · `Ranked.jsx` ranked PBI · `Profile.jsx` profilo e traguardi
  - `Admin.jsx` pannello admin · `Auth.jsx` accesso, registrazione, ingresso nel team · `lib.js` funzioni comuni
- Test: `npm test` (lettura e abbinamento della classifica PBI), eseguiti anche da GitHub prima di ogni pubblicazione
- Database e login: Supabase (script SQL forniti a parte)
- Sincronizzazione classifica PBI: `scripts/sync-pbi.mjs`, eseguito da GitHub Actions ogni mattina

**App:** https://gmcode19.github.io/foxpoint/

## Avvio in locale
    npm install
    npm run dev

## Pubblicazione (GitHub Pages)
Ogni modifica su `main` viene compilata e pubblicata in automatico nel ramo `gh-pages` (`.github/workflows/deploy.yml`), da cui GitHub Pages serve l'app.

## Classifica PBI
`.github/workflows/sync-pbi.yml` la aggiorna ogni mattina. Per aggiornarla subito: Actions > Aggiorna classifica PBI > Run workflow.
Una tantum: Settings > Secrets and variables > Actions > New repository secret `SUPABASE_SERVICE_ROLE_KEY` (chiave secret di Supabase).

## Database (cartella `database/`)
Da eseguire nel SQL Editor di Supabase:
- Installazione da zero: `00_reset` (solo se c'era già qualcosa), `01_schema`, `02_seed`, `03_admin`.
- Aggiornare un database esistente senza perdere dati: `04_aggiornamento`.
- Azzerare i dati di prova prima di partire: `05_pulizia_prove`.
- Unire il profilo doppio di Nikkk (una tantum): `06_unisci_nikkk`.
- Attivare le foto dei giocatori con taglia: `07_foto`.
- Taglie Top 10 legate alla posizione: `08_taglie_posizione`.
- Aggiornamenti in tempo reale e notifiche: `09_notifiche` e `10_notifiche_chiave`, poi la funzione `supabase/functions/push/index.ts` creata in Supabase (Edge Functions) con nome `push` e "Verify JWT" disattivato.

## Avviso
Progetto interno e non ufficiale dei Lake Fox, senza legami con Pro Bladers Italia o con i titolari del marchio Beyblade.
