# 🚀 Prossimi Passi - Database Migration

## Cosa è stato fatto

✅ **Branch `add-database` creata** con tutti i file necessari per il database:

### File aggiunti:

1. **`wrangler.toml`** - Configurazione Cloudflare Workers + D1
2. **`schema.sql`** - Schema completo del database (8 tabelle)
3. **`src/db/`** - Cartella con tutti i moduli database:
   - `index.ts` - Export e utility functions
   - `users.ts`, `events.ts`, `collaborators.ts`, `costumes.ts`, `materials.ts`, `availability.ts`, `assignments.ts`, `notifications.ts`
4. **`src/db/migrations/001_init.sql`** - Migrazione con dati demo iniziali
5. **`src/server.ts`** - Aggiornato per usare D1 invece di demo.ts
6. **`src/lib/store.tsx`** - Aggiornato per chiamare API invece di demo.ts
7. **`DATABASE.md`** - Guida completa al setup
8. **`package.json`** - Aggiornato con script wrangler

---

## 📋 Cosa devi fare ORA

### Step 1: Installa Wrangler (se non l'hai già)

```bash
npm install -g wrangler
```

### Step 2: Login a Cloudflare

```bash
wrangler login
```

### Step 3: Crea il database D1

```bash
wrangler d1 create malastranapp-db
```

**Copia il `database_id`** che viene restituito (es: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### Step 4: Aggiorna `wrangler.toml`

Apri `wrangler.toml` sulla branch `add-database` e sostituisci:

```toml
database_id = "__D1_DATABASE_ID__"
```

con:

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Il tuo ID reale
```

### Step 5: Esegui la migrazione

```bash
wrangler d1 execute malastranapp-db --file=src/db/migrations/001_init.sql
```

Questo crea le tabelle e inserisce i dati demo.

### Step 6: Testa in locale

```bash
npm install  # Se ci sono nuove dipendenze
npm run dev
```

L'app dovrebbe partire e caricare i dati dal database invece che da demo.ts.

### Step 7: Verifica

1. Apri `http://localhost:5173`
2. Prova a loggarti con:
   - Email: `admin@malastran.com`
   - Password: `admin123`
3. Crea un nuovo evento/collaboratore/costume
4. **Fai refresh della pagina** - i dati dovrebbero rimanere! 🎉

---

## 🔧 Comandi utili

```bash
# Resetta il database (cancella tutto e reinizializza)
wrangler d1 execute malastranapp-db --command="DROP TABLE IF EXISTS assignments; DROP TABLE IF EXISTS notifications; DROP TABLE IF EXISTS availability; DROP TABLE IF EXISTS materials; DROP TABLE IF EXISTS costumes; DROP TABLE IF EXISTS collaborators; DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS users;"
wrangler d1 execute malastranapp-db --file=src/db/migrations/001_init.sql

# Vedi i dati nel database
wrangler d1 execute malastranapp-db --command="SELECT * FROM users;"
wrangler d1 execute malastranapp-db --command="SELECT * FROM events;"

# Build per produzione
npm run build

# Deploy su Cloudflare Pages
npm run deploy
```

---

## ⚠️ Note importanti

### 1. Password in chiaro
Attualmente le password sono salvate in chiaro (es: `admin123`). **In produzione:**
- Usa bcrypt per hashare le password
- Implementa JWT per le sessioni

### 2. Utenti demo
Dopo la migrazione, questi sono gli utenti:

| Email | Password | Ruolo |
|-------|----------|-------|
| admin@malastran.com | admin123 | admin |
| user1@malastran.com | user123 | user |
| user2@malastran.com | user123 | user |
| user3@malastran.com | user123 | user |

### 3. Demo.ts esiste ancora
Il file `src/data/demo.ts` non viene più usato dal nuovo store, ma l'ho lasciato per backup. Puoi rimuoverlo dopo il merge.

---

## 🔄 Merge su main

Quando tutto funziona in locale:

1. **Fai commit di `wrangler.toml`** con il database_id reale
2. **Testa il deploy:**
   ```bash
   npm run deploy
   ```
3. **Mergea la branch** su main (via GitHub UI o CLI):
   ```bash
   git checkout main
   git merge add-database
   git push origin main
   ```

---

## 🆘 Se qualcosa va storto

### "Database not found"
- Controlla che `database_id` in `wrangler.toml` sia corretto
- Verifica con `wrangler d1 list` che il database esista

### "Table does not exist"
- Esegui di nuovo la migrazione:
  ```bash
  wrangler d1 execute malastranapp-db --file=src/db/migrations/001_init.sql
  ```

### "API error: 500"
- Controlla i log del server
- Verifica che `c.env.DB` sia correttamente bindato in `wrangler.toml`

### Il frontend non carica i dati
- Apri la console del browser (F12)
- Controlla che le chiamate `/api/*` non diano errori
- Verifica che il server sia in ascolto su `http://localhost:5173`

---

## 📚 Documentazione

- `DATABASE.md` - Guida completa al database
- `src/db/*.ts` - Codice delle query (leggi i commenti)
- https://developers.cloudflare.com/d1/ - Docs ufficiali Cloudflare D1

---

## ✅ Checklist finale

- [ ] Wrangler installato e login fatto
- [ ] Database D1 creato
- [ ] `wrangler.toml` aggiornato con database_id reale
- [ ] Migrazione eseguita con successo
- [ ] App funziona in locale con dati persistenti
- [ ] Testato creazione/modifica eventi, collaboratori, costumi, materiali
- [ ] Testato che i dati rimangono dopo refresh
- [ ] Deploy su Cloudflare funzionante
- [ ] Merge su main

**Buon lavoro! 🦊**
