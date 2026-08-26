import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface Event {
  id: number;
  code: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  color: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export async function getAllEvents(db: D1Database): Promise<Event[]> {
  return dbQuery<Event>(db, 'SELECT * FROM events WHERE is_active = 1 ORDER BY start_date ASC');
}

export async function getEventById(db: D1Database, id: number): Promise<Event | null> {
  return dbFirst<Event>(db, 'SELECT * FROM events WHERE id = ?', [id]);
}

export async function getEventByCode(db: D1Database, code: string): Promise<Event | null> {
  return dbFirst<Event>(db, 'SELECT * FROM events WHERE code = ?', [code]);
}

export async function createEvent(
  db: D1Database,
  code: string,
  title: string,
  description?: string,
  start_date?: string,
  end_date?: string,
  location?: string,
  color?: string
): Promise<Event> {
  await dbExec(
    db,
    `INSERT INTO events (code, title, description, start_date, end_date, location, color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [code, title, description || null, start_date || null, end_date || null, location || null, color || '#3b82f6']
  );
  const event = await getEventByCode(db, code);
  if (!event) throw new Error('Event creation failed');
  return event;
}

export async function updateEvent(
  db: D1Database,
  id: number,
  updates: Partial<Pick<Event, 'code' | 'title' | 'description' | 'start_date' | 'end_date' | 'location' | 'color' | 'is_active'>>
): Promise<Event> {
  const fields = [];
  const values: unknown[] = [];
  
  if (updates.code !== undefined) { fields.push('code = ?'); values.push(updates.code); }
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.start_date !== undefined) { fields.push('start_date = ?'); values.push(updates.start_date); }
  if (updates.end_date !== undefined) { fields.push('end_date = ?'); values.push(updates.end_date); }
  if (updates.location !== undefined) { fields.push('location = ?'); values.push(updates.location); }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  await dbExec(db, `UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const event = await getEventById(db, id);
  if (!event) throw new Error('Event not found');
  return event;
}

export async function deleteEvent(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM events WHERE id = ?', [id]);
}
