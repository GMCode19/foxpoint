# Fox Point - Lake Fox

App interna dei Lake Fox: classifica Fox Point, taglie, ranked PBI.

- Frontend: React + Vite (`src/`)
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

## Avviso
Progetto interno e non ufficiale dei Lake Fox, senza legami con Pro Bladers Italia o con i titolari del marchio Beyblade.
