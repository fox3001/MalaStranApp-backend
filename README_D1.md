# Setup D1 + Worker (locale)

## 1. Installare wrangler (se non già installato)

```bash
npm install -g wrangler
```

## 2. Creare il database D1

```bash
wrangler d1 create malastran_db
```

Copia il `database_id` che wrangler stampa e inseriscilo in `wrangler.jsonc` al posto di `""`:

```jsonc
"database_id": "QUI_IL_DATABASE_ID"
```

## 3. Applicare lo schema e il seed

```bash
wrangler d1 execute malastran_db --file=schema.sql
wrangler d1 execute malastran_db --file=seed.sql
```

## 4. Avviare il Worker in locale

```bash
wrangler dev
```

Il Worker sarà raggiungibile su `http://localhost:8787` (o la porta indicata da wrangler).

## 5. Credenziali iniziali

Password usate nello script di seed (hash già calcolati):

- Admin: `Simone Fox` / password: `admin1234`
- User 1: `Luna Rinaldi` / password: `luna1234`
- User 2: `Marco De Santis` / password: `marco1234`

Puoi cambiarle dopo creando nuovi utenti dall'Admin.

## 6. Collegare il frontend

Nel frontend, sostituisci le chiamate a `demo.ts` con `fetch()` verso il Worker:

- Login: `POST http://localhost:8787/auth/login`
- Eventi: `GET http://localhost:8787/events`
- ecc.

Il token JWT va salvato (es. localStorage) e inviato come `Authorization: Bearer <token>` nelle rotte protette.
