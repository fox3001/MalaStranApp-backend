import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, 
  getAllUsers, getUserByEmail, verifyPassword, createUser, updateUser,
  getAllEvents, getEventByCode, createEvent, updateEvent,
  getAllCollaborators, getCollaboratorByUserId, createCollaborator,
  getAllCostumes, createCostume,
  getAllMaterials, createMaterial,
  getAllAvailability, setAvailability,
  getAllAssignments, createAssignment,
  getNotificationsByUser, createNotification
} from './db';

const app = new Hono<{ Bindings: Env }>();

// CORS per permettere richieste dal frontend
app.use('*', cors());

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== AUTH ====================

app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    const db = c.env.DB;
    
    const user = await verifyPassword(db, email, password);
    if (!user) {
      return c.json({ error: 'Credenziali non valide' }, 401);
    }
    
    // Rimuovi password_hash dalla risposta
    const { password_hash, ...userWithoutPassword } = user;
    return c.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Errore nel login' }, 500);
  }
});

app.post('/api/auth/register', async (c) => {
  try {
    const { email, password, name, role = 'user' } = await c.req.json();
    const db = c.env.DB;
    
    // Verifica se utente esiste già
    const existing = await getUserByEmail(db, email);
    if (existing) {
      return c.json({ error: 'Email già registrata' }, 400);
    }
    
    const user = await createUser(db, email, password, name, role);
    const { password_hash, ...userWithoutPassword } = user;
    return c.json({ user: userWithoutPassword }, 201);
  } catch (error) {
    console.error('Register error:', error);
    return c.json({ error: 'Errore nella registrazione' }, 500);
  }
});

app.get('/api/users/me/:id', async (c) => {
  try {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'));
    const user = await getUserByEmail(db, String(id)); // workaround
    if (!user) {
      return c.json({ error: 'Utente non trovato' }, 404);
    }
    const { password_hash, ...userWithoutPassword } = user;
    return c.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Errore nel recupero utente' }, 500);
  }
});

// ==================== USERS ====================

app.get('/api/users', async (c) => {
  try {
    const db = c.env.DB;
    const users = await getAllUsers(db);
    const usersWithoutPassword = users.map(u => {
      const { password_hash, ...rest } = u;
      return rest;
    });
    return c.json({ users: usersWithoutPassword });
  } catch (error) {
    console.error('Get users error:', error);
    return c.json({ error: 'Errore nel recupero utenti' }, 500);
  }
});

// ==================== EVENTS ====================

app.get('/api/events', async (c) => {
  try {
    const db = c.env.DB;
    const events = await getAllEvents(db);
    return c.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    return c.json({ error: 'Errore nel recupero eventi' }, 500);
  }
});

app.get('/api/events/:code', async (c) => {
  try {
    const db = c.env.DB;
    const code = c.req.param('code');
    const event = await getEventByCode(db, code);
    if (!event) {
      return c.json({ error: 'Evento non trovato' }, 404);
    }
    return c.json({ event });
  } catch (error) {
    console.error('Get event error:', error);
    return c.json({ error: 'Errore nel recupero evento' }, 500);
  }
});

app.post('/api/events', async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json();
    const event = await createEvent(
      db,
      body.code,
      body.title,
      body.description,
      body.start_date,
      body.end_date,
      body.location,
      body.color
    );
    return c.json({ event }, 201);
  } catch (error) {
    console.error('Create event error:', error);
    return c.json({ error: 'Errore nella creazione evento' }, 500);
  }
});

app.put('/api/events/:id', async (c) => {
  try {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'));
    const updates = await c.req.json();
    const event = await updateEvent(db, id, updates);
    return c.json({ event });
  } catch (error) {
    console.error('Update event error:', error);
    return c.json({ error: 'Errore nell''aggiornamento evento' }, 500);
  }
});

// ==================== COLLABORATORS ====================

app.get('/api/collaborators', async (c) => {
  try {
    const db = c.env.DB;
    const collaborators = await getAllCollaborators(db);
    return c.json({ collaborators });
  } catch (error) {
    console.error('Get collaborators error:', error);
    return c.json({ error: 'Errore nel recupero collaboratori' }, 500);
  }
});

app.get('/api/collaborators/user/:userId', async (c) => {
  try {
    const db = c.env.DB;
    const userId = parseInt(c.req.param('userId'));
    const collaborator = await getCollaboratorByUserId(db, userId);
    if (!collaborator) {
      return c.json({ error: 'Collaboratore non trovato' }, 404);
    }
    return c.json({ collaborator });
  } catch (error) {
    console.error('Get collaborator error:', error);
    return c.json({ error: 'Errore nel recupero collaboratore' }, 500);
  }
});

app.post('/api/collaborators', async (c) => {
  try {
    const db = c.env.DB;
    const { user_id, phone, notes } = await c.req.json();
    const collaborator = await createCollaborator(db, user_id, phone, notes);
    return c.json({ collaborator }, 201);
  } catch (error) {
    console.error('Create collaborator error:', error);
    return c.json({ error: 'Errore nella creazione collaboratore' }, 500);
  }
});

// ==================== COSTUMES ====================

app.get('/api/costumes', async (c) => {
  try {
    const db = c.env.DB;
    const costumes = await getAllCostumes(db);
    return c.json({ costumes });
  } catch (error) {
    console.error('Get costumes error:', error);
    return c.json({ error: 'Errore nel recupero costumi' }, 500);
  }
});

app.post('/api/costumes', async (c) => {
  try {
    const db = c.env.DB;
    const { name, description, size, event_id, image_url } = await c.req.json();
    const costume = await createCostume(db, name, description, size, event_id, image_url);
    return c.json({ costume }, 201);
  } catch (error) {
    console.error('Create costume error:', error);
    return c.json({ error: 'Errore nella creazione costume' }, 500);
  }
});

// ==================== MATERIALS ====================

app.get('/api/materials', async (c) => {
  try {
    const db = c.env.DB;
    const materials = await getAllMaterials(db);
    return c.json({ materials });
  } catch (error) {
    console.error('Get materials error:', error);
    return c.json({ error: 'Errore nel recupero materiali' }, 500);
  }
});

app.post('/api/materials', async (c) => {
  try {
    const db = c.env.DB;
    const { name, description, quantity, event_id, image_url } = await c.req.json();
    const material = await createMaterial(db, name, description, quantity, event_id, image_url);
    return c.json({ material }, 201);
  } catch (error) {
    console.error('Create material error:', error);
    return c.json({ error: 'Errore nella creazione materiale' }, 500);
  }
});

// ==================== AVAILABILITY ====================

app.get('/api/availability', async (c) => {
  try {
    const db = c.env.DB;
    const availability = await getAllAvailability(db);
    return c.json({ availability });
  } catch (error) {
    console.error('Get availability error:', error);
    return c.json({ error: 'Errore nel recupero disponibilità' }, 500);
  }
});

app.post('/api/availability', async (c) => {
  try {
    const db = c.env.DB;
    const { collaborator_id, event_id, is_available, notes } = await c.req.json();
    const availability = await setAvailability(db, collaborator_id, event_id, is_available, notes);
    return c.json({ availability });
  } catch (error) {
    console.error('Set availability error:', error);
    return c.json({ error: 'Errore nel salvataggio disponibilità' }, 500);
  }
});

// ==================== ASSIGNMENTS ====================

app.get('/api/assignments', async (c) => {
  try {
    const db = c.env.DB;
    const assignments = await getAllAssignments(db);
    return c.json({ assignments });
  } catch (error) {
    console.error('Get assignments error:', error);
    return c.json({ error: 'Errore nel recupero assegnazioni' }, 500);
  }
});

app.post('/api/assignments', async (c) => {
  try {
    const db = c.env.DB;
    const { collaborator_id, event_id, costume_id, material_id, notes } = await c.req.json();
    const assignment = await createAssignment(db, collaborator_id, event_id, costume_id, material_id, notes);
    return c.json({ assignment }, 201);
  } catch (error) {
    console.error('Create assignment error:', error);
    return c.json({ error: 'Errore nella creazione assegnazione' }, 500);
  }
});

// ==================== NOTIFICATIONS ====================

app.get('/api/notifications/:userId', async (c) => {
  try {
    const db = c.env.DB;
    const userId = parseInt(c.req.param('userId'));
    const notifications = await getNotificationsByUser(db, userId);
    return c.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    return c.json({ error: 'Errore nel recupero notifiche' }, 500);
  }
});

app.post('/api/notifications', async (c) => {
  try {
    const db = c.env.DB;
    const { user_id, title, message, type } = await c.req.json();
    const notification = await createNotification(db, user_id, title, message, type);
    return c.json({ notification }, 201);
  } catch (error) {
    console.error('Create notification error:', error);
    return c.json({ error: 'Errore nella creazione notifica' }, 500);
  }
});

export default app;
