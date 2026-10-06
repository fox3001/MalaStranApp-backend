// Struttura del database (gli "scaffali" della dispensa).
// Il Worker la controlla da solo alla prima richiesta: crea le tabelle che mancano
// e aggiunge le colonne mancanti. Non cancella mai dati: eventuali tabelle di una
// versione vecchia e incompatibile vengono solo rinominate in "legacy_*".

export const SCHEMA_VERSION = 4;

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cognome TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    ruolo TEXT NOT NULL CHECK (ruolo IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    data TEXT NOT NULL,
    ora_ritrovo TEXT,
    ora_inizio TEXT,
    ora_fine TEXT,
    luogo TEXT,
    tipo TEXT,
    descrizione TEXT,
    info_operative TEXT,
    referente_nome TEXT,
    referente_telefono TEXT,
    compenso TEXT,
    compenso_visibile INTEGER NOT NULL DEFAULT 0,
    note_admin TEXT,
    stato TEXT NOT NULL DEFAULT 'richiesta' CHECK (stato IN ('richiesta', 'da_definire', 'confermato', 'annullato', 'chiuso')),
    motivo_annullamento TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_data ON events(data)`,
  `CREATE TABLE IF NOT EXISTS event_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stato TEXT NOT NULL DEFAULT 'pending' CHECK (stato IN ('pending', 'available', 'unavailable', 'confirmed', 'rejected')),
    ruolo_evento TEXT,
    nota_user TEXT,
    nota_admin TEXT,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    responded_at TEXT,
    decided_at TEXT,
    UNIQUE (event_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_participants_user ON event_participants(user_id)`,
  `CREATE TABLE IF NOT EXISTS load_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    categoria TEXT,
    quantita INTEGER NOT NULL DEFAULT 1,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    present INTEGER NOT NULL DEFAULT 0,
    returned INTEGER NOT NULL DEFAULT 0,
    damaged INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    codice TEXT,
    taglia TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_load_rows_event ON load_rows(event_id)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    for_admin INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`,
  `CREATE TABLE IF NOT EXISTS user_costumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    categoria TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_costumes_user ON user_costumes(user_id)`,
  `CREATE TABLE IF NOT EXISTS schema_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

// Colonne aggiunte nel tempo alla tabella users.
const USER_EXTRA_COLUMNS: Array<[string, string]> = [
  ["telefono", "TEXT"],
  ["bio", "TEXT"],
  ["note", "TEXT"],
  ["qualifica", "TEXT"],
  ["attivo", "INTEGER NOT NULL DEFAULT 1"],
  ["competenze_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["competenze_flag_json", "TEXT NOT NULL DEFAULT '[]'"],
];

// Colonna che deve esistere in una tabella per considerarla "della versione giusta".
const REQUIRED_MARKER: Record<string, string> = {
  users: "username",
  events: "ora_ritrovo",
  sessions: "token_hash",
};

// Colonne aggiunte nel tempo alla bolla di carico.
const LOAD_ROW_EXTRA_COLUMNS: Array<[string, string]> = [
  ["codice", "TEXT"],
  ["taglia", "TEXT"],
];

const OLD_TABLES = ["availability_requests", "assignments", "tl_assignments"];

async function tableNames(db: D1Database): Promise<Set<string>> {
  const rows = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
  return new Set(rows.results.map((r) => r.name));
}

async function columnNames(db: D1Database, table: string): Promise<Set<string>> {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set(rows.results.map((r) => r.name));
}

let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = migrate(db).catch((err) => {
      ready = null; // riprova alla richiesta successiva
      throw err;
    });
  }
  return ready;
}

async function migrate(db: D1Database): Promise<void> {
  let tables = await tableNames(db);
  if (tables.has("schema_info")) {
    const row = await db.prepare("SELECT version FROM schema_info WHERE id = 1").first<{ version: number }>();
    if (row && row.version >= SCHEMA_VERSION) return;
  }

  // 1. Mette da parte (rinomina) le tabelle di versioni vecchie e incompatibili.
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (const [table, marker] of Object.entries(REQUIRED_MARKER)) {
    if (tables.has(table) && !(await columnNames(db, table)).has(marker)) {
      const count = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
      if (count && count.n === 0 && table === "events") {
        // tabella eventi della versione 3, ancora vuota: si ricrea con la nuova forma
        await db.prepare("DROP TABLE IF EXISTS event_participants").run();
        await db.prepare("DROP TABLE IF EXISTS load_rows").run();
        await db.prepare("UPDATE notifications SET event_id = NULL WHERE event_id IS NOT NULL").run().catch(() => undefined);
        await db.prepare("DROP TABLE events").run();
      } else {
        await db.prepare(`ALTER TABLE ${table} RENAME TO legacy_${table}_${stamp}`).run();
      }
    }
  }
  for (const table of OLD_TABLES) {
    if (tables.has(table)) await db.prepare(`ALTER TABLE ${table} RENAME TO legacy_${table}_${stamp}`).run();
  }

  // 2. Crea tutto ciò che manca.
  for (const sql of TABLES) await db.prepare(sql).run();

  // 3. Aggiunge le colonne mancanti agli utenti.
  const userCols = await columnNames(db, "users");
  for (const [name, def] of USER_EXTRA_COLUMNS) {
    if (!userCols.has(name)) await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${def}`).run();
  }

  const loadCols = await columnNames(db, "load_rows");
  for (const [name, def] of LOAD_ROW_EXTRA_COLUMNS) {
    if (!loadCols.has(name)) await db.prepare(`ALTER TABLE load_rows ADD COLUMN ${name} ${def}`).run();
  }

  await db
    .prepare("INSERT INTO schema_info (id, version, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at")
    .bind(SCHEMA_VERSION)
    .run();
  tables = await tableNames(db);
}

export async function schemaStatus(db: D1Database) {
  const tables = [...(await tableNames(db))].filter((t) => !t.startsWith("_cf") && t !== "sqlite_sequence").sort();
  const row = tables.includes("schema_info")
    ? await db.prepare("SELECT version FROM schema_info WHERE id = 1").first<{ version: number }>()
    : null;
  return { version: row?.version ?? 0, tables };
}
