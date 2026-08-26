# 🗄️ Database Setup - MalaStranApp

Questa guida spiega come configurare il database Cloudflare D1 per l'app.

## Prerequisiti

1. Account Cloudflare
2. Wrangler CLI installato globalmente:
```bash
npm install -g wrangler
```

3. Login a Cloudflare:
```bash
wrangler login
```

## Setup del Database

### 1. Crea il database D1

```bash
wrangler d1 create malastranapp-db
```

Prendi nota del `database_id` che viene restituito.

### 2. Aggiorna `wrangler.toml`

Apri `wrangler.toml` e sostituisci `__D1_DATABASE_ID__` con il database_id ottenuto:

```toml
[[d1_databases]]
binding = "DB"
database_name = "malastranapp-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # <-- Inserisci qui il tuo ID
```

### 3. Esegui la migrazione iniziale

Questo crea le tabelle e inserisce i dati demo:

```bash
wrangler d1 execute malastranapp-db --file=src/db/migrations/001_init.sql
```

### 4. Verifica il database

```bash
wrangler d1 execute malastranapp-db --command="SELECT * FROM users;"
```

Dovresti vedere i 3 utenti demo.

## Sviluppo Locale

### Avvia il server in dev

```bash
npm run dev
```

Il server sarà disponibile su `http://localhost:5173`

### Reset del database (se serve)

```bash
wrangler d1 execute malastranapp-db --command="DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS events; ..."
wrangler d1 execute malastranapp-db --file=src/db/migrations/001_init.sql
```

## Deploy

### Build

```bash
npm run build
```

### Deploy su Cloudflare Pages

```bash
npm run deploy
```

## Utenti Demo

Dopo aver eseguito la migrazione, questi sono gli utenti disponibili:

| Email | Password | Ruolo |
|-------|----------|-------|
| admin@malastran.com | admin123 | admin |
| user1@malastran.com | user123 | user |
| user2@malastran.com | user123 | user |
| user3@malastran.com | user123 | user |

## API Endpoints

Tutti gli endpoint sono sotto `/api/`:

- `POST /api/auth/login` - Login utente
- `POST /api/auth/register` - Registrazione nuovo utente
- `GET /api/events` - Lista eventi
- `POST /api/events` - Crea evento
- `GET /api/collaborators` - Lista collaboratori
- `POST /api/collaborators` - Crea collaboratore
- `GET /api/costumes` - Lista costumi
- `POST /api/costumes` - Crea costume
- `GET /api/materials` - Lista materiali
- `POST /api/materials` - Crea materiale
- `GET /api/availability` - Lista disponibilità
- `POST /api/availability` - Imposta disponibilità
- `GET /api/assignments` - Lista assegnazioni
- `POST /api/assignments` - Crea assegnazione
- `GET /api/notifications/:userId` - Notifiche utente
- `POST /api/notifications` - Crea notifica

## Sicurezza

⚠️ **Importante:** Attualmente le password sono salvate in chiaro nel database. In produzione:

1. Usa bcrypt per hashare le password
2. Implementa JWT o sessioni per l'autenticazione
3. Aggiungi CORS restrictions
4. Usa variabili d'ambiente per dati sensibili

## Risoluzione Problemi

### Errore: "Database not found"

Assicurati che:
- Il database_id in `wrangler.toml` sia corretto
- Hai eseguito `wrangler d1 create malastranapp-db`

### Errore: "Table does not exist"

Esegui la migrazione:
```bash
wrangler d1 execute malastranapp-db --file=src/db/migrations/001_init.sql
```

### Il server non si connette al DB

Verifica che:
- Il binding `DB` in `wrangler.toml` corrisponda a `c.env.DB` nel codice
- Stai usando `wrangler dev` o `wrangler pages dev` per il locale

## Next Steps

- [ ] Implementare bcrypt per password hashing
- [ ] Aggiungere autenticazione JWT
- [ ] Creare endpoint per update/delete
- [ ] Aggiungere validazione input
- [ ] Implementare backup automatici
