import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface Costume {
  id: number;
  name: string;
  description?: string;
  size?: string;
  event_id?: number;
  image_url?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  // Dati joined da events
  event_title?: string;
  event_code?: string;
}

export async function getAllCostumes(db: D1Database): Promise<Costume[]> {
  return dbQuery<Costume>(
    db,
    `SELECT c.*, e.title as event_title, e.code as event_code
     FROM costumes c
     LEFT JOIN events e ON c.event_id = e.id
     WHERE c.is_active = 1
     ORDER BY c.name ASC`
  );
}

export async function getCostumeById(db: D1Database, id: number): Promise<Costume | null> {
  return dbFirst<Costume>(
    db,
    `SELECT c.*, e.title as event_title, e.code as event_code
     FROM costumes c
     LEFT JOIN events e ON c.event_id = e.id
     WHERE c.id = ?`,
    [id]
  );
}

export async function createCostume(
  db: D1Database,
  name: string,
  description?: string,
  size?: string,
  event_id?: number,
  image_url?: string
): Promise<Costume> {
  await dbExec(
    db,
    `INSERT INTO costumes (name, description, size, event_id, image_url)
     VALUES (?, ?, ?, ?, ?)`,
    [name, description || null, size || null, event_id || null, image_url || null]
  );
  const rows = await dbQuery<{ last_row_id: number }>(db, 'SELECT last_insert_rowid() as last_row_id');
  const costume = await getCostumeById(db, rows[0].last_row_id);
  if (!costume) throw new Error('Costume creation failed');
  return costume;
}

export async function updateCostume(
  db: D1Database,
  id: number,
  updates: Partial<Pick<Costume, 'name' | 'description' | 'size' | 'event_id' | 'image_url' | 'is_active'>>
): Promise<Costume> {
  const fields = [];
  const values: unknown[] = [];
  
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.size !== undefined) { fields.push('size = ?'); values.push(updates.size); }
  if (updates.event_id !== undefined) { fields.push('event_id = ?'); values.push(updates.event_id); }
  if (updates.image_url !== undefined) { fields.push('image_url = ?'); values.push(updates.image_url); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  await dbExec(db, `UPDATE costumes SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const costume = await getCostumeById(db, id);
  if (!costume) throw new Error('Costume not found');
  return costume;
}

export async function deleteCostume(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM costumes WHERE id = ?', [id]);
}
