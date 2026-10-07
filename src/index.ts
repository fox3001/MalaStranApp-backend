// MalaStranApp – backend (Cloudflare Worker + Hono + D1)
//
// Regole principali:
// - c'è un solo admin (password nella variabile ADMIN_PASSWORD);
// - gli user li crea solo l'admin, che sceglie username e password;
// - ogni controllo dei permessi avviene qui nel backend, non solo nelle pagine.

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { ensureSchema, schemaStatus } from "./schema";

type Bindings = { DB: D1Database; ADMIN_PASSWORD?: string };
type SessionUser = { id: number | "admin"; nome: string; cognome: string; username: string; role: "admin" | "user" };
type Env = { Bindings: Bindings; Variables: { me: SessionUser } };
type C = Context<Env>;

const app = new Hono<Env>();
const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function normalizePart(value: string): string {
  return value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
function str(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}
function bool(value: unknown): number {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}
function tagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, 40);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= 60) break;
  }
  return out;
}
function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(typeof value === "string" ? value : "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
function fail(c: C, status: 400 | 401 | 403 | 404 | 409 | 500, error: string) {
  return c.json({ success: false, error }, status);
}
async function body<T = Record<string, unknown>>(c: C): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return {} as T;
  }
}
function intParam(c: C, name: string): number | null {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Password e sessioni
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100000; // massimo consentito da Cloudflare Workers

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterText, saltHex, hashHex] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterText || !saltHex || !hashHex) return false;
  const iterations = Number(iterText);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 100000) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, key, 256));
  const expected = hexToBytes(hashHex);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i += 1) diff |= (bits[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}
async function hashToken(token: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
}
const SESSION_DAYS = 30;
async function createSession(db: D1Database, user: SessionUser): Promise<string> {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db
    .prepare("INSERT INTO sessions (id, user_id, role, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.id === "admin" ? null : user.id, user.role, await hashToken(token), expiresAt)
    .run();
  // pulizia delle sessioni scadute
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date().toISOString()).run();
  return token;
}
async function sessionFromRequest(c: C): Promise<SessionUser | null> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const row = await c.env.DB
    .prepare(
      `SELECT s.role, s.user_id, s.expires_at, u.nome, u.cognome, u.username, u.attivo
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<{ role: "admin" | "user"; user_id: number | null; expires_at: string; nome: string | null; cognome: string | null; username: string | null; attivo: number | null }>();
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.role === "admin") return { id: "admin", nome: "Admin", cognome: "", username: "admin", role: "admin" };
  if (row.user_id == null || !row.username || row.attivo === 0) return null;
  return { id: row.user_id, nome: row.nome ?? "", cognome: row.cognome ?? "", username: row.username, role: "user" };
}

// ---------------------------------------------------------------------------
// Forme dei dati restituiti alle pagine
// ---------------------------------------------------------------------------

const USER_COLUMNS =
  "id, nome, cognome, username, email, ruolo, created_at, telefono, bio, note, qualifica, attivo, competenze_json, competenze_flag_json";

function userFromRow(row: Record<string, unknown>) {
  const competenze = parseJsonArray(row.competenze_json);
  const flag = parseJsonArray(row.competenze_flag_json);
  return {
    id: row.id as number,
    nome: row.nome as string,
    cognome: row.cognome as string,
    username: row.username as string,
    email: (row.email as string | null) ?? "",
    telefono: (row.telefono as string | null) ?? "",
    bio: (row.bio as string | null) ?? "",
    note: (row.note as string | null) ?? "",
    qualifica: (row.qualifica as string | null) ?? "",
    attivo: row.attivo !== 0,
    role: "user" as const,
    ruolo: "user" as const,
    competenze,
    competenzeFlag: flag,
    created_at: row.created_at as string,
  };
}

function eventFromRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    code: row.code as string,
    nome: row.nome as string,
    data: row.data as string,
    ora_ritrovo: (row.ora_ritrovo as string | null) ?? "",
    ora_inizio: (row.ora_inizio as string | null) ?? "",
    ora_fine: (row.ora_fine as string | null) ?? "",
    luogo: (row.luogo as string | null) ?? "",
    tipo: (row.tipo as string | null) ?? "",
    tematica: (row.tematica as string | null) ?? "",
    descrizione: (row.descrizione as string | null) ?? "",
    info_operative: (row.info_operative as string | null) ?? "",
    referente_nome: (row.referente_nome as string | null) ?? "",
    referente_telefono: (row.referente_telefono as string | null) ?? "",
    compenso: (row.compenso as string | null) ?? "",
    compenso_visibile: row.compenso_visibile === 1,
    note_admin: (row.note_admin as string | null) ?? "",
    note_finali: (row.note_finali as string | null) ?? "",
    chiuso_da: (row.chiuso_da as string | null) ?? "",
    chiuso_at: (row.chiuso_at as string | null) ?? "",
    stato: row.stato as string,
    motivo_annullamento: (row.motivo_annullamento as string | null) ?? "",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function loadRowFromRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    event_id: row.event_id as number,
    item: row.item as string,
    categoria: (row.categoria as string | null) ?? "",
    codice: (row.codice as string | null) ?? "",
    taglia: (row.taglia as string | null) ?? "",
    quantita: row.quantita as number,
    assigned_user_id: (row.assigned_user_id as number | null) ?? null,
    assigned_name: row.assigned_nome ? `${row.assigned_nome as string} ${row.assigned_cognome as string}` : "",
    present: row.present === 1,
    returned: row.returned === 1,
    damaged: row.damaged === 1,
    prep: row.prep === 1,
    annotazione: (row.annotazione as string | null) ?? "",
    note: (row.note as string | null) ?? "",
    comment: (row.comment as string | null) ?? "",
    updated_by: (row.updated_by as string | null) ?? "",
    updated_at: row.updated_at as string,
  };
}

const EVENT_STATES = ["richiesta", "da_definire", "confermato", "annullato", "chiuso"];
const PARTICIPANT_STATES = ["pending", "available", "unavailable", "confirmed", "rejected"];

// ---------------------------------------------------------------------------
// Notifiche
// ---------------------------------------------------------------------------

async function notifyUser(db: D1Database, userId: number, type: string, message: string, eventId: number | null) {
  // niente doppioni: se c'è già la stessa notifica non letta, non se ne crea un'altra
  const same = await db.prepare("SELECT id FROM notifications WHERE user_id = ? AND message = ? AND is_read = 0 LIMIT 1").bind(userId, message).first();
  if (same) return;
  await db.prepare("INSERT INTO notifications (user_id, for_admin, type, message, event_id) VALUES (?, 0, ?, ?, ?)").bind(userId, type, message, eventId).run();
}
async function notifyAdmin(db: D1Database, type: string, message: string, eventId: number | null) {
  await db.prepare("INSERT INTO notifications (user_id, for_admin, type, message, event_id) VALUES (NULL, 1, ?, ?, ?)").bind(type, message, eventId).run();
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use("/api/*", cors());

app.get("/api/health", async (c) => {
  try {
    await ensureSchema(c.env.DB);
    return c.json({ ok: true, service: "malastranapp-back", database: { ok: true, ...(await schemaStatus(c.env.DB)) } });
  } catch (err) {
    return c.json({ ok: false, service: "malastranapp-back", database: { ok: false, error: err instanceof Error ? err.message : String(err) } }, 500);
  }
});

app.use("/api/*", async (c, next) => {
  try {
    await ensureSchema(c.env.DB);
  } catch (err) {
    console.error("Errore preparazione database", err);
    return fail(c, 500, "Database non disponibile: " + (err instanceof Error ? err.message : String(err)));
  }
  await next();
});

// Tutte le rotte /api/admin/* richiedono l'admin.
app.use("/api/admin/*", async (c, next) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  if (me.role !== "admin") return fail(c, 403, "Accesso amministratore richiesto");
  c.set("me", me);
  await next();
});

// Le rotte /api/my/* e /api/profile* richiedono uno user.
async function requireUser(c: C, next: () => Promise<void>) {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  if (me.role !== "user") return fail(c, 403, "Area riservata agli user");
  c.set("me", me);
  await next();
}
app.use("/api/my/*", requireUser);
app.use("/api/profile", requireUser);
app.use("/api/profile/*", requireUser);

// Le notifiche servono a entrambi.
app.use("/api/notifications", async (c, next) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  c.set("me", me);
  await next();
});
app.use("/api/notifications/*", async (c, next) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  c.set("me", me);
  await next();
});

// La Taverna (chat comune) serve a entrambi.
const tavernaAuth = async (c: C, next: () => Promise<void>) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  c.set("me", me);
  await next();
};
app.use("/api/taverna", tavernaAuth);
app.use("/api/taverna/*", tavernaAuth);

app.onError((err, c) => {
  console.error(err);
  return c.json({ success: false, error: "Errore interno del server: " + (err instanceof Error ? err.message : String(err)) }, 500);
});

// ---------------------------------------------------------------------------
// Accesso
// ---------------------------------------------------------------------------

app.post("/api/login", async (c) => {
  const b = await body<{ username?: string; password?: string }>(c);
  const username = b.username?.trim().toLowerCase() ?? "";
  const password = b.password ?? "";
  if (!username || !password) return fail(c, 400, "Inserisci username e password");

  if (username === "admin") {
    if (!c.env.ADMIN_PASSWORD) return fail(c, 500, "ADMIN_PASSWORD non configurata sul backend");
    if (password !== c.env.ADMIN_PASSWORD) return fail(c, 401, "Credenziali non valide");
    const user: SessionUser = { id: "admin", nome: "Admin", cognome: "", username: "admin", role: "admin" };
    return c.json({ success: true, token: await createSession(c.env.DB, user), user });
  }

  const row = await c.env.DB
    .prepare("SELECT id, nome, cognome, username, password_hash, ruolo, attivo FROM users WHERE lower(username) = ? LIMIT 1")
    .bind(username)
    .first<{ id: number; nome: string; cognome: string; username: string; password_hash: string; ruolo: string; attivo: number }>();
  if (!row || row.ruolo !== "user" || !(await verifyPassword(password, row.password_hash))) return fail(c, 401, "Credenziali non valide");
  if (row.attivo === 0) return fail(c, 403, "Account disattivato: contatta l'admin");
  const user: SessionUser = { id: row.id, nome: row.nome, cognome: row.cognome, username: row.username, role: "user" };
  return c.json({ success: true, token: await createSession(c.env.DB, user), user });
});

app.get("/api/me", async (c) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Sessione non valida o scaduta");
  if (me.role === "admin") return c.json({ success: true, user: me });
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  return c.json({ success: true, user: row ? userFromRow(row) : me });
});

app.post("/api/logout", async (c) => {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(header.slice(7).trim())).run();
  }
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Profilo dello user (solo i propri dati)
// ---------------------------------------------------------------------------

app.get("/api/profile", async (c) => {
  const me = c.get("me");
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  if (!row) return fail(c, 404, "Profilo non trovato");
  return c.json({ success: true, user: userFromRow(row) });
});

// Lo user può modificare: telefono, email, presentazione, competenze.
app.patch("/api/profile", async (c) => {
  const me = c.get("me");
  const b = await body<Record<string, unknown>>(c);
  const current = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  if (!current) return fail(c, 404, "Profilo non trovato");
  const u = userFromRow(current);
  const competenze = b.competenze !== undefined ? tagList(b.competenze) : u.competenze;
  const flag = b.competenzeFlag !== undefined ? tagList(b.competenzeFlag).filter((t) => competenze.includes(t)) : u.competenzeFlag;
  await c.env.DB
    .prepare("UPDATE users SET email = ?, telefono = ?, bio = ?, competenze_json = ?, competenze_flag_json = ? WHERE id = ?")
    .bind(
      b.email !== undefined ? str(b.email, 200) : u.email || null,
      b.telefono !== undefined ? str(b.telefono, 50) : u.telefono || null,
      b.bio !== undefined ? str(b.bio) : u.bio || null,
      JSON.stringify(competenze),
      JSON.stringify(flag),
      me.id,
    )
    .run();
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  return c.json({ success: true, user: userFromRow(row!) });
});

app.post("/api/profile/password", async (c) => {
  const me = c.get("me");
  const b = await body<{ attuale?: string; nuova?: string }>(c);
  const nuova = b.nuova?.trim() ?? "";
  if (nuova.length < 6) return fail(c, 400, "La nuova password deve avere almeno 6 caratteri");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(me.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(b.attuale ?? "", row.password_hash))) return fail(c, 400, "La password attuale non è corretta");
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_visibile = ? WHERE id = ?").bind(await hashPassword(nuova), nuova, me.id).run();
  return c.json({ success: true });
});

// Costumi personali dello user
app.get("/api/profile/costumes", async (c) => {
  const me = c.get("me");
  const rows = await c.env.DB.prepare("SELECT id, nome, categoria, note, created_at FROM user_costumes WHERE user_id = ? ORDER BY nome").bind(me.id).all();
  return c.json({ success: true, costumes: rows.results });
});
app.post("/api/profile/costumes", async (c) => {
  const me = c.get("me");
  const b = await body(c);
  const nome = str(b.nome, 120);
  if (!nome) return fail(c, 400, "Il nome del costume è obbligatorio");
  const r = await c.env.DB.prepare("INSERT INTO user_costumes (user_id, nome, categoria, note) VALUES (?, ?, ?, ?)").bind(me.id, nome, str(b.categoria, 80), str(b.note, 500)).run();
  return c.json({ success: true, id: r.meta.last_row_id }, 201);
});
app.patch("/api/profile/costumes/:cid", async (c) => {
  const me = c.get("me");
  const cid = intParam(c, "cid");
  const b = await body(c);
  const nome = str(b.nome, 120);
  if (!cid || !nome) return fail(c, 400, "Dati non validi");
  const r = await c.env.DB.prepare("UPDATE user_costumes SET nome = ?, categoria = ?, note = ? WHERE id = ? AND user_id = ?").bind(nome, str(b.categoria, 80), str(b.note, 500), cid, me.id).run();
  if (!r.meta.changes) return fail(c, 404, "Costume non trovato");
  return c.json({ success: true });
});
app.delete("/api/profile/costumes/:cid", async (c) => {
  const me = c.get("me");
  const cid = intParam(c, "cid");
  if (!cid) return fail(c, 400, "ID non valido");
  const r = await c.env.DB.prepare("DELETE FROM user_costumes WHERE id = ? AND user_id = ?").bind(cid, me.id).run();
  if (!r.meta.changes) return fail(c, 404, "Costume non trovato");
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Admin: user
// ---------------------------------------------------------------------------

app.get("/api/admin/users", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE ruolo = 'user' ORDER BY cognome, nome`).all();
  const costumes = await c.env.DB.prepare("SELECT user_id, nome FROM user_costumes").all<{ user_id: number; nome: string }>();
  const byUser = new Map<number, string[]>();
  for (const cst of costumes.results) byUser.set(cst.user_id, [...(byUser.get(cst.user_id) ?? []), cst.nome]);
  return c.json({ success: true, users: rows.results.map((r) => ({ ...userFromRow(r), costumi: byUser.get(r.id as number) ?? [] })) });
});

app.post("/api/admin/users", async (c) => {
  const b = await body(c);
  const nome = str(b.nome, 80);
  const cognome = str(b.cognome, 80);
  const password = typeof b.password === "string" ? b.password.trim() : "";
  if (!nome || !cognome) return fail(c, 400, "Nome e cognome sono obbligatori");
  if (password.length < 6) return fail(c, 400, "La password è obbligatoria e deve avere almeno 6 caratteri");
  const custom = typeof b.username === "string" ? b.username.trim() : "";
  if (custom && !/^[A-Za-z0-9._-]{3,40}$/.test(custom)) return fail(c, 400, "Lo username può contenere solo lettere, numeri, punto, trattino e trattino basso (3-40 caratteri, senza spazi)");
  const username = custom || `${normalizePart(nome)}.${normalizePart(cognome)}`;
  if (username.toLowerCase() === "admin") return fail(c, 400, "Lo username 'admin' è riservato");
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE lower(username) = ?").bind(username.toLowerCase()).first();
  if (exists) return fail(c, 409, `Esiste già uno user con username ${username}`);
  const competenze = tagList(b.competenze);
  const flag = tagList(b.competenzeFlag).filter((t) => competenze.includes(t));
  const r = await c.env.DB
    .prepare(
      `INSERT INTO users (nome, cognome, username, email, password_hash, password_visibile, ruolo, telefono, bio, note, qualifica, competenze_json, competenze_flag_json)
       VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(nome, cognome, username, str(b.email, 200), await hashPassword(password), password, str(b.telefono, 50), str(b.bio), str(b.note), str(b.qualifica, 120), JSON.stringify(competenze), JSON.stringify(flag))
    .run();
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json({ success: true, user: userFromRow(row!) }, 201);
});

app.get("/api/admin/users/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND ruolo = 'user'`).bind(id).first();
  if (!row) return fail(c, 404, "User non trovato");
  const costumes = await c.env.DB.prepare("SELECT id, nome, categoria, note FROM user_costumes WHERE user_id = ? ORDER BY nome").bind(id).all();
  const events = await c.env.DB
    .prepare(
      `SELECT e.code, e.nome, e.data, e.stato AS stato_evento, p.stato FROM event_participants p
       JOIN events e ON e.id = p.event_id WHERE p.user_id = ? ORDER BY e.data DESC`,
    )
    .bind(id)
    .all();
  // solo qui (area admin) si restituisce la password leggibile, se è nota
  const pw = await c.env.DB.prepare("SELECT password_visibile FROM users WHERE id = ?").bind(id).first<{ password_visibile: string | null }>();
  return c.json({ success: true, user: userFromRow(row), password: pw?.password_visibile ?? null, costumes: costumes.results, events: events.results });
});

app.patch("/api/admin/users/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  const current = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND ruolo = 'user'`).bind(id).first();
  if (!current) return fail(c, 404, "User non trovato");
  const u = userFromRow(current);
  const b = await body(c);
  const competenze = b.competenze !== undefined ? tagList(b.competenze) : u.competenze;
  const flag = b.competenzeFlag !== undefined ? tagList(b.competenzeFlag).filter((t) => competenze.includes(t)) : u.competenzeFlag;
  await c.env.DB
    .prepare(
      `UPDATE users SET nome = ?, cognome = ?, email = ?, telefono = ?, bio = ?, note = ?, qualifica = ?, attivo = ?,
       competenze_json = ?, competenze_flag_json = ? WHERE id = ?`,
    )
    .bind(
      b.nome !== undefined ? str(b.nome, 80) ?? u.nome : u.nome,
      b.cognome !== undefined ? str(b.cognome, 80) ?? u.cognome : u.cognome,
      b.email !== undefined ? str(b.email, 200) : u.email || null,
      b.telefono !== undefined ? str(b.telefono, 50) : u.telefono || null,
      b.bio !== undefined ? str(b.bio) : u.bio || null,
      b.note !== undefined ? str(b.note) : u.note || null,
      b.qualifica !== undefined ? str(b.qualifica, 120) : u.qualifica || null,
      b.attivo !== undefined ? bool(b.attivo) : u.attivo ? 1 : 0,
      JSON.stringify(competenze),
      JSON.stringify(flag),
      id,
    )
    .run();
  if (b.attivo !== undefined && !bool(b.attivo)) await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first();
  return c.json({ success: true, user: userFromRow(row!) });
});

app.patch("/api/admin/users/:id/password", async (c) => {
  const id = intParam(c, "id");
  const b = await body(c);
  const password = typeof b.password === "string" ? b.password.trim() : "";
  if (!id) return fail(c, 400, "ID non valido");
  if (password.length < 6) return fail(c, 400, "La password deve avere almeno 6 caratteri");
  const r = await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_visibile = ? WHERE id = ? AND ruolo = 'user'").bind(await hashPassword(password), password, id).run();
  if (!r.meta.changes) return fail(c, 404, "User non trovato");
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  return c.json({ success: true });
});

app.delete("/api/admin/users/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  await c.env.DB.prepare("UPDATE load_rows SET assigned_user_id = NULL WHERE assigned_user_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM event_participants WHERE user_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM user_costumes WHERE user_id = ?").bind(id).run();
  const r = await c.env.DB.prepare("DELETE FROM users WHERE id = ? AND ruolo = 'user'").bind(id).run();
  if (!r.meta.changes) return fail(c, 404, "User non trovato");
  return c.json({ success: true });
});

// Costumi di uno user, gestiti dall'admin
app.post("/api/admin/users/:id/costumes", async (c) => {
  const id = intParam(c, "id");
  const b = await body(c);
  const nome = str(b.nome, 120);
  if (!id || !nome) return fail(c, 400, "Il nome del costume è obbligatorio");
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND ruolo = 'user'").bind(id).first();
  if (!exists) return fail(c, 404, "User non trovato");
  const r = await c.env.DB.prepare("INSERT INTO user_costumes (user_id, nome, categoria, note) VALUES (?, ?, ?, ?)").bind(id, nome, str(b.categoria, 80), str(b.note, 500)).run();
  return c.json({ success: true, id: r.meta.last_row_id }, 201);
});
app.delete("/api/admin/users/:id/costumes/:cid", async (c) => {
  const id = intParam(c, "id");
  const cid = intParam(c, "cid");
  if (!id || !cid) return fail(c, 400, "ID non valido");
  const r = await c.env.DB.prepare("DELETE FROM user_costumes WHERE id = ? AND user_id = ?").bind(cid, id).run();
  if (!r.meta.changes) return fail(c, 404, "Costume non trovato");
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Admin: eventi
// ---------------------------------------------------------------------------

const EVENT_FIELDS = [
  "nome", "data", "ora_ritrovo", "ora_inizio", "ora_fine", "luogo", "tipo", "tematica", "descrizione", "info_operative",
  "referente_nome", "referente_telefono", "compenso", "note_admin", "motivo_annullamento", "note_finali",
] as const;

async function eventByCode(db: D1Database, code: string) {
  return db.prepare("SELECT * FROM events WHERE code = ?").bind(code).first();
}

async function newEventCode(db: D1Database, date: string): Promise<string> {
  const base = `MAL-${date.replace(/-/g, "").slice(2, 8)}`;
  const rows = await db.prepare("SELECT code FROM events WHERE code LIKE ?").bind(`${base}-%`).all<{ code: string }>();
  let n = rows.results.length + 1;
  const used = new Set(rows.results.map((r) => r.code));
  while (used.has(`${base}-${String(n).padStart(2, "0")}`)) n += 1;
  return `${base}-${String(n).padStart(2, "0")}`;
}

app.get("/api/admin/events", async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS invitati,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.stato = 'pending') AS in_attesa,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.stato = 'available') AS disponibili,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.stato = 'confirmed') AS confermati,
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id) AS righe_bolla,
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id AND l.damaged = 1) AS danni
       FROM events e ORDER BY e.data, e.ora_inizio`,
    )
    .all();
  return c.json({
    success: true,
    events: rows.results.map((r) => ({
      ...eventFromRow(r),
      conteggi: { invitati: r.invitati, in_attesa: r.in_attesa, disponibili: r.disponibili, confermati: r.confermati, righe_bolla: r.righe_bolla, danni: r.danni },
    })),
  });
});

app.post("/api/admin/events", async (c) => {
  const b = await body(c);
  const nome = str(b.nome, 160);
  const data = str(b.data, 10);
  if (!nome) return fail(c, 400, "Il nome dell'evento è obbligatorio");
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return fail(c, 400, "La data dell'evento è obbligatoria (formato AAAA-MM-GG)");
  const stato = typeof b.stato === "string" && EVENT_STATES.includes(b.stato) ? b.stato : "richiesta";
  const code = await newEventCode(c.env.DB, data);
  const values = EVENT_FIELDS.map((f) => (f === "nome" ? nome : f === "data" ? data : str(b[f])));
  await c.env.DB
    .prepare(`INSERT INTO events (code, ${EVENT_FIELDS.join(", ")}, compenso_visibile, stato) VALUES (?, ${EVENT_FIELDS.map(() => "?").join(", ")}, ?, ?)`)
    .bind(code, ...values, bool(b.compenso_visibile), stato)
    .run();
  const ev = await eventByCode(c.env.DB, code);
  const event = eventFromRow(ev!);
  // inviti immediati
  const ids = Array.isArray(b.user_ids) ? b.user_ids.filter((x): x is number => Number.isInteger(x)) : [];
  for (const uid of ids) await inviteUser(c.env.DB, event.id, event.nome, uid);
  return c.json({ success: true, event }, 201);
});

app.get("/api/admin/events/:code", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const event = eventFromRow(ev);
  const participants = await c.env.DB
    .prepare(
      `SELECT p.*, u.nome, u.cognome, u.username, u.qualifica FROM event_participants p
       JOIN users u ON u.id = p.user_id WHERE p.event_id = ? ORDER BY u.cognome, u.nome`,
    )
    .bind(event.id)
    .all();
  const rows = await c.env.DB
    .prepare(
      `SELECT l.*, u.nome AS assigned_nome, u.cognome AS assigned_cognome FROM load_rows l
       LEFT JOIN users u ON u.id = l.assigned_user_id WHERE l.event_id = ? ORDER BY l.id`,
    )
    .bind(event.id)
    .all();
  return c.json({ success: true, event, participants: participants.results, load_rows: rows.results.map(loadRowFromRow) });
});

app.patch("/api/admin/events/:code", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const event = eventFromRow(ev);
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of EVENT_FIELDS) {
    if (b[f] === undefined) continue;
    const v = str(b[f]);
    if ((f === "nome" || f === "data") && !v) return fail(c, 400, `Il campo ${f} non può essere vuoto`);
    if (f === "data" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail(c, 400, "Data non valida (formato AAAA-MM-GG)");
    sets.push(`${f} = ?`);
    vals.push(v);
  }
  if (b.compenso_visibile !== undefined) {
    sets.push("compenso_visibile = ?");
    vals.push(bool(b.compenso_visibile));
  }
  if (b.stato !== undefined) {
    if (typeof b.stato !== "string" || !EVENT_STATES.includes(b.stato)) return fail(c, 400, "Stato evento non valido");
    sets.push("stato = ?");
    vals.push(b.stato);
    if (b.stato === "chiuso" && event.stato !== "chiuso") sets.push("chiuso_da = 'Admin'", "chiuso_at = datetime('now')");
    if (b.stato !== "chiuso") sets.push("chiuso_da = NULL", "chiuso_at = NULL");
  }
  if (!sets.length) return c.json({ success: true, event });
  sets.push("updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, event.id).run();
  const updated = eventFromRow((await c.env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(event.id).first())!);
  // avvisa gli user coinvolti (non quelli che hanno rifiutato o sono stati esclusi)
  const message =
    b.stato === "annullato" && event.stato !== "annullato"
      ? `L'evento ${updated.nome} del ${updated.data} è stato annullato`
      : `L'evento ${updated.nome} è stato aggiornato`;
  const people = await c.env.DB
    .prepare("SELECT user_id FROM event_participants WHERE event_id = ? AND stato IN ('pending', 'available', 'confirmed')")
    .bind(event.id)
    .all<{ user_id: number }>();
  if (b.notify !== false) for (const p of people.results) await notifyUser(c.env.DB, p.user_id, "evento_modificato", message, event.id);
  return c.json({ success: true, event: updated });
});

app.delete("/api/admin/events/:code", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const id = ev.id as number;
  await c.env.DB.prepare("DELETE FROM notifications WHERE event_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM load_rows WHERE event_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM event_participants WHERE event_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

async function inviteUser(db: D1Database, eventId: number, eventName: string, userId: number, ruolo?: string | null, isTl = false): Promise<boolean> {
  const u = await db.prepare("SELECT id FROM users WHERE id = ? AND ruolo = 'user'").bind(userId).first();
  if (!u) return false;
  const r = await db
    .prepare("INSERT INTO event_participants (event_id, user_id, stato, ruolo_evento, is_tl) VALUES (?, ?, 'pending', ?, ?) ON CONFLICT(event_id, user_id) DO NOTHING")
    .bind(eventId, userId, ruolo ?? null, isTl ? 1 : 0)
    .run();
  if (r.meta.changes)
    await notifyUser(db, userId, "richiesta", `Nuova richiesta di disponibilità per ${eventName}${isTl ? " (come team leader)" : ""}`, eventId);
  return true;
}

app.post("/api/admin/events/:code/participants", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const b = await body(c);
  const ids = Array.isArray(b.user_ids) ? b.user_ids.filter((x): x is number => Number.isInteger(x)) : [];
  if (!ids.length) return fail(c, 400, "Seleziona almeno uno user");
  const tl = new Set(Array.isArray(b.tl_ids) ? b.tl_ids.filter((x): x is number => Number.isInteger(x)) : []);
  for (const uid of ids) await inviteUser(c.env.DB, ev.id as number, ev.nome as string, uid, str(b.ruolo_evento, 120), tl.has(uid));
  return c.json({ success: true });
});

app.patch("/api/admin/events/:code/participants/:userId", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  const userId = intParam(c, "userId");
  if (!ev || !userId) return fail(c, 404, "Evento o user non trovato");
  const current = await c.env.DB.prepare("SELECT * FROM event_participants WHERE event_id = ? AND user_id = ?").bind(ev.id, userId).first<{ stato: string }>();
  if (!current) return fail(c, 404, "Questo user non è coinvolto nell'evento");
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.stato !== undefined) {
    if (typeof b.stato !== "string" || !PARTICIPANT_STATES.includes(b.stato)) return fail(c, 400, "Stato non valido");
    sets.push("stato = ?", "decided_at = datetime('now')");
    vals.push(b.stato);
  }
  if (b.ruolo_evento !== undefined) {
    sets.push("ruolo_evento = ?");
    vals.push(str(b.ruolo_evento, 120));
  }
  if (b.nota_admin !== undefined) {
    sets.push("nota_admin = ?");
    vals.push(str(b.nota_admin, 1000));
  }
  if (b.is_tl !== undefined) {
    sets.push("is_tl = ?");
    vals.push(bool(b.is_tl));
  }
  if (!sets.length) return c.json({ success: true });
  await c.env.DB.prepare(`UPDATE event_participants SET ${sets.join(", ")} WHERE event_id = ? AND user_id = ?`).bind(...vals, ev.id, userId).run();
  if (b.stato === "confirmed" && current.stato !== "confirmed") await notifyUser(c.env.DB, userId, "confermato", `Sei stato confermato per ${ev.nome as string}`, ev.id as number);
  if (b.is_tl !== undefined && bool(b.is_tl) && !(current as { is_tl?: number }).is_tl)
    await notifyUser(c.env.DB, userId, "team_leader", `Sei team leader per ${ev.nome as string}: compilerai tu la bolla di carico`, ev.id as number);
  if (b.stato === "rejected" && current.stato !== "rejected") await notifyUser(c.env.DB, userId, "non_confermato", `Non sei stato selezionato per ${ev.nome as string}`, ev.id as number);
  return c.json({ success: true });
});

app.delete("/api/admin/events/:code/participants/:userId", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  const userId = intParam(c, "userId");
  if (!ev || !userId) return fail(c, 404, "Evento o user non trovato");
  await c.env.DB.prepare("DELETE FROM event_participants WHERE event_id = ? AND user_id = ?").bind(ev.id, userId).run();
  await c.env.DB.prepare("UPDATE load_rows SET assigned_user_id = NULL WHERE event_id = ? AND assigned_user_id = ?").bind(ev.id, userId).run();
  return c.json({ success: true });
});

// Bolla di carico (admin)
function loadRowValues(b: Record<string, unknown>) {
  const qty = Number(b.quantita);
  return {
    item: str(b.item, 160),
    categoria: str(b.categoria, 60),
    codice: str(b.codice, 60),
    taglia: str(b.taglia, 30),
    note: str(b.note, 300),
    prep: bool(b.prep),
    quantita: Number.isInteger(qty) && qty > 0 ? qty : 1,
    assigned: Number.isInteger(b.assigned_user_id) ? (b.assigned_user_id as number) : null,
  };
}

/** Inserisce molte righe con poche richieste al database (10 righe per istruzione). */
export async function insertLoadRows(db: D1Database, eventId: number, rows: ReturnType<typeof loadRowValues>[]) {
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    const sql = `INSERT INTO load_rows (event_id, item, categoria, codice, taglia, note, prep, quantita, assigned_user_id) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`;
    stmts.push(db.prepare(sql).bind(...chunk.flatMap((v) => [eventId, v.item, v.categoria, v.codice, v.taglia, v.note, v.prep, v.quantita, v.assigned])));
  }
  if (stmts.length) await db.batch(stmts);
}

app.post("/api/admin/events/:code/load-rows/assign", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const b = await body(c);
  const uid = Number.isInteger(b.assigned_user_id) ? (b.assigned_user_id as number) : null;
  const cat = typeof b.categoria === "string" ? b.categoria : "";
  const r = await c.env.DB
    .prepare("UPDATE load_rows SET assigned_user_id = ?, updated_by = 'admin', updated_at = datetime('now') WHERE event_id = ? AND IFNULL(categoria, '') = ?")
    .bind(uid, ev.id, cat)
    .run();
  if (uid) await notifyUser(c.env.DB, uid, "bolla", `Bolla di carico aggiornata per ${ev.nome as string}`, ev.id as number);
  return c.json({ success: true, changed: r.meta.changes });
});

app.post("/api/admin/events/:code/load-rows", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  if (ev.stato === "chiuso") return fail(c, 409, "Evento chiuso: sulla bolla puoi solo aggiungere annotazioni");
  const b = await body(c);
  const list = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]) : [b];
  const valid = list.slice(0, 500).map(loadRowValues).filter((v) => v.item);
  if (!valid.length) return fail(c, 400, "Nessuna riga valida: serve almeno il nome dell'oggetto");
  await insertLoadRows(c.env.DB, ev.id as number, valid);
  const added = valid.length;
  const assigned = [...new Set(valid.map((v) => v.assigned).filter((x): x is number => x !== null))];
  for (const uid of assigned) await notifyUser(c.env.DB, uid, "bolla", `Bolla di carico aggiornata per ${ev.nome as string}`, ev.id as number);
  if (!added) return fail(c, 400, "Nessuna riga valida: serve almeno il nome dell'oggetto");
  return c.json({ success: true, added }, 201);
});

app.patch("/api/admin/load-rows/:rid", async (c) => {
  const rid = intParam(c, "rid");
  if (!rid) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare("SELECT l.*, e.nome AS event_nome, e.stato AS event_stato FROM load_rows l JOIN events e ON e.id = l.event_id WHERE l.id = ?").bind(rid).first();
  if (!row) return fail(c, 404, "Riga non trovata");
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.annotazione !== undefined) {
    sets.push("annotazione = ?");
    vals.push(str(b.annotazione, 1000));
  }
  if (row.event_stato === "chiuso") {
    const other = Object.keys(b).filter((k) => k !== "annotazione");
    if (other.length) return fail(c, 409, "Evento chiuso: sulla bolla puoi solo aggiungere annotazioni");
    if (sets.length) await c.env.DB.prepare(`UPDATE load_rows SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, rid).run();
    return c.json({ success: true });
  }
  for (const f of ["item", "categoria", "codice", "taglia", "comment", "note"] as const) {
    if (b[f] === undefined) continue;
    const v = str(b[f], f === "comment" ? 1000 : f === "note" ? 300 : 160);
    if (f === "item" && !v) return fail(c, 400, "Il nome dell'oggetto non può essere vuoto");
    sets.push(`${f} = ?`);
    vals.push(v);
  }
  if (b.quantita !== undefined) {
    const q = Number(b.quantita);
    sets.push("quantita = ?");
    vals.push(Number.isInteger(q) && q > 0 ? q : 1);
  }
  for (const f of ["prep", "present", "returned", "damaged"] as const) {
    if (b[f] === undefined) continue;
    sets.push(`${f} = ?`);
    vals.push(bool(b[f]));
  }
  let newAssignee: number | null = null;
  if (b.assigned_user_id !== undefined) {
    newAssignee = Number.isInteger(b.assigned_user_id) ? (b.assigned_user_id as number) : null;
    sets.push("assigned_user_id = ?");
    vals.push(newAssignee);
  }
  if (!sets.length) return c.json({ success: true });
  sets.push("updated_by = 'admin'", "updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE load_rows SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, rid).run();
  if (newAssignee && newAssignee !== row.assigned_user_id) await notifyUser(c.env.DB, newAssignee, "bolla", `Bolla di carico aggiornata per ${row.event_nome as string}`, row.event_id as number);
  return c.json({ success: true });
});

app.delete("/api/admin/load-rows/:rid", async (c) => {
  const rid = intParam(c, "rid");
  if (!rid) return fail(c, 400, "ID non valido");
  const st = await c.env.DB.prepare("SELECT e.stato FROM load_rows l JOIN events e ON e.id = l.event_id WHERE l.id = ?").bind(rid).first<{ stato: string }>();
  if (st?.stato === "chiuso") return fail(c, 409, "Evento chiuso: la bolla non si può più modificare");
  await c.env.DB.prepare("DELETE FROM load_rows WHERE id = ?").bind(rid).run();
  return c.json({ success: true });
});

// Chiusura evento (admin o team leader). Dopo la chiusura modifica solo l'admin, fino all'archiviazione.
async function closeEvent(db: D1Database, eventId: number, by: string) {
  await db
    .prepare("UPDATE events SET stato = 'chiuso', chiuso_da = ?, chiuso_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .bind(by, eventId)
    .run();
}

app.post("/api/admin/events/:code/chiudi", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  if (ev.stato === "chiuso") return fail(c, 409, "L'evento è già chiuso");
  await closeEvent(c.env.DB, ev.id as number, "Admin");
  return c.json({ success: true });
});

app.post("/api/admin/events/:code/riapri", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  await c.env.DB.prepare("UPDATE events SET stato = 'confermato', chiuso_da = NULL, chiuso_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(ev.id).run();
  return c.json({ success: true });
});

app.post("/api/my/events/:code/chiudi", async (c) => {
  const me = c.get("me");
  const row = await myParticipation(c, c.req.param("code"));
  if (!row) return fail(c, 404, "Evento non trovato o non sei coinvolto");
  if (row.is_tl !== 1 || row.mio_stato === "unavailable" || row.mio_stato === "rejected") return fail(c, 403, "Solo il team leader può chiudere l'evento");
  if (row.stato === "chiuso") return fail(c, 409, "L'evento è già chiuso");
  if (row.stato === "annullato") return fail(c, 409, "L'evento è annullato");
  const who = `${me.nome} ${me.cognome}`.trim();
  await closeEvent(c.env.DB, row.id as number, `${who} (team leader)`);
  await notifyAdmin(c.env.DB, "chiuso", `${who} ha chiuso l'evento ${row.nome as string}`, row.id as number);
  return c.json({ success: true });
});

// Report: note per evento
app.get("/api/admin/report", async (c) => {
  const code = c.req.query("event");
  const onlyIssues = c.req.query("solo_problemi") === "1";
  const where: string[] = [];
  const vals: unknown[] = [];
  if (code) {
    where.push("e.code = ?");
    vals.push(code);
  }
  if (onlyIssues) where.push("(l.damaged = 1 OR (l.comment IS NOT NULL AND l.comment != '') OR (l.present = 1 AND l.returned = 0))");
  const rows = await c.env.DB
    .prepare(
      `SELECT l.*, e.code AS event_code, e.nome AS event_nome, e.data AS event_data, u.nome AS assigned_nome, u.cognome AS assigned_cognome
       FROM load_rows l JOIN events e ON e.id = l.event_id LEFT JOIN users u ON u.id = l.assigned_user_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.data DESC, l.id`,
    )
    .bind(...vals)
    .all();
  return c.json({
    success: true,
    rows: rows.results.map((r) => ({ ...loadRowFromRow(r), event_code: r.event_code, event_nome: r.event_nome, event_data: r.event_data })),
  });
});

// ---------------------------------------------------------------------------
// User: i miei eventi
// ---------------------------------------------------------------------------

function eventForUser(row: Record<string, unknown>, myStato: string) {
  const e = eventFromRow(row);
  const showFee = e.compenso_visibile && myStato === "confirmed";
  return {
    id: e.id, code: e.code, nome: e.nome, data: e.data, ora_ritrovo: e.ora_ritrovo, ora_inizio: e.ora_inizio, ora_fine: e.ora_fine,
    luogo: e.luogo, tipo: e.tipo, tematica: e.tematica, descrizione: e.descrizione, stato: e.stato, motivo_annullamento: e.motivo_annullamento,
    // informazioni operative e referente solo a chi è confermato
    info_operative: myStato === "confirmed" ? e.info_operative : "",
    referente_nome: myStato === "confirmed" ? e.referente_nome : "",
    referente_telefono: myStato === "confirmed" ? e.referente_telefono : "",
    compenso: showFee ? e.compenso : "",
  };
}

app.get("/api/my/events", async (c) => {
  const me = c.get("me");
  const rows = await c.env.DB
    .prepare(
      `SELECT e.*, p.stato AS mio_stato, p.ruolo_evento, p.is_tl,
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id AND l.assigned_user_id = ?) AS mie_righe
       FROM event_participants p JOIN events e ON e.id = p.event_id WHERE p.user_id = ? ORDER BY e.data, e.ora_inizio`,
    )
    .bind(me.id, me.id)
    .all();
  return c.json({
    success: true,
    events: rows.results.map((r) => ({ ...eventForUser(r, r.mio_stato as string), mio_stato: r.mio_stato, ruolo_evento: r.ruolo_evento ?? "", mie_righe_bolla: r.mie_righe, is_tl: r.is_tl === 1 })),
  });
});

async function myParticipation(c: C, code: string) {
  const me = c.get("me");
  return c.env.DB
    .prepare(
      `SELECT e.*, p.stato AS mio_stato, p.ruolo_evento, p.nota_user, p.nota_admin, p.is_tl FROM events e
       JOIN event_participants p ON p.event_id = e.id WHERE e.code = ? AND p.user_id = ?`,
    )
    .bind(code, me.id)
    .first();
}

app.get("/api/my/events/:code", async (c) => {
  const me = c.get("me");
  const row = await myParticipation(c, c.req.param("code"));
  if (!row) return fail(c, 404, "Evento non trovato o non sei coinvolto");
  const stato = row.mio_stato as string;
  const team =
    stato === "confirmed"
      ? (
          await c.env.DB
            .prepare("SELECT u.nome, u.cognome, p.ruolo_evento FROM event_participants p JOIN users u ON u.id = p.user_id WHERE p.event_id = ? AND p.stato = 'confirmed' ORDER BY u.cognome")
            .bind(row.id)
            .all()
        ).results
      : [];
  // il team leader vede e compila tutta la bolla; gli altri vedono solo cosa portano loro
  const isTl = row.is_tl === 1 && stato !== "unavailable" && stato !== "rejected";
  const rows = isTl
    ? await c.env.DB
        .prepare("SELECT l.*, u.nome AS assigned_nome, u.cognome AS assigned_cognome FROM load_rows l LEFT JOIN users u ON u.id = l.assigned_user_id WHERE l.event_id = ? ORDER BY l.id")
        .bind(row.id)
        .all()
    : await c.env.DB.prepare("SELECT * FROM load_rows WHERE event_id = ? AND assigned_user_id = ? ORDER BY id").bind(row.id, me.id).all();
  return c.json({
    success: true,
    event: eventForUser(row, stato),
    partecipazione: { stato, ruolo_evento: row.ruolo_evento ?? "", nota_user: row.nota_user ?? "", nota_admin: row.nota_admin ?? "", is_tl: isTl },
    team,
    load_rows: rows.results.map(loadRowFromRow),
  });
});

app.post("/api/my/events/:code/availability", async (c) => {
  const me = c.get("me");
  const row = await myParticipation(c, c.req.param("code"));
  if (!row) return fail(c, 404, "Evento non trovato o non sei coinvolto");
  const b = await body(c);
  const stato = b.stato;
  if (stato !== "available" && stato !== "unavailable") return fail(c, 400, "Risposta non valida");
  if (row.mio_stato === "confirmed" || row.mio_stato === "rejected") return fail(c, 409, "L'admin ha già deciso: per cambiare contatta l'ufficio");
  if (row.stato === "annullato" || row.stato === "chiuso") return fail(c, 409, "L'evento non accetta più risposte");
  await c.env.DB
    .prepare("UPDATE event_participants SET stato = ?, nota_user = ?, responded_at = datetime('now') WHERE event_id = ? AND user_id = ?")
    .bind(stato, str(b.nota, 1000), row.id, me.id)
    .run();
  const who = `${me.nome} ${me.cognome}`.trim();
  await notifyAdmin(
    c.env.DB,
    "risposta",
    stato === "available" ? `${who} ha dato disponibilità per ${row.nome as string}` : `${who} non è disponibile per ${row.nome as string}`,
    row.id as number,
  );
  return c.json({ success: true });
});

app.patch("/api/my/load-rows/:rid", async (c) => {
  const me = c.get("me");
  const rid = intParam(c, "rid");
  if (!rid) return fail(c, 400, "ID non valido");
  const row = await c.env.DB
    .prepare(
      `SELECT l.*, e.nome AS event_nome, e.stato AS event_stato, p.stato AS mio_stato, p.is_tl FROM load_rows l
       JOIN events e ON e.id = l.event_id
       LEFT JOIN event_participants p ON p.event_id = l.event_id AND p.user_id = ?
       WHERE l.id = ?`,
    )
    .bind(me.id, rid)
    .first();
  if (!row) return fail(c, 404, "Riga non trovata");
  if (row.is_tl !== 1 || row.mio_stato === "unavailable" || row.mio_stato === "rejected") return fail(c, 403, "La bolla la compila solo il team leader dell'evento");
  if (row.event_stato === "chiuso" || row.event_stato === "annullato") return fail(c, 409, "Evento chiuso: la bolla ora la può annotare solo l'admin");
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of ["present", "returned", "damaged"] as const) {
    if (b[f] === undefined) continue;
    sets.push(`${f} = ?`);
    vals.push(bool(b[f]));
  }
  if (b.comment !== undefined) {
    sets.push("comment = ?");
    vals.push(str(b.comment, 1000));
  }
  if (!sets.length) return c.json({ success: true });
  sets.push("updated_by = ?", "updated_at = datetime('now')");
  vals.push(`${me.nome} ${me.cognome}`.trim());
  await c.env.DB.prepare(`UPDATE load_rows SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, rid).run();
  if (b.damaged !== undefined && bool(b.damaged) && row.damaged !== 1) {
    await notifyAdmin(c.env.DB, "danno", `${me.nome} ${me.cognome} ha segnalato un danno: ${row.item as string} (${row.event_nome as string})`, row.event_id as number);
  }
  const updated = await c.env.DB.prepare("SELECT * FROM load_rows WHERE id = ?").bind(rid).first();
  return c.json({ success: true, row: loadRowFromRow(updated!) });
});

// ---------------------------------------------------------------------------
// Notifiche (admin e user)
// ---------------------------------------------------------------------------

function notificationScope(me: SessionUser): [string, unknown[]] {
  return me.role === "admin" ? ["for_admin = 1", []] : ["user_id = ?", [me.id]];
}

// ---------------------------------------------------------------------------
// Taverna: un'unica chat per tutti (user e admin). Ogni messaggio sparisce dopo 24 ore.
// ---------------------------------------------------------------------------

const TAVERNA_MAX = 600;

async function cleanTaverna(db: D1Database) {
  await db.prepare("DELETE FROM chat_messages WHERE created_at < datetime('now', '-24 hours')").run();
}

app.get("/api/taverna", async (c) => {
  await cleanTaverna(c.env.DB);
  // gli ultimi 300 messaggi delle ultime 24 ore, dal più vecchio al più nuovo
  const rows = await c.env.DB
    .prepare(
      `SELECT id, author_role, user_id, author_name, testo, created_at FROM chat_messages
       WHERE created_at >= datetime('now', '-24 hours') ORDER BY id DESC LIMIT 300`,
    )
    .all();
  const me = c.get("me");
  return c.json({ success: true, me_name: tavernaName(me), messages: rows.results.reverse() });
});

function tavernaName(me: SessionUser) {
  return me.role === "admin" ? "Admin" : `${me.nome} ${me.cognome}`.trim() || me.username;
}

// chi si può taggare con @: tutti gli user attivi più l'Admin
async function tavernaPeople(db: D1Database) {
  const rows = await db
    .prepare("SELECT id, nome, cognome, username FROM users WHERE ruolo = 'user' AND attivo = 1 ORDER BY nome, cognome")
    .all<{ id: number; nome: string; cognome: string; username: string }>();
  const people = rows.results.map((u) => ({ id: u.id as number | null, role: "user", name: `${u.nome} ${u.cognome}`.trim() || u.username }));
  return [{ id: null as number | null, role: "admin", name: "Admin" }, ...people];
}

app.get("/api/taverna/persone", async (c) => {
  return c.json({ success: true, people: await tavernaPeople(c.env.DB) });
});

app.post("/api/taverna", async (c) => {
  const me = c.get("me");
  const b = await body(c);
  const raw = typeof b.testo === "string" ? b.testo.trim() : "";
  if (!raw) return fail(c, 400, "Il messaggio è vuoto");
  if (raw.length > TAVERNA_MAX) return fail(c, 400, `Massimo ${TAVERNA_MAX} caratteri`);
  const testo = raw;
  const name = tavernaName(me);
  const r = await c.env.DB
    .prepare("INSERT INTO chat_messages (author_role, user_id, author_name, testo) VALUES (?, ?, ?, ?)")
    .bind(me.role, me.role === "user" ? me.id : null, name, testo)
    .run();
  // chi è stato taggato con @Nome riceve una notifica
  if (testo.includes("@")) {
    const low = testo.toLowerCase();
    const snippet = testo.length > 80 ? testo.slice(0, 80) + "…" : testo;
    const msg = `${name} ti ha taggato nella Taverna: «${snippet}»`;
    for (const p of await tavernaPeople(c.env.DB)) {
      if (!low.includes("@" + p.name.toLowerCase())) continue;
      if (p.role === "admin") {
        if (me.role !== "admin") await notifyAdmin(c.env.DB, "taverna", msg, null);
      } else if (p.id !== null && !(me.role === "user" && me.id === p.id)) {
        await notifyUser(c.env.DB, p.id, "taverna", msg, null);
      }
    }
  }
  await cleanTaverna(c.env.DB);
  return c.json({ success: true, id: r.meta.last_row_id });
});

app.get("/api/notifications", async (c) => {
  const me = c.get("me");
  const [where, vals] = notificationScope(me);
  const rows = await c.env.DB
    .prepare(
      `SELECT n.id, n.type, n.message, n.is_read, n.created_at, e.code AS event_code FROM notifications n
       LEFT JOIN events e ON e.id = n.event_id WHERE ${where} ORDER BY n.created_at DESC, n.id DESC LIMIT 100`,
    )
    .bind(...vals)
    .all();
  const unread = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${where} AND is_read = 0`).bind(...vals).first<{ n: number }>();
  return c.json({
    success: true,
    unread: unread?.n ?? 0,
    notifications: rows.results.map((r) => ({ ...r, is_read: r.is_read === 1 })),
  });
});

app.post("/api/notifications/read-all", async (c) => {
  const me = c.get("me");
  const [where, vals] = notificationScope(me);
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE ${where}`).bind(...vals).run();
  return c.json({ success: true });
});

app.post("/api/notifications/:nid/read", async (c) => {
  const me = c.get("me");
  const nid = intParam(c, "nid");
  if (!nid) return fail(c, 400, "ID non valido");
  const [where, vals] = notificationScope(me);
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND ${where}`).bind(nid, ...vals).run();
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Resoconto evento e archivio
// ---------------------------------------------------------------------------

const PART_LABEL: Record<string, string> = {
  pending: "nessuna risposta",
  available: "disponibile (non confermato)",
  unavailable: "non disponibile",
  confirmed: "confermato",
  rejected: "non selezionato",
};

async function buildResoconto(db: D1Database, eventId: number) {
  const ev = await db.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first();
  if (!ev) return null;
  const event = eventFromRow(ev);
  const people = (
    await db
      .prepare(
        `SELECT p.stato, p.ruolo_evento, p.nota_user, p.responded_at, p.is_tl, u.nome, u.cognome FROM event_participants p
         JOIN users u ON u.id = p.user_id WHERE p.event_id = ? ORDER BY u.cognome, u.nome`,
      )
      .bind(eventId)
      .all<{ stato: string; ruolo_evento: string | null; nota_user: string | null; responded_at: string | null; is_tl: number; nome: string; cognome: string }>()
  ).results;
  const rows = (
    await db
      .prepare(
        `SELECT l.*, u.nome AS assigned_nome, u.cognome AS assigned_cognome FROM load_rows l
         LEFT JOIN users u ON u.id = l.assigned_user_id WHERE l.event_id = ? ORDER BY l.id`,
      )
      .bind(eventId)
      .all()
  ).results.map(loadRowFromRow);

  const count = (s: string) => people.filter((p) => p.stato === s).length;
  const summary = {
    persone: {
      invitati: people.length,
      confermati: count("confirmed"),
      disponibili_non_confermati: count("available"),
      non_disponibili: count("unavailable"),
      senza_risposta: count("pending"),
      non_selezionati: count("rejected"),
    },
    bolla: {
      oggetti: rows.length,
      presenti: rows.filter((r) => r.present).length,
      rientrati: rows.filter((r) => r.returned).length,
      danneggiati: rows.filter((r) => r.damaged).length,
      mai_segnati_presenti: rows.filter((r) => !r.present).length,
      non_rientrati: rows.filter((r) => r.present && !r.returned).length,
    },
  };
  const problemi = rows.filter((r) => r.damaged || r.comment || r.annotazione || (r.present && !r.returned));

  const L: string[] = [];
  const line = (s = "") => L.push(s);
  line("========================================================");
  line(`EVENTO ${event.code} — ${event.nome}`);
  line("========================================================");
  line(`Data: ${event.data}   Orario: ${[event.ora_inizio, event.ora_fine].filter(Boolean).join("-") || "-"}   Ritrovo: ${event.ora_ritrovo || "-"}`);
  line(`Luogo: ${event.luogo || "-"}   Tipo: ${event.tipo || "-"}   Tematica: ${event.tematica || "-"}   Stato: ${event.stato}`);
  if (event.referente_nome) line(`Referente: ${event.referente_nome} ${event.referente_telefono}`);
  if (event.compenso) line(`Compenso: ${event.compenso}`);
  if (event.descrizione) line(`Descrizione: ${event.descrizione}`);
  if (event.info_operative) line(`Info operative: ${event.info_operative}`);
  if (event.note_admin) line(`Note interne: ${event.note_admin}`);
  if (event.motivo_annullamento) line(`Motivo annullamento: ${event.motivo_annullamento}`);
  line();
  if (event.chiuso_at) line(`Evento chiuso da ${event.chiuso_da || "-"} il ${event.chiuso_at}`);
  line(`COME È ANDATA (note finali): ${event.note_finali || "-"}`);
  line();
  const sp = summary.persone;
  line(`PERSONE — invitati ${sp.invitati}, confermati ${sp.confermati}, disponibili non confermati ${sp.disponibili_non_confermati}, non disponibili ${sp.non_disponibili}, senza risposta ${sp.senza_risposta}`);
  for (const p of people) {
    line(`  - ${p.nome} ${p.cognome}${p.is_tl ? " (TEAM LEADER)" : ""}: ${PART_LABEL[p.stato] ?? p.stato}${p.ruolo_evento ? ` [${p.ruolo_evento}]` : ""}${p.nota_user ? ` — nota: "${p.nota_user}"` : ""}`);
  }
  line();
  const sb = summary.bolla;
  line(`BOLLA DI CARICO — voci ${sb.oggetti}, entrate ${sb.presenti}, uscite ${sb.rientrati}, danneggiate ${sb.danneggiati}, entrate ma non uscite ${sb.non_rientrati}`);
  for (const r of rows) {
    const flags = [r.prep ? "prep" : "NO prep", r.present ? "entrata" : "NO entrata", r.returned ? "uscita" : "NO uscita", r.damaged ? "DANNEGGIATO" : ""].filter(Boolean).join(", ");
    line(`  - [${r.categoria || "-"}] ${r.quantita > 1 ? `${r.quantita}x ` : ""}${r.item}${r.codice ? ` (${r.codice})` : ""}${r.taglia ? ` tg ${r.taglia}` : ""}${r.note ? ` {${r.note}}` : ""}: ${flags}${r.comment ? ` — "${r.comment}"` : ""}${r.annotazione ? ` — ANNOTAZIONE ADMIN: ${r.annotazione}` : ""}`);
  }
  line();
  return { event, summary, people, problemi, testo: L.join("\n") };
}

app.get("/api/admin/events/:code/resoconto", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const r = await buildResoconto(c.env.DB, ev.id as number);
  if (!r) return fail(c, 404, "Evento non trovato");
  const archiveDate = new Date(new Date(`${r.event.data}T12:00:00Z`).getTime() + ARCHIVE_AFTER_DAYS * 86400000).toISOString().slice(0, 10);
  return c.json({ success: true, ...r, archivia_il: archiveDate });
});

const ARCHIVE_AFTER_DAYS = 30;

async function archiveEvent(db: D1Database, eventId: number): Promise<boolean> {
  const r = await buildResoconto(db, eventId);
  if (!r) return false;
  await db.prepare("INSERT INTO event_archives (code, nome, data, testo) VALUES (?, ?, ?, ?)").bind(r.event.code, r.event.nome, r.event.data, r.testo).run();
  await db.prepare("DELETE FROM notifications WHERE event_id = ?").bind(eventId).run();
  await db.prepare("DELETE FROM load_rows WHERE event_id = ?").bind(eventId).run();
  await db.prepare("DELETE FROM event_participants WHERE event_id = ?").bind(eventId).run();
  await db.prepare("DELETE FROM events WHERE id = ?").bind(eventId).run();
  return true;
}

/** Archivia gli eventi finiti da più di 30 giorni (lanciato ogni notte da Cloudflare). */
async function archiveOldEvents(db: D1Database): Promise<number> {
  await ensureSchema(db);
  const old = await db
    .prepare("SELECT id FROM events WHERE data <= date('now', ?)")
    .bind(`-${ARCHIVE_AFTER_DAYS} days`)
    .all<{ id: number }>();
  let n = 0;
  for (const e of old.results.slice(0, 3)) if (await archiveEvent(db, e.id)) n += 1; // poche per notte: limite richieste Cloudflare
  return n;
}

app.post("/api/admin/events/:code/archivia", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  await archiveEvent(c.env.DB, ev.id as number);
  return c.json({ success: true });
});

app.get("/api/admin/archive", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id, code, nome, data, archived_at FROM event_archives ORDER BY data DESC, id DESC").all();
  return c.json({ success: true, archives: rows.results });
});

app.get("/api/admin/archive/all", async (c) => {
  const rows = await c.env.DB.prepare("SELECT testo FROM event_archives ORDER BY data, id").all<{ testo: string }>();
  const head = `ARCHIVIO EVENTI MALASTRANA — generato il ${new Date().toISOString().slice(0, 10)} — ${rows.results.length} eventi\n\n`;
  return c.json({ success: true, testo: head + rows.results.map((r) => r.testo).join("\n") });
});

app.get("/api/admin/archive/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare("SELECT * FROM event_archives WHERE id = ?").bind(id).first();
  if (!row) return fail(c, 404, "Archivio non trovato");
  return c.json({ success: true, archive: row });
});

app.all("/api/*", (c) => fail(c, 404, "Indirizzo API inesistente"));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      archiveOldEvents(env.DB).then(
        (n) => console.log(`Archiviati ${n} eventi`),
        (err) => console.error("Archiviazione fallita", err),
      ),
    );
    // pulizia notturna della Taverna (i messaggi durano 24 ore)
    ctx.waitUntil(cleanTaverna(env.DB).catch(() => undefined));
  },
};
