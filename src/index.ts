import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Login
app.post('/auth/login', async (c) => {
  const { nome, cognome, password } = await c.req.json();
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE nome = ? AND cognome = ?'
  )
    .bind(nome, cognome)
    .first();

  if (!user) {
    return c.json({ error: 'Utente non trovato' }, 404);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Password errata' }, 401);
  }

  const token = await createToken(c.env.JWT_SECRET, { id: user.id, ruolo: user.ruolo });
  return c.json({ token, user: { id: user.id, nome: user.nome, cognome: user.cognome, ruolo: user.ruolo } });
});

// Get utente corrente
app.get('/me', jwt({ secret: (c) => c.env.JWT_SECRET }), async (c) => {
  const payload = c.get('jwtPayload') as { id: number };
  const user = await c.env.DB.prepare('SELECT id, nome, cognome, ruolo FROM users WHERE id = ?')
    .bind(payload.id)
    .first();
  if (!user) return c.json({ error: 'Utente non trovato' }, 404);
  return c.json({ user });
});

// Creazione utente (Admin)
app.post('/users', jwt({ secret: (c) => c.env.JWT_SECRET }), async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { nome, cognome, email, ruolo } = await c.req.json();
  const password = generatePassword();
  const password_hash = await hashPassword(password);

  const result = await c.env.DB.prepare(
    'INSERT INTO users (nome, cognome, email, password_hash, ruolo) VALUES (?, ?, ?, ?, ?) RETURNING id'
  )
    .bind(nome, cognome, email ?? null, password_hash, ruolo)
    .first();

  return c.json({ id: result.id, password });
});

// Lista utenti (Admin)
app.get('/users', jwt({ secret: (c) => c.env.JWT_SECRET }), async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const users = await c.env.DB.prepare('SELECT id, nome, cognome, email, ruolo FROM users').all();
  return c.json({ users: users.results });
});

// Creazione evento (Admin)
app.post('/events', jwt({ secret: (c) => c.env.JWT_SECRET }), async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string; id: number };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { titolo, data, ora_inizio, ora_fine, luogo, note } = await c.req.json();
  const result = await c.env.DB.prepare(
    'INSERT INTO events (titolo, data, ora_inizio, ora_fine, luogo, note, creato_da) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  )
    .bind(titolo, data, ora_inizio, ora_fine, luogo ?? null, note ?? null, payload.id)
    .first();

  return c.json({ id: result.id });
});

// Lista eventi (tutti)
app.get('/events', async (c) => {
  const events = await c.env.DB.prepare('SELECT * FROM events ORDER BY data, ora_inizio').all();
  return c.json({ events: events.results });
});

// Richiesta disponibilità (User)
app.post('/availability', jwt({ secret: (c) => c.env.JWT_SECRET }), async (c) => {
  const payload = c.get('jwtPayload') as { id: number };
  const { event_id, note } = await c.req.json();

  await c.env.DB.prepare(
    'INSERT INTO availability_requests (event_id, user_id, note) VALUES (?, ?, ?) ON CONFLICT(event_id, user_id) DO UPDATE SET note = ?, stato = "pending"'
  )
    .bind(event_id, payload.id, note ?? null, note ?? null)
    .run();

  return c.json({ ok: true });
});

// Assegna utente a evento (Admin)
app.post('/assignments', jwt({ secret: (c) => c.env.JWT_SECRET }), async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { event_id, user_id, ruolo, confermato } = await c.req.json();
  await c.env.DB.prepare(
    'INSERT INTO assignments (event_id, user_id, ruolo, confermato) VALUES (?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO UPDATE SET ruolo = ?, confermato = ?'
  )
    .bind(event_id, user_id, ruolo ?? null, confermato ? 1 : 0, ruolo ?? null, confermato ? 1 : 0)
    .run();

  return c.json({ ok: true });
});

// Assegna TL (Admin)
app.post('/tl-assignments', jwt({ secret: (c) => c.env.JWT_SECRET }), async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { event_id, user_id } = await c.req.json();
  await c.env.DB.prepare(
    'INSERT INTO tl_assignments (event_id, user_id) VALUES (?, ?) ON CONFLICT(event_id, user_id) DO NOTHING'
  )
    .bind(event_id, user_id)
    .run();

  return c.json({ ok: true });
});

// Helper password (semplificati per ora)
async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password + '-static-salt-demo');
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const expected = await hashPassword(password);
  return expected === hash;
}

async function createToken(secret: string, payload: object): Promise<string> {
  const header = new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = new TextEncoder().encode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const toSign = new Uint8Array(header.length + 1 + body.length);
  toSign.set(header);
  toSign.set([46], header.length);
  toSign.set(body, header.length + 1);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, toSign);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${btoa(String.fromCharCode(...header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${btoa(String.fromCharCode(...body)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${sigB64}`;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

export default app;
