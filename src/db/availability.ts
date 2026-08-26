import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface Availability {
  id: number;
  collaborator_id: number;
  event_id: number;
  is_available: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Dati joined
  collaborator_name?: string;
  event_title?: string;
  event_code?: string;
}

export async function getAllAvailability(db: D1Database): Promise<Availability[]> {
  return dbQuery<Availability>(
    db,
    `SELECT a.*, u.name as collaborator_name, e.title as event_title, e.code as event_code
     FROM availability a
     JOIN collaborators c ON a.collaborator_id = c.id
     JOIN users u ON c.user_id = u.id
     JOIN events e ON a.event_id = e.id
     ORDER BY e.start_date ASC, u.name ASC`
  );
}

export async function getAvailabilityByCollaborator(db: D1Database, collaborator_id: number): Promise<Availability[]> {
  return dbQuery<Availability>(
    db,
    `SELECT a.*, u.name as collaborator_name, e.title as event_title, e.code as event_code
     FROM availability a
     JOIN events e ON a.event_id = e.id
     JOIN collaborators c ON a.collaborator_id = c.id
     JOIN users u ON c.user_id = u.id
     WHERE a.collaborator_id = ?
     ORDER BY e.start_date ASC`,
    [collaborator_id]
  );
}

export async function getAvailabilityByEvent(db: D1Database, event_id: number): Promise<Availability[]> {
  return dbQuery<Availability>(
    db,
    `SELECT a.*, u.name as collaborator_name, e.title as event_title, e.code as event_code
     FROM availability a
     JOIN collaborators c ON a.collaborator_id = c.id
     JOIN users u ON c.user_id = u.id
     JOIN events e ON a.event_id = e.id
     WHERE a.event_id = ?
     ORDER BY u.name ASC`,
    [event_id]
  );
}

export async function setAvailability(
  db: D1Database,
  collaborator_id: number,
  event_id: number,
  is_available: number,
  notes?: string
): Promise<Availability> {
  await dbExec(
    db,
    `INSERT INTO availability (collaborator_id, event_id, is_available, notes)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(collaborator_id, event_id) DO UPDATE SET
       is_available = excluded.is_available,
       notes = excluded.notes,
       updated_at = CURRENT_TIMESTAMP`,
    [collaborator_id, event_id, is_available, notes || null]
  );
  
  const rows = await dbQuery<Availability>(
    db,
    `SELECT a.*, u.name as collaborator_name, e.title as event_title, e.code as event_code
     FROM availability a
     JOIN events e ON a.event_id = e.id
     JOIN collaborators c ON a.collaborator_id = c.id
     JOIN users u ON c.user_id = u.id
     WHERE a.collaborator_id = ? AND a.event_id = ?`,
    [collaborator_id, event_id]
  );
  
  return rows[0];
}

export async function deleteAvailability(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM availability WHERE id = ?', [id]);
}
