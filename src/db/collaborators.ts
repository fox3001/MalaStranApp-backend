import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface Collaborator {
  id: number;
  user_id: number;
  phone?: string;
  notes?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  // Dati joined da users
  email?: string;
  name?: string;
  role?: string;
  avatar_url?: string;
}

export async function getAllCollaborators(db: D1Database): Promise<Collaborator[]> {
  return dbQuery<Collaborator>(
    db,
    `SELECT c.*, u.email, u.name, u.role, u.avatar_url
     FROM collaborators c
     JOIN users u ON c.user_id = u.id
     WHERE c.is_active = 1
     ORDER BY u.name ASC`
  );
}

export async function getCollaboratorById(db: D1Database, id: number): Promise<Collaborator | null> {
  return dbFirst<Collaborator>(
    db,
    `SELECT c.*, u.email, u.name, u.role, u.avatar_url
     FROM collaborators c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`,
    [id]
  );
}

export async function getCollaboratorByUserId(db: D1Database, user_id: number): Promise<Collaborator | null> {
  return dbFirst<Collaborator>(
    db,
    `SELECT c.*, u.email, u.name, u.role, u.avatar_url
     FROM collaborators c
     JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`,
    [user_id]
  );
}

export async function createCollaborator(
  db: D1Database,
  user_id: number,
  phone?: string,
  notes?: string
): Promise<Collaborator> {
  await dbExec(
    db,
    `INSERT INTO collaborators (user_id, phone, notes) VALUES (?, ?, ?)`,
    [user_id, phone || null, notes || null]
  );
  const collaborator = await getCollaboratorByUserId(db, user_id);
  if (!collaborator) throw new Error('Collaborator creation failed');
  return collaborator;
}

export async function updateCollaborator(
  db: D1Database,
  id: number,
  updates: Partial<Pick<Collaborator, 'phone' | 'notes' | 'is_active'>>
): Promise<Collaborator> {
  const fields = [];
  const values: unknown[] = [];
  
  if (updates.phone !== undefined) { fields.push('phone = ?'); values.push(updates.phone); }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  await dbExec(db, `UPDATE collaborators SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const collaborator = await getCollaboratorById(db, id);
  if (!collaborator) throw new Error('Collaborator not found');
  return collaborator;
}

export async function deleteCollaborator(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM collaborators WHERE id = ?', [id]);
}
