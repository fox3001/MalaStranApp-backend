// MalaStranApp – backend (Cloudflare Worker + Hono + D1)
//
// Regole principali:
// - c'è un solo admin (password nella variabile ADMIN_PASSWORD);
// - gli user li crea solo l'admin, che sceglie username e password;
// - ogni controllo dei permessi avviene qui nel backend, non solo nelle pagine.

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { ensureSchema, schemaStatus, siglaDaNome } from "./schema";

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
    sigla: (row.sigla as string | null) ?? "",
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
    lost: row.lost === 1,
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

// ---------------------------------------------------------------------------
// Registro attività: dopo ogni modifica riuscita si annota chi ha fatto cosa (finisce nel report del mese).
// ---------------------------------------------------------------------------

const FIELD_LABEL: Record<string, string> = {
  nome: "nome", cognome: "cognome", email: "email", telefono: "telefono", bio: "presentazione", note: "note interne", qualifica: "qualifica",
  competenze: "competenze", competenzeFlag: "competenze principali", attivo: "stato account", data: "data", ora_ritrovo: "ritrovo", ora_inizio: "inizio",
  ora_fine: "fine", luogo: "luogo", tipo: "tipo", tematica: "tematica", sigla: "sigla", descrizione: "descrizione", info_operative: "info operative",
  referente_nome: "referente", referente_telefono: "telefono referente", compenso: "compenso", compenso_visibile: "compenso visibile", note_admin: "note interne",
  note_finali: "note finali", stato: "stato", motivo_annullamento: "motivo annullamento",
};
const STATO_LABEL: Record<string, string> = { pending: "in attesa", available: "disponibile", unavailable: "non disponibile", confirmed: "confermato", rejected: "non selezionato" };
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function logAct(db: D1Database, testo: string) {
  await db.prepare("INSERT INTO attivita_log (testo) VALUES (?)").bind(testo).run();
}
async function userName(db: D1Database, id: unknown) {
  const u = await db.prepare("SELECT nome, cognome, username FROM users WHERE id = ?").bind(Number(id)).first<{ nome: string; cognome: string; username: string }>();
  return u ? `${u.nome} ${u.cognome}`.trim() || u.username : `user n. ${String(id)}`;
}
async function eventName(db: D1Database, code: string) {
  const e = await db.prepare("SELECT nome, data FROM events WHERE code = ?").bind(code).first<{ nome: string; data: string }>();
  return e ? `«${e.nome}» del ${dmy(e.data)}` : `evento ${code}`;
}
const campi = (b: Record<string, unknown>) =>
  Object.keys(b)
    .map((k) => FIELD_LABEL[k])
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");

app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "OPTIONS") return next();
  const path = c.req.path;
  // per ciò che viene cancellato, il nome si legge prima
  let before = "";
  try {
    let m: RegExpExecArray | null;
    if (method === "DELETE" && (m = /^\/api\/admin\/users\/(\d+)$/.exec(path))) before = await userName(c.env.DB, m[1]);
    else if (method === "DELETE" && (m = /^\/api\/admin\/events\/([^/]+)$/.exec(path))) before = await eventName(c.env.DB, decodeURIComponent(m[1]!));
    else if (method === "DELETE" && (m = /^\/api\/admin\/events\/([^/]+)\/participants\/(\d+)$/.exec(path)))
      before = `${await userName(c.env.DB, m[2])} da ${await eventName(c.env.DB, decodeURIComponent(m[1]!))}`;
  } catch {
    /* il registro non deve mai bloccare l'app */
  }
  await next();
  if (c.res.status >= 400) return;
  try {
    const db = c.env.DB;
    const me = c.get("me") as SessionUser | undefined;
    const who = me ? (me.role === "admin" ? "Admin" : `${me.nome} ${me.cognome}`.trim()) : "";
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    let m: RegExpExecArray | null;
    let t = "";
    if (method === "POST" && path === "/api/admin/users") t = `Admin ha creato lo user ${String(b.nome ?? "")} ${String(b.cognome ?? "")}`;
    else if (method === "PATCH" && (m = /^\/api\/admin\/users\/(\d+)$/.exec(path))) {
      const n = await userName(db, m[1]);
      if (b.attivo !== undefined && Object.keys(b).length === 1) t = `Admin ha ${b.attivo ? "riattivato" : "disattivato"} l'account di ${n}`;
      else t = `Admin ha modificato la scheda di ${n}${campi(b) ? ` (${campi(b)})` : ""}`;
    } else if (method === "PATCH" && (m = /^\/api\/admin\/users\/(\d+)\/password$/.exec(path))) t = `Admin ha impostato una nuova password per ${await userName(db, m[1])}`;
    else if (method === "DELETE" && /^\/api\/admin\/users\/\d+$/.test(path)) t = `Admin ha eliminato lo user ${before}`;
    else if (method === "PATCH" && path === "/api/profile") t = `${who} ha modificato la sua scheda${campi(b) ? ` (${campi(b)})` : ""}`;
    else if (method === "POST" && path === "/api/profile/password") t = `${who} ha cambiato la sua password`;
    else if (method === "POST" && path === "/api/profile/assenze/giorno") {
      const r = (await c.res.clone().json().catch(() => ({}))) as { away?: boolean };
      t = `${who} ha ${r.away ? "segnato che NON c'è" : "tolto il segno di assenza"} il ${dmy(String(b.data ?? ""))}`;
    } else if (method === "POST" && path === "/api/profile/assenze") t = `${who} ha segnato che non c'è dal ${dmy(String(b.dal ?? ""))} al ${dmy(String(b.al || b.dal || ""))}`;
    else if (method === "DELETE" && /^\/api\/profile\/assenze\/\d+$/.test(path)) t = `${who} ha tolto un periodo in cui non c'era`;
    else if (method === "POST" && path === "/api/admin/events") t = `Admin ha creato l'evento «${String(b.nome ?? "")}» del ${dmy(String(b.data ?? ""))}`;
    else if (method === "PATCH" && (m = /^\/api\/admin\/events\/([^/]+)$/.exec(path)))
      t = `Admin ha modificato l'evento ${await eventName(db, decodeURIComponent(m[1]!))}${campi(b) ? ` (${campi(b)})` : ""}${b.stato ? ` — stato: ${String(b.stato)}` : ""}`;
    else if (method === "DELETE" && /^\/api\/admin\/events\/[^/]+$/.test(path)) t = `Admin ha eliminato l'evento ${before}`;
    else if (method === "POST" && (m = /^\/api\/admin\/events\/([^/]+)\/participants$/.exec(path))) {
      const ids = Array.isArray(b.user_ids) ? b.user_ids : [];
      const names = [];
      for (const id of ids) names.push(await userName(db, id));
      t = `Admin ha invitato ${names.join(", ")} all'evento ${await eventName(db, decodeURIComponent(m[1]!))}`;
    } else if (method === "PATCH" && (m = /^\/api\/admin\/events\/([^/]+)\/participants\/(\d+)$/.exec(path))) {
      const n = await userName(db, m[2]);
      const ev = await eventName(db, decodeURIComponent(m[1]!));
      if (b.stato) t = `Admin: ${n} ${STATO_LABEL[String(b.stato)] ?? String(b.stato)} per l'evento ${ev}`;
      else if (b.is_tl !== undefined) t = `Admin: ${n} ${b.is_tl ? "è" : "non è più"} team leader per l'evento ${ev}`;
      else if (b.ruolo_evento !== undefined) t = `Admin: ruolo di ${n} per l'evento ${ev}: ${String(b.ruolo_evento || "-")}`;
    } else if (method === "DELETE" && /^\/api\/admin\/events\/[^/]+\/participants\/\d+$/.test(path)) t = `Admin ha tolto ${before}`;
    else if (method === "POST" && (m = /^\/api\/my\/events\/([^/]+)\/availability$/.exec(path)))
      t = `${who} ha risposto «${STATO_LABEL[String(b.stato)] ?? String(b.stato)}» per l'evento ${await eventName(db, decodeURIComponent(m[1]!))}${b.nota ? ` — nota: "${String(b.nota)}"` : ""}`;
    else if (method === "POST" && (m = /^\/api\/(admin|my)\/events\/([^/]+)\/chiudi$/.exec(path))) t = `${who} ha chiuso l'evento ${await eventName(db, decodeURIComponent(m[2]!))}`;
    else if (method === "POST" && (m = /^\/api\/admin\/events\/([^/]+)\/riapri$/.exec(path))) t = `Admin ha riaperto l'evento ${await eventName(db, decodeURIComponent(m[1]!))}`;
    else if (method === "PUT" && (m = /^\/api\/my\/presenze\/([^/]+)$/.exec(path)))
      t = `${who} ha compilato il foglio presenza per l'evento ${await eventName(db, decodeURIComponent(m[1]!))}: ruolo ${String(b.ruolo || "-")}, tariffa ${String(b.tariffa || "-")}${b.diaria ? `, diaria ${String(b.diaria)}` : ""}${b.pernotti ? `, pernotti ${String(b.pernotti)}` : ""}${b.viaggi ? `, viaggi ${String(b.viaggi)}` : ""}`;
    else if (method === "POST" && (m = /^\/api\/my\/fogli\/(\d{4}-\d{2})\/chiudi$/.exec(path))) t = `${who} ha chiuso il suo foglio presenze di ${m[1]}`;
    if (t) await logAct(db, t);
  } catch {
    /* il registro non deve mai bloccare l'app */
  }
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
app.use("/api/shouts", requireUser);
app.use("/api/shouts/*", requireUser);
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

// Giorni in cui lo user non c'è (singoli giorni o periodi "dal … al …")
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const todayRome = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);

async function assenzeOf(db: D1Database, userId: number | null) {
  // quelli passati da più di un anno si cancellano; quelli già passati non si mostrano più (restano per il report del mese)
  await db.prepare("DELETE FROM user_assenze WHERE al < date('now', '-400 days')").run();
  const today = todayRome();
  const rows = userId === null
    ? await db.prepare("SELECT id, user_id, dal, al FROM user_assenze WHERE al >= ? ORDER BY dal").bind(today).all<{ id: number; user_id: number; dal: string; al: string }>()
    : await db.prepare("SELECT id, user_id, dal, al FROM user_assenze WHERE user_id = ? AND al >= ? ORDER BY dal").bind(userId, today).all<{ id: number; user_id: number; dal: string; al: string }>();
  return rows.results;
}

app.get("/api/profile/assenze", async (c) => {
  const me = c.get("me");
  const rows = await assenzeOf(c.env.DB, me.id as number);
  return c.json({ success: true, assenze: rows.map(({ id, dal, al }) => ({ id, dal, al })) });
});
app.post("/api/profile/assenze", async (c) => {
  const me = c.get("me");
  const b = await body(c);
  const dal = typeof b.dal === "string" ? b.dal : "";
  const al = typeof b.al === "string" && b.al ? b.al : dal;
  if (!ISO_DAY.test(dal) || !ISO_DAY.test(al)) return fail(c, 400, "Data non valida");
  if (al < dal) return fail(c, 400, "La data di fine viene prima di quella di inizio");
  if (al < todayRome()) return fail(c, 400, "Quel giorno è già passato");
  if ((Date.parse(al) - Date.parse(dal)) / 86400000 > 366) return fail(c, 400, "Periodo troppo lungo (massimo un anno)");
  const r = await c.env.DB.prepare("INSERT INTO user_assenze (user_id, dal, al) VALUES (?, ?, ?)").bind(me.id, dal, al).run();
  return c.json({ success: true, id: r.meta.last_row_id }, 201);
});
// dal calendario: un tocco su un giorno lo segna (o lo toglie); i giorni vicini diventano un unico periodo
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
app.post("/api/profile/assenze/giorno", async (c) => {
  const me = c.get("me");
  const b = await body(c);
  const day = typeof b.data === "string" ? b.data : "";
  if (!ISO_DAY.test(day)) return fail(c, 400, "Data non valida");
  if (day < todayRome()) return fail(c, 400, "Quel giorno è già passato");
  const rows = await assenzeOf(c.env.DB, me.id as number);
  const days = new Set<string>();
  for (const r of rows) for (let d = r.dal; d <= r.al; d = addDays(d, 1)) days.add(d);
  const away = !days.has(day);
  if (away) days.add(day);
  else days.delete(day);
  // si ricostruiscono i periodi da giorni consecutivi
  const sorted = [...days].sort();
  const ranges: Array<[string, string]> = [];
  for (const d of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last[1], 1) === d) last[1] = d;
    else ranges.push([d, d]);
  }
  // si riscrivono solo i periodi che arrivano da oggi in poi: quelli passati restano per il report
  const stmts = [c.env.DB.prepare("DELETE FROM user_assenze WHERE user_id = ? AND al >= ?").bind(me.id, todayRome())];
  for (const [dal, al] of ranges) stmts.push(c.env.DB.prepare("INSERT INTO user_assenze (user_id, dal, al) VALUES (?, ?, ?)").bind(me.id, dal, al));
  await c.env.DB.batch(stmts);
  return c.json({ success: true, away });
});
app.delete("/api/profile/assenze/:aid", async (c) => {
  const me = c.get("me");
  const aid = intParam(c, "aid");
  if (!aid) return fail(c, 400, "ID non valido");
  const r = await c.env.DB.prepare("DELETE FROM user_assenze WHERE id = ? AND user_id = ?").bind(aid, me.id).run();
  if (!r.meta.changes) return fail(c, 404, "Giorno non trovato");
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
  const away = new Map<number, Array<{ dal: string; al: string }>>();
  for (const a of await assenzeOf(c.env.DB, null)) away.set(a.user_id, [...(away.get(a.user_id) ?? []), { dal: a.dal, al: a.al }]);
  return c.json({
    success: true,
    users: rows.results.map((r) => ({ ...userFromRow(r), costumi: byUser.get(r.id as number) ?? [], assenze: away.get(r.id as number) ?? [] })),
  });
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
  const assenze = (await assenzeOf(c.env.DB, id)).map(({ dal, al }) => ({ dal, al }));
  return c.json({ success: true, user: userFromRow(row), password: pw?.password_visibile ?? null, assenze, costumes: costumes.results, events: events.results });
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
  "referente_nome", "referente_telefono", "compenso", "note_admin", "motivo_annullamento", "note_finali", "sigla",
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
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id AND l.damaged = 1) AS danni,
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id AND l.lost = 1) AS persi
       FROM events e ORDER BY e.data, e.ora_inizio`,
    )
    .all();
  return c.json({
    success: true,
    events: rows.results.map((r) => ({
      ...eventFromRow(r),
      conteggi: { invitati: r.invitati, in_attesa: r.in_attesa, disponibili: r.disponibili, confermati: r.confermati, righe_bolla: r.righe_bolla, danni: r.danni, persi: r.persi },
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
  const values = EVENT_FIELDS.map((f) => (f === "nome" ? nome : f === "data" ? data : f === "sigla" ? str(b.sigla, 12) || siglaDaNome(nome) || null : str(b[f])));
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
  // chi ha segnato che quel giorno non c'è non viene invitato
  const away = new Set(
    (await c.env.DB.prepare("SELECT DISTINCT user_id FROM user_assenze WHERE dal <= ? AND al >= ?").bind(ev.data, ev.data).all<{ user_id: number }>()).results.map((r) => r.user_id),
  );
  const skipped = ids.filter((uid) => away.has(uid)).length;
  if (skipped === ids.length) return fail(c, 400, "Quel giorno nessuno di loro c'è: hanno segnato di non essere disponibili");
  for (const uid of ids.filter((u) => !away.has(u))) await inviteUser(c.env.DB, ev.id as number, ev.nome as string, uid, str(b.ruolo_evento, 120), tl.has(uid));
  return c.json({ success: true, skipped });
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
  for (const f of ["prep", "present", "returned", "damaged", "lost"] as const) {
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
  if (onlyIssues) where.push("(l.damaged = 1 OR l.lost = 1 OR (l.comment IS NOT NULL AND l.comment != '') OR (l.present = 1 AND l.returned = 0))");
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
    luogo: e.luogo, tipo: e.tipo, tematica: e.tematica, sigla: e.sigla, descrizione: e.descrizione, stato: e.stato, motivo_annullamento: e.motivo_annullamento,
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
  for (const f of ["present", "returned", "damaged", "lost"] as const) {
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
  if (b.lost !== undefined && bool(b.lost) && row.lost !== 1) {
    await notifyAdmin(c.env.DB, "perso", `${me.nome} ${me.cognome} ha segnalato un oggetto perso: ${row.item as string} (${row.event_nome as string})`, row.event_id as number);
  }
  const updated = await c.env.DB.prepare("SELECT * FROM load_rows WHERE id = ?").bind(rid).first();
  return c.json({ success: true, row: loadRowFromRow(updated!) });
});

// ---------------------------------------------------------------------------
// Foglio presenze: ogni user, per ogni evento in cui è confermato, scrive ruolo, tariffa e rimborsi.
// A fine mese chiude il foglio: resta nel suo archivio personale 3 mesi.
// ---------------------------------------------------------------------------

const FOGLI_KEEP_DAYS = 90;
const FP_FIELDS = { ruolo: 40, tariffa: 14, diaria: 14, pernotti: 14, viaggi: 14 } as const;
type FpRow = { event_id: number; data: string; tipologia: string; location: string; ruolo: string; tariffa: string; diaria: string; pernotti: string; viaggi: string };

const lastDayOf = (mese: string) => {
  const [y, m] = mese.split("-").map(Number) as [number, number];
  return `${mese}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

async function foglioChiuso(db: D1Database, userId: number, mese: string) {
  return !!(await db.prepare("SELECT id FROM fogli_presenza WHERE user_id = ? AND mese = ?").bind(userId, mese).first());
}

/** Le righe del foglio di un mese: eventi confermati ancora nell'app + quelli già archiviati (salvati in presenze). */
async function foglioRighe(db: D1Database, userId: number, mese: string): Promise<FpRow[]> {
  const live = await db
    .prepare(
      `SELECT e.id, e.data, e.sigla, e.tipo, e.nome, e.luogo FROM event_participants p JOIN events e ON e.id = p.event_id
       WHERE p.user_id = ? AND p.stato = 'confirmed' AND e.stato != 'annullato' AND substr(e.data, 1, 7) = ?`,
    )
    .bind(userId, mese)
    .all<{ id: number; data: string; sigla: string | null; tipo: string | null; nome: string; luogo: string | null }>();
  const pres = await db.prepare("SELECT * FROM presenze WHERE user_id = ? AND mese = ?").bind(userId, mese).all<Record<string, string | number | null>>();
  const byEvent = new Map(pres.results.map((r) => [r.event_id as number, r]));
  const fields = (r: Record<string, string | number | null> | undefined) => ({
    ruolo: String(r?.ruolo ?? ""), tariffa: String(r?.tariffa ?? ""), diaria: String(r?.diaria ?? ""), pernotti: String(r?.pernotti ?? ""), viaggi: String(r?.viaggi ?? ""),
  });
  const rows: FpRow[] = live.results.map((e) => ({
    event_id: e.id, data: e.data, tipologia: e.sigla || e.tipo || e.nome, location: e.luogo ?? "", ...fields(byEvent.get(e.id)),
  }));
  // eventi non più nell'app (archiviati): restano con i dati salvati
  const liveIds = new Set(live.results.map((e) => e.id));
  const others = pres.results.filter((r) => !liveIds.has(r.event_id as number));
  if (others.length) {
    const still = await db.prepare(`SELECT id FROM events WHERE id IN (${others.map(() => "?").join(",")})`).bind(...others.map((r) => r.event_id)).all<{ id: number }>();
    const exists = new Set(still.results.map((r) => r.id));
    for (const r of others) {
      if (exists.has(r.event_id as number)) continue; // l'evento c'è ancora ma lo user non è più confermato
      rows.push({ event_id: r.event_id as number, data: String(r.data), tipologia: String(r.tipologia ?? ""), location: String(r.location ?? ""), ...fields(r) });
    }
  }
  return rows.sort((a, b) => a.data.localeCompare(b.data) || a.event_id - b.event_id);
}

async function cleanFogli(db: D1Database) {
  await db.prepare(`DELETE FROM fogli_presenza WHERE closed_at < datetime('now', '-${FOGLI_KEEP_DAYS} days')`).run();
}

app.get("/api/my/presenze/:code", async (c) => {
  const me = c.get("me");
  const row = await myParticipation(c, c.req.param("code"));
  if (!row) return fail(c, 404, "Evento non trovato o non sei coinvolto");
  if (row.mio_stato !== "confirmed") return fail(c, 403, "Il foglio presenza si compila solo per gli eventi in cui sei confermato");
  const mese = String(row.data).slice(0, 7);
  const p = await c.env.DB.prepare("SELECT * FROM presenze WHERE user_id = ? AND event_id = ?").bind(me.id, row.id).first<Record<string, string | null>>();
  return c.json({
    success: true,
    mese,
    chiuso: await foglioChiuso(c.env.DB, me.id as number, mese),
    tipologia: (row.sigla as string) || (row.tipo as string) || (row.nome as string),
    location: (row.luogo as string) ?? "",
    data: row.data,
    ruolo: p?.ruolo ?? "", tariffa: p?.tariffa ?? "", diaria: p?.diaria ?? "", pernotti: p?.pernotti ?? "", viaggi: p?.viaggi ?? "",
  });
});

app.put("/api/my/presenze/:code", async (c) => {
  const me = c.get("me");
  const row = await myParticipation(c, c.req.param("code"));
  if (!row) return fail(c, 404, "Evento non trovato o non sei coinvolto");
  if (row.mio_stato !== "confirmed") return fail(c, 403, "Il foglio presenza si compila solo per gli eventi in cui sei confermato");
  const mese = String(row.data).slice(0, 7);
  if (await foglioChiuso(c.env.DB, me.id as number, mese)) return fail(c, 409, "Il foglio presenze di questo mese è già chiuso");
  const b = await body(c);
  const v = Object.fromEntries(Object.entries(FP_FIELDS).map(([k, max]) => [k, typeof b[k] === "string" ? (b[k] as string).replace(/\s+/g, " ").trim().slice(0, max) : ""]));
  await c.env.DB
    .prepare(
      `INSERT INTO presenze (user_id, event_id, mese, data, tipologia, location, ruolo, tariffa, diaria, pernotti, viaggi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, event_id) DO UPDATE SET mese = excluded.mese, data = excluded.data, tipologia = excluded.tipologia, location = excluded.location,
         ruolo = excluded.ruolo, tariffa = excluded.tariffa, diaria = excluded.diaria, pernotti = excluded.pernotti, viaggi = excluded.viaggi, updated_at = datetime('now')`,
    )
    .bind(me.id, row.id, mese, row.data, (row.sigla as string) || (row.tipo as string) || (row.nome as string), (row.luogo as string) ?? "", v.ruolo, v.tariffa, v.diaria, v.pernotti, v.viaggi)
    .run();
  return c.json({ success: true });
});

app.get("/api/my/fogli", async (c) => {
  const me = c.get("me");
  await cleanFogli(c.env.DB);
  const today = todayRome();
  const chiusi = await c.env.DB
    .prepare(`SELECT id, mese, closed_at, date(closed_at, '+${FOGLI_KEEP_DAYS} days') AS scade_il FROM fogli_presenza WHERE user_id = ? ORDER BY mese DESC`)
    .bind(me.id)
    .all<{ id: number; mese: string; closed_at: string; scade_il: string }>();
  const closed = new Set(chiusi.results.map((r) => r.mese));
  // mesi con eventi confermati (fino a quello in corso) o con righe già salvate, non ancora chiusi
  const m1 = await c.env.DB
    .prepare(
      `SELECT DISTINCT substr(e.data, 1, 7) AS mese FROM event_participants p JOIN events e ON e.id = p.event_id
       WHERE p.user_id = ? AND p.stato = 'confirmed' AND e.stato != 'annullato' AND substr(e.data, 1, 7) <= ?`,
    )
    .bind(me.id, today.slice(0, 7))
    .all<{ mese: string }>();
  const m2 = await c.env.DB.prepare("SELECT DISTINCT mese FROM presenze WHERE user_id = ?").bind(me.id).all<{ mese: string }>();
  const mesi = [...new Set([...m1.results, ...m2.results].map((r) => r.mese))].filter((m) => !closed.has(m)).sort().reverse();
  const aperti = [];
  for (const mese of mesi) {
    const righe = await foglioRighe(c.env.DB, me.id as number, mese);
    if (righe.length) aperti.push({ mese, righe, chiudibile: today >= lastDayOf(mese), chiudibile_dal: lastDayOf(mese) });
  }
  return c.json({ success: true, aperti, chiusi: chiusi.results.map((r) => ({ ...r, quando: romeDateTime(r.closed_at) })) });
});

app.post("/api/my/fogli/:mese/chiudi", async (c) => {
  const me = c.get("me");
  const mese = c.req.param("mese");
  if (!/^\d{4}-\d{2}$/.test(mese)) return fail(c, 400, "Mese non valido");
  if (todayRome() < lastDayOf(mese)) return fail(c, 400, "Il foglio si può chiudere dall'ultimo giorno del mese");
  if (await foglioChiuso(c.env.DB, me.id as number, mese)) return fail(c, 409, "Questo foglio è già chiuso");
  const righe = await foglioRighe(c.env.DB, me.id as number, mese);
  if (!righe.length) return fail(c, 400, "Nessun evento in questo mese");
  await c.env.DB
    .prepare("INSERT INTO fogli_presenza (user_id, mese, nome, cognome, righe_json) VALUES (?, ?, ?, ?, ?)")
    .bind(me.id, mese, me.nome, me.cognome, JSON.stringify(righe))
    .run();
  await c.env.DB.prepare("DELETE FROM presenze WHERE user_id = ? AND mese = ?").bind(me.id, mese).run();
  return c.json({ success: true });
});

app.get("/api/my/fogli/chiusi/:id", async (c) => {
  const me = c.get("me");
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare("SELECT mese, nome, cognome, righe_json FROM fogli_presenza WHERE id = ? AND user_id = ?").bind(id, me.id).first<{ mese: string; nome: string; cognome: string; righe_json: string }>();
  if (!row) return fail(c, 404, "Foglio non trovato (forse è già scaduto)");
  return c.json({ success: true, mese: row.mese, nome: row.nome, cognome: row.cognome, righe: JSON.parse(row.righe_json) as FpRow[] });
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
      `SELECT id, author_role, user_id, author_name, testo, mentions_json, created_at FROM chat_messages
       WHERE created_at >= datetime('now', '-24 hours') ORDER BY id DESC LIMIT 300`,
    )
    .all<Record<string, unknown>>();
  const me = c.get("me");
  const messages = rows.results.reverse().map(({ mentions_json, ...m }) => {
    let mentions: unknown = [];
    try {
      mentions = mentions_json ? JSON.parse(String(mentions_json)) : [];
    } catch {
      mentions = [];
    }
    return { ...m, mentions };
  });
  return c.json({ success: true, me_name: tavernaName(me), me_role: me.role, me_id: me.role === "user" ? me.id : null, messages });
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
  // i tag arrivano già scelti dal menù: si tengono solo persone vere e presenti nel testo
  const asked = Array.isArray(b.mentions) ? (b.mentions as Array<{ role?: unknown; id?: unknown }>) : [];
  const low = testo.toLowerCase();
  const mentions: Array<{ role: string; id: number | null; name: string }> = [];
  if (asked.length) {
    for (const p of await tavernaPeople(c.env.DB)) {
      const wanted = asked.some((m) => m.role === p.role && (p.role === "admin" || Number(m.id) === p.id));
      if (wanted && low.includes("@" + p.name.toLowerCase())) mentions.push(p);
    }
  }
  const r = await c.env.DB
    .prepare("INSERT INTO chat_messages (author_role, user_id, author_name, testo, mentions_json) VALUES (?, ?, ?, ?, ?)")
    .bind(me.role, me.role === "user" ? me.id : null, name, testo, mentions.length ? JSON.stringify(mentions) : null)
    .run();
  // tutti i messaggi restano salvati per il report del mese (la chat invece si svuota dopo 24 ore)
  await c.env.DB
    .prepare("INSERT INTO chat_log (author_role, author_name, testo, mentions_json) VALUES (?, ?, ?, ?)")
    .bind(me.role, name, testo, mentions.length ? JSON.stringify(mentions) : null)
    .run();
  // chi è stato taggato riceve una notifica
  if (mentions.length) {
    const snippet = testo.length > 80 ? testo.slice(0, 80) + "…" : testo;
    const msg = `${name} ti ha taggato nella Taverna: «${snippet}»`;
    for (const p of mentions) {
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
// Shout: messaggi scritti dall'admin a uno, più o tutti gli user. Restano salvati.
// ---------------------------------------------------------------------------

const SHOUT_MAX = 1000;
/** "08/10/2026 10:59" in ora italiana, da una data del database (UTC) */
function romeDateTime(sql: string) {
  const d = new Date(sql.replace(" ", "T") + "Z");
  return d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

app.post("/api/admin/shouts", async (c) => {
  const b = await body(c);
  const testo = typeof b.testo === "string" ? b.testo.trim() : "";
  if (!testo) return fail(c, 400, "Il messaggio è vuoto");
  if (testo.length > SHOUT_MAX) return fail(c, 400, `Massimo ${SHOUT_MAX} caratteri`);
  const tutti = b.tutti === true;
  const ids = Array.isArray(b.user_ids) ? b.user_ids.filter((x): x is number => Number.isInteger(x)) : [];
  const rows = tutti
    ? await c.env.DB.prepare("SELECT id, nome, cognome, username FROM users WHERE ruolo = 'user' AND attivo = 1").all<{ id: number; nome: string; cognome: string; username: string }>()
    : ids.length
      ? await c.env.DB.prepare(`SELECT id, nome, cognome, username FROM users WHERE ruolo = 'user' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ id: number; nome: string; cognome: string; username: string }>()
      : { results: [] as Array<{ id: number; nome: string; cognome: string; username: string }> };
  if (!rows.results.length) return fail(c, 400, "Scegli almeno uno user");
  const r = await c.env.DB.prepare("INSERT INTO shouts (testo, a_tutti) VALUES (?, ?)").bind(testo, tutti ? 1 : 0).run();
  const sid = r.meta.last_row_id;
  const snippet = testo.length > 80 ? testo.slice(0, 80) + "…" : testo;
  const stmts = rows.results.flatMap((u) => [
    c.env.DB.prepare("INSERT INTO shout_recipients (shout_id, user_id, nome) VALUES (?, ?, ?)").bind(sid, u.id, `${u.nome} ${u.cognome}`.trim() || u.username),
    c.env.DB.prepare("INSERT INTO notifications (user_id, for_admin, type, message, event_id) VALUES (?, 0, 'shout', ?, NULL)").bind(u.id, `Shout dall'admin: «${snippet}»`),
  ]);
  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));
  return c.json({ success: true, id: sid, recipients: rows.results.length }, 201);
});

app.get("/api/admin/shouts", async (c) => {
  const shouts = await c.env.DB.prepare("SELECT id, testo, a_tutti, created_at FROM shouts ORDER BY id DESC LIMIT 200").all<{ id: number; testo: string; a_tutti: number; created_at: string }>();
  const rec = await c.env.DB.prepare("SELECT shout_id, user_id, nome, read_at FROM shout_recipients WHERE shout_id >= ?").bind(shouts.results.at(-1)?.id ?? 0).all<{ shout_id: number; user_id: number; nome: string; read_at: string | null }>();
  return c.json({
    success: true,
    shouts: shouts.results.map((s) => {
      const r = rec.results.filter((x) => x.shout_id === s.id);
      return { ...s, a_tutti: s.a_tutti === 1, destinatari: r.map((x) => x.nome), letti: r.filter((x) => x.read_at).length, quando: romeDateTime(s.created_at) };
    }),
  });
});

app.get("/api/shouts", async (c) => {
  const me = c.get("me");
  const rows = await c.env.DB
    .prepare(
      `SELECT s.id, s.testo, s.a_tutti, s.created_at, r.read_at FROM shout_recipients r JOIN shouts s ON s.id = r.shout_id
       WHERE r.user_id = ? ORDER BY s.id DESC LIMIT 100`,
    )
    .bind(me.id)
    .all<{ id: number; testo: string; a_tutti: number; created_at: string; read_at: string | null }>();
  return c.json({
    success: true,
    unread: rows.results.filter((r) => !r.read_at).length,
    shouts: rows.results.map((r) => ({ id: r.id, testo: r.testo, a_tutti: r.a_tutti === 1, created_at: r.created_at, quando: romeDateTime(r.created_at), letto: !!r.read_at })),
  });
});

app.post("/api/shouts/read", async (c) => {
  const me = c.get("me");
  await c.env.DB.prepare("UPDATE shout_recipients SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").bind(me.id).run();
  await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND type = 'shout' AND is_read = 0").bind(me.id).run();
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
      persi: rows.filter((r) => r.lost).length,
      mai_segnati_presenti: rows.filter((r) => !r.present).length,
      non_rientrati: rows.filter((r) => r.present && !r.returned).length,
    },
  };
  const problemi = rows.filter((r) => r.damaged || r.lost || r.comment || r.annotazione || (r.present && !r.returned));

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
  line(`BOLLA DI CARICO — voci ${sb.oggetti}, entrate ${sb.presenti}, uscite ${sb.rientrati}, danneggiate ${sb.danneggiati}, perse ${sb.persi}, entrate ma non uscite ${sb.non_rientrati}`);
  for (const r of rows) {
    const flags = [r.prep ? "prep" : "NO prep", r.present ? "entrata" : "NO entrata", r.returned ? "uscita" : "NO uscita", r.damaged ? "DANNEGGIATO" : "", r.lost ? "PERSO" : ""].filter(Boolean).join(", ");
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
  // chi era confermato tiene la riga nel suo foglio presenza anche dopo l'archiviazione
  await db
    .prepare(
      `INSERT OR IGNORE INTO presenze (user_id, event_id, mese, data, tipologia, location)
       SELECT p.user_id, e.id, substr(e.data, 1, 7), e.data, COALESCE(NULLIF(e.sigla, ''), NULLIF(e.tipo, ''), e.nome), e.luogo
       FROM event_participants p JOIN events e ON e.id = p.event_id WHERE p.event_id = ? AND p.stato = 'confirmed'`,
    )
    .bind(eventId)
    .run();
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

// ---------------------------------------------------------------------------
// Report del mese: un unico .txt ordinato con tutto quello che è successo.
// I report fatti restano in archivio 3 mesi, poi si cancellano da soli.
// ---------------------------------------------------------------------------

const REPORT_KEEP_DAYS = 90;
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const romeMonth = (sql: string) => new Date(sql.replace(" ", "T") + "Z").toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }).slice(0, 7);

async function buildMonthlyReport(db: D1Database, mese: string) {
  const [y, m] = mese.split("-").map(Number) as [number, number];
  const first = `${mese}-01`;
  const last = lastDayOf(mese);
  const SEP = "=".repeat(64);
  const sub = "-".repeat(64);
  const out: string[] = [];
  let n = 0;
  const head = (t: string) => out.push("", SEP, `${++n}. ${t}`, SEP, "");
  const inMonth = (sql: string) => romeMonth(sql) === mese;

  // eventi con data nel mese: quelli ancora nell'app si leggono per intero, quelli già archiviati dal loro resoconto
  const live = await db.prepare("SELECT id, code FROM events WHERE substr(data, 1, 7) = ? ORDER BY data, id").bind(mese).all<{ id: number; code: string }>();
  const archived = await db.prepare("SELECT code, testo FROM event_archives WHERE substr(data, 1, 7) = ? ORDER BY data, id").bind(mese).all<{ code: string; testo: string }>();
  const reso = [];
  for (const e of live.results) {
    const r = await buildResoconto(db, e.id);
    if (r) reso.push(r);
  }
  const liveCodes = new Set(reso.map((r) => r.event.code));
  const oldOnes = archived.results.filter((a) => !liveCodes.has(a.code));

  // eventi CREATI nel mese ma con data in un altro mese
  const created = (await db.prepare("SELECT id, created_at FROM events WHERE substr(data, 1, 7) != ? ORDER BY data, id").bind(mese).all<{ id: number; created_at: string }>()).results.filter((e) =>
    inMonth(e.created_at),
  );
  const createdReso = [];
  for (const e of created) {
    const r = await buildResoconto(db, e.id);
    if (r) createdReso.push(r);
  }

  const people = new Map<string, number>();
  for (const r of reso) for (const p of r.people) if (p.stato === "confirmed") people.set(`${p.nome} ${p.cognome}`, (people.get(`${p.nome} ${p.cognome}`) ?? 0) + 1);
  const issues = reso.flatMap((r) => r.problemi.filter((x) => x.damaged || x.lost).map((x) => ({ ev: r.event, row: x })));

  // giorni di non disponibilità che toccano il mese
  const away = await db
    .prepare(
      `SELECT a.dal, a.al, u.nome, u.cognome FROM user_assenze a JOIN users u ON u.id = a.user_id
       WHERE a.dal <= ? AND a.al >= ? ORDER BY u.cognome, u.nome, a.dal`,
    )
    .bind(last, first)
    .all<{ dal: string; al: string; nome: string; cognome: string }>();

  // fogli presenze: chiusi + ancora aperti
  const users = (await db.prepare("SELECT id, nome, cognome FROM users WHERE ruolo = 'user' ORDER BY cognome, nome").all<{ id: number; nome: string; cognome: string }>()).results;
  const closed = await db.prepare("SELECT user_id, nome, cognome, righe_json, closed_at FROM fogli_presenza WHERE mese = ?").bind(mese).all<{ user_id: number; nome: string; cognome: string; righe_json: string; closed_at: string }>();
  const closedBy = new Map(closed.results.map((r) => [r.user_id, r]));
  const fogli: Array<{ nome: string; stato: string; righe: FpRow[] }> = [];
  for (const u of users) {
    const cl = closedBy.get(u.id);
    if (cl) fogli.push({ nome: `${cl.nome} ${cl.cognome}`, stato: `chiuso il ${romeDateTime(cl.closed_at)}`, righe: JSON.parse(cl.righe_json) as FpRow[] });
    else {
      const righe = await foglioRighe(db, u.id, mese);
      if (righe.length) fogli.push({ nome: `${u.nome} ${u.cognome}`, stato: "NON ancora chiuso dallo user", righe });
    }
  }
  for (const cl of closed.results) if (!users.some((u) => u.id === cl.user_id)) fogli.push({ nome: `${cl.nome} ${cl.cognome}`, stato: `chiuso il ${romeDateTime(cl.closed_at)} (user non più presente)`, righe: JSON.parse(cl.righe_json) as FpRow[] });

  const shouts = (await db.prepare("SELECT id, testo, a_tutti, created_at FROM shouts ORDER BY id").all<{ id: number; testo: string; a_tutti: number; created_at: string }>()).results.filter((x) => inMonth(x.created_at));
  const chat = (await db.prepare("SELECT author_role, author_name, testo, mentions_json, created_at FROM chat_log ORDER BY id").all<{ author_role: string; author_name: string; testo: string; mentions_json: string | null; created_at: string }>()).results.filter((x) =>
    inMonth(x.created_at),
  );
  const log = (await db.prepare("SELECT testo, created_at FROM attivita_log ORDER BY id").all<{ testo: string; created_at: string }>()).results.filter((x) => inMonth(x.created_at));

  out.push(`REPORT DEL MESE — MALASTRANA EVENTI — ${MESI[m - 1]!.toUpperCase()} ${y}`);
  out.push(`Generato il ${romeDateTime(new Date().toISOString().slice(0, 19).replace("T", " "))}`);

  head("RIEPILOGO");
  out.push(`Eventi del mese: ${reso.length + oldOnes.length}`);
  out.push(`Eventi creati nel mese per altri mesi: ${createdReso.length}`);
  out.push(`Persone che hanno lavorato (confermate): ${people.size}`);
  out.push(`Oggetti danneggiati: ${issues.filter((i) => i.row.damaged).length}`);
  out.push(`Oggetti persi: ${issues.filter((i) => i.row.lost).length}`);
  out.push(`Periodi di non disponibilità segnati: ${away.results.length}`);
  out.push(`Fogli presenze: ${fogli.length} (chiusi ${fogli.filter((f) => f.stato.startsWith("chiuso")).length})`);
  out.push(`Shout mandati: ${shouts.length}`);
  out.push(`Messaggi in Taverna: ${chat.length}`);
  out.push(`Attività registrate: ${log.length}`);

  head("EVENTI DEL MESE (con tutte le info, persone e bolla)");
  if (!reso.length && !oldOnes.length) out.push("Nessun evento in questo mese.");
  [...reso.map((r) => r.testo), ...oldOnes.map((a) => a.testo)].forEach((tx, i) => {
    if (i) out.push(sub, "");
    out.push(tx);
  });

  head("EVENTI CREATI NEL MESE PER I MESI SUCCESSIVI (o precedenti)");
  if (!createdReso.length) out.push("Nessuno.");
  createdReso.forEach((r, i) => {
    if (i) out.push(sub, "");
    out.push(r.testo);
  });

  head("CHI HA LAVORATO NEL MESE");
  if (!people.size) out.push("Nessuno confermato in questo mese.");
  for (const [nm, k] of [...people.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out.push(`  - ${nm}: ${k} ${k === 1 ? "evento" : "eventi"}`);

  head("DANNI E PERDITE");
  if (!issues.length) out.push("Nessun oggetto danneggiato o perso." + (oldOnes.length ? " (Per gli eventi già archiviati vedi il loro resoconto sopra.)" : ""));
  for (const { ev, row } of issues) {
    const what = [row.damaged ? "DANNEGGIATO" : "", row.lost ? "PERSO" : ""].filter(Boolean).join(" + ");
    out.push(`  - ${dmy(ev.data)} ${ev.nome}: ${row.quantita > 1 ? `${row.quantita}x ` : ""}${row.item}${row.codice ? ` (${row.codice})` : ""} — ${what}${row.assigned_name ? ` — affidato a ${row.assigned_name}` : ""}`);
    if (row.comment) out.push(`      cosa è successo: "${row.comment}"${row.updated_by ? ` (segnato da ${row.updated_by})` : ""}`);
    if (row.annotazione) out.push(`      annotazione admin: ${row.annotazione}`);
  }

  head("GIORNI IN CUI GLI USER NON C'ERANO");
  if (!away.results.length) out.push("Nessuno ha segnato giorni di non disponibilità in questo mese.");
  for (const a of away.results) {
    const dal = a.dal < first ? first : a.dal;
    const al = a.al > last ? last : a.al;
    out.push(`  - ${a.nome} ${a.cognome}: ${dal === al ? dmy(dal) : `dal ${dmy(dal)} al ${dmy(al)}`}`);
  }

  head("FOGLI PRESENZE");
  if (!fogli.length) out.push("Nessun foglio presenze per questo mese.");
  for (const f of fogli) {
    out.push(`${f.nome.toUpperCase()} — ${f.stato}`);
    for (const r of f.righe) {
      const rimb = [r.diaria && `diaria ${r.diaria}`, r.pernotti && `pernotti ${r.pernotti}`, r.viaggi && `viaggi ${r.viaggi}`].filter(Boolean).join(", ");
      out.push(`  - ${dmy(r.data)} | ${r.tipologia || "-"} | ${r.location || "-"} | ruolo: ${r.ruolo || "-"} | tariffa: ${r.tariffa || "-"}${rimb ? ` | ${rimb}` : ""}`);
    }
    out.push("");
  }

  head("SHOUT DELL'ADMIN");
  if (!shouts.length) out.push("Nessuno shout in questo mese.");
  for (const sh of shouts) {
    const rec = (await db.prepare("SELECT nome, read_at FROM shout_recipients WHERE shout_id = ? ORDER BY nome").bind(sh.id).all<{ nome: string; read_at: string | null }>()).results;
    out.push(`${romeDateTime(sh.created_at)} — a: ${sh.a_tutti ? `TUTTI (${rec.length} user)` : rec.map((r) => r.nome).join(", ")}`);
    if (sh.a_tutti) out.push(`  destinatari: ${rec.map((r) => r.nome).join(", ")}`);
    out.push(`  letto da ${rec.filter((r) => r.read_at).length} su ${rec.length}`);
    out.push(`  "${sh.testo}"`, "");
  }

  head("MESSAGGI IN TAVERNA (chat comune)");
  if (!chat.length) out.push("Nessun messaggio in Taverna in questo mese.");
  for (const t of chat) {
    let tagged: string[] = [];
    try {
      tagged = t.mentions_json ? (JSON.parse(t.mentions_json) as Array<{ name: string }>).map((x) => x.name) : [];
    } catch {
      tagged = [];
    }
    out.push(`${romeDateTime(t.created_at)} — ${t.author_name}${t.author_role === "admin" ? " (admin)" : ""} a tutti${tagged.length ? `, taggati: ${tagged.join(", ")}` : ""}`);
    out.push(`  "${t.testo}"`);
  }

  head("STORICO ATTIVITÀ (user, password, eventi, inviti, risposte, assenze, fogli)");
  if (!log.length) out.push("Nessuna attività registrata in questo mese.");
  for (const l of log) out.push(`${romeDateTime(l.created_at)} — ${l.testo}`);

  out.push("", SEP, "FINE REPORT", SEP);
  return out.join("\n");
}

// Copia di sicurezza completa: tutte le tabelle (tranne gli accessi attivi), da ricaricare se serve
const BACKUP_SKIP = new Set(["sessions", "_cf_KV", "sqlite_sequence", "d1_migrations"]);
app.get("/api/admin/backup", async (c) => {
  const tables = (await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all<{ name: string }>()).results
    .map((t) => t.name)
    .filter((t) => !BACKUP_SKIP.has(t) && !t.startsWith("_cf_") && !t.startsWith("sqlite_"));
  const data: Record<string, unknown[]> = {};
  for (const t of tables) data[t] = (await c.env.DB.prepare(`SELECT * FROM "${t}"`).all()).results;
  // le password leggibili non escono dall'app (restano quelle protette, che bastano per rimettere tutto)
  data.users = (data.users ?? []).map((u) => ({ ...(u as Record<string, unknown>), password_visibile: null }));
  return c.json({ success: true, app: "MalaStranApp", generato: new Date().toISOString(), schema: (await schemaStatus(c.env.DB)).version, tabelle: data });
});

async function cleanReports(db: D1Database) {
  await db.prepare(`DELETE FROM monthly_reports WHERE created_at < datetime('now', '-${REPORT_KEEP_DAYS} days')`).run();
  await db.prepare(`DELETE FROM taverna_admin_log WHERE created_at < datetime('now', '-400 days')`).run();
  await db.prepare(`DELETE FROM chat_log WHERE created_at < datetime('now', '-400 days')`).run();
  await db.prepare(`DELETE FROM attivita_log WHERE created_at < datetime('now', '-400 days')`).run();
}

app.post("/api/admin/report-mensile", async (c) => {
  const b = await body(c);
  const mese = typeof b.mese === "string" ? b.mese : "";
  if (!/^\d{4}-\d{2}$/.test(mese)) return fail(c, 400, "Mese non valido");
  const testo = await buildMonthlyReport(c.env.DB, mese);
  // un solo report per mese: quello nuovo sostituisce il vecchio
  await c.env.DB.prepare("DELETE FROM monthly_reports WHERE mese = ?").bind(mese).run();
  const r = await c.env.DB.prepare("INSERT INTO monthly_reports (mese, testo) VALUES (?, ?)").bind(mese, testo).run();
  return c.json({ success: true, id: r.meta.last_row_id, testo }, 201);
});

app.get("/api/admin/report-mensili", async (c) => {
  await cleanReports(c.env.DB);
  const rows = await c.env.DB
    .prepare(`SELECT id, mese, created_at, date(created_at, '+${REPORT_KEEP_DAYS} days') AS scade_il FROM monthly_reports ORDER BY mese DESC`)
    .all<{ id: number; mese: string; created_at: string; scade_il: string }>();
  return c.json({ success: true, reports: rows.results.map((r) => ({ ...r, quando: romeDateTime(r.created_at) })) });
});

app.get("/api/admin/report-mensili/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare("SELECT mese, testo FROM monthly_reports WHERE id = ?").bind(id).first<{ mese: string; testo: string }>();
  if (!row) return fail(c, 404, "Report non trovato (forse è già scaduto)");
  return c.json({ success: true, ...row });
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
    ctx.waitUntil(cleanReports(env.DB).catch(() => undefined));
    ctx.waitUntil(cleanFogli(env.DB).catch(() => undefined));
  },
};
