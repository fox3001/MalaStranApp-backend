import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

const auth = jwt({
  secret: (c) => c.env.JWT_SECRET || 'dev-secret-change-me',
  alg: ['HS256'],
});

app.post('/auth/login', async (c) => {
  const body = await c.req.json();
  const { nome, cognome, password, adminOnly } = body as {
    nome?: string;
    cognome?: string;
    password: string;
    adminOnly?: boolean;
  };

  let user: any;

  // Login Admin: solo password
  if (adminOnly === true) {
    user = await c.env.DB.prepare('SELECT * FROM users WHERE ruolo = ?')
      .bind('admin')
      .first<any>();

    if (!user) return c.json({ error: 'Admin non trovato' }, 404);
    if (!(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: 'Password errata' }, 401);
    }
  } else {
    // Login User: nome + cognome + password
    if (!nome || !cognome) {
      return c.json({ error: 'Nome e cognome richiesti' }, 400);
    }

    user = await c.env.DB.prepare('SELECT * FROM users WHERE nome = ? AND cognome = ?')
      .bind(nome, cognome)
      .first<any>();

    if (!user) return c.json({ error: 'Utente non trovato' }, 404);
    if (user.ruolo === 'admin') {
      return c.json({ error: 'Usa accesso Admin' }, 403);
    }
    if (!(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: 'Password errata' }, 401);
    }
  }

  const token = await createToken(c.env.JWT_SECRET || 'dev-secret-change-me', {
    id: user.id,
    ruolo: user.ruolo,
  });

  return c.json({
    token,
    user: { id: user.id, nome: user.nome, cognome: user.cognome, ruolo: user.ruolo },
  });
});

app.get('/me', auth, async (c) => {
  const payload = c.get('jwtPayload') as { id: number };
  const user = await c.env.DB.prepare(
    'SELECT id, nome, cognome, email, ruolo FROM users WHERE id = ?',
  ).bind(payload.id).first();

  if (!user) return c.json({ error: 'Utente non trovato' }, 404);
  return c.json({ user });
});

app.post('/users', auth, async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { nome, cognome, email, ruolo = 'user' } = await c.req.json();
  const password = generatePassword();
  const password_hash = await hashPassword(password);
  const result = await c.env.DB.prepare(
    'INSERT INTO users (nome, cognome, email, password_hash, ruolo) VALUES (?, ?, ?, ?, ?) RETURNING id',
  ).bind(nome, cognome, email ?? null, password_hash, ruolo).first<any>();

  return c.json({ id: result?.id, password });
});

app.get('/users', auth, async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const users = await c.env.DB.prepare(
    'SELECT id, nome, cognome, email, ruolo FROM users ORDER BY cognome, nome',
  ).all();
  return c.json({ users: users.results });
});

app.post('/events', auth, async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string; id: number };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { titolo, data, ora_inizio, ora_fine, luogo, note } = await c.req.json();
  const result = await c.env.DB.prepare(
    'INSERT INTO events (titolo, data, ora_inizio, ora_fine, luogo, note, creato_da) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
  ).bind(titolo, data, ora_inizio, ora_fine, luogo ?? null, note ?? null, payload.id).first<any>();

  return c.json({ id: result?.id });
});

app.get('/events', async (c) => {
  const events = await c.env.DB.prepare(
    'SELECT * FROM events ORDER BY data, ora_inizio',
  ).all();
  return c.json({ events: events.results });
});

app.post('/availability', auth, async (c) => {
  const payload = c.get('jwtPayload') as { id: number };
  const { event_id, note } = await c.req.json();

  await c.env.DB.prepare(
    `INSERT INTO availability_requests (event_id, user_id, note)
     VALUES (?, ?, ?)
     ON CONFLICT(event_id, user_id)
     DO UPDATE SET note = excluded.note, stato = 'pending'`,
  ).bind(event_id, payload.id, note ?? null).run();

  return c.json({ ok: true });
});

app.post('/assignments', auth, async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { event_id, user_id, ruolo, confermato = false } = await c.req.json();
  await c.env.DB.prepare(
    `INSERT INTO assignments (event_id, user_id, ruolo, confermato)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(event_id, user_id)
     DO UPDATE SET ruolo = excluded.ruolo, confermato = excluded.confermato`,
  ).bind(event_id, user_id, ruolo ?? null, confermato ? 1 : 0).run();

  return c.json({ ok: true });
});

app.post('/tl-assignments', auth, async (c) => {
  const payload = c.get('jwtPayload') as { ruolo: string };
  if (payload.ruolo !== 'admin') return c.json({ error: 'Non autorizzato' }, 403);

  const { event_id, user_id } = await c.req.json();
  await c.env.DB.prepare(
    'INSERT INTO tl_assignments (event_id, user_id) VALUES (?, ?) ON CONFLICT(event_id, user_id) DO NOTHING',
  ).bind(event_id, user_id).run();

  return c.json({ ok: true });
});

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + '-static-salt-demo');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await hashPassword(password)) === hash;
}

async function createToken(secret: string, payload: object): Promise<string> {
  const encode = (value: Uint8Array) =>
    btoa(String.fromCharCode(...value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const header = new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = new TextEncoder().encode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const data = new TextEncoder().encode(`${encode(header)}.${encode(body)}`);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return `${encode(header)}.${encode(body)}.${encode(new Uint8Array(signature))}`;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

export default app;
