# MalaStranApp – backend

Backend dell'app MalaStranApp: un Cloudflare Worker (`malastranapp-back`) scritto con Hono, collegato al database Cloudflare D1 `malastrana_db` (binding `DB`).

- Codice: `src/index.ts` (API) e `src/schema.ts` (struttura del database).
- Il database si prepara da solo alla prima richiesta: crea tabelle e colonne mancanti, senza cancellare dati. Le tabelle di versioni vecchie e incompatibili vengono rinominate `legacy_*`.
- `GET /api/health` mostra lo stato del backend e l'elenco delle tabelle.
- Pubblicazione: ogni push su `main` viene montato e pubblicato da Cloudflare Workers Builds.

Comandi: `npm run dev` (prova in locale), `npm run check` (controllo errori), `npm run build` (prova di montaggio).

Il frontend sta nella repo `fox3001/MalaStranApp`.
