import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface Material {
  id: number;
  name: string;
  description?: string;
  quantity: number;
  event_id?: number;
  image_url?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  // Dati joined da events
  event_title?: string;
  event_code?: string;
}

export async function getAllMaterials(db: D1Database): Promise<Material[]> {
  return dbQuery<Material>(
    db,
    `SELECT m.*, e.title as event_title, e.code as event_code
     FROM materials m
     LEFT JOIN events e ON m.event_id = e.id
     WHERE m.is_active = 1
     ORDER BY m.name ASC`
  );
}

export async function getMaterialById(db: D1Database, id: number): Promise<Material | null> {
  return dbFirst<Material>(
    db,
    `SELECT m.*, e.title as event_title, e.code as event_code
     FROM materials m
     LEFT JOIN events e ON m.event_id = e.id
     WHERE m.id = ?`,
    [id]
  );
}

export async function createMaterial(
  db: D1Database,
  name: string,
  description?: string,
  quantity: number = 1,
  event_id?: number,
  image_url?: string
): Promise<Material> {
  await dbExec(
    db,
    `INSERT INTO materials (name, description, quantity, event_id, image_url)
     VALUES (?, ?, ?, ?, ?)`,
    [name, description || null, quantity, event_id || null, image_url || null]
  );
  const rows = await dbQuery<{ last_row_id: number }>(db, 'SELECT last_insert_rowid() as last_row_id');
  const material = await getMaterialById(db, rows[0].last_row_id);
  if (!material) throw new Error('Material creation failed');
  return material;
}

export async function updateMaterial(
  db: D1Database,
  id: number,
  updates: Partial<Pick<Material, 'name' | 'description' | 'quantity' | 'event_id' | 'image_url' | 'is_active'>>
): Promise<Material> {
  const fields = [];
  const values: unknown[] = [];
  
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.quantity !== undefined) { fields.push('quantity = ?'); values.push(updates.quantity); }
  if (updates.event_id !== undefined) { fields.push('event_id = ?'); values.push(updates.event_id); }
  if (updates.image_url !== undefined) { fields.push('image_url = ?'); values.push(updates.image_url); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  await dbExec(db, `UPDATE materials SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const material = await getMaterialById(db, id);
  if (!material) throw new Error('Material not found');
  return material;
}

export async function deleteMaterial(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM materials WHERE id = ?', [id]);
}
