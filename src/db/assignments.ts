import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface Assignment {
  id: number;
  collaborator_id: number;
  event_id: number;
  costume_id?: number;
  material_id?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Dati joined
  collaborator_name?: string;
  event_title?: string;
  costume_name?: string;
  material_name?: string;
}

export async function getAllAssignments(db: D1Database): Promise<Assignment[]> {
  return dbQuery<Assignment>(
    db,
    `SELECT a.*, 
            u.name as collaborator_name, 
            e.title as event_title,
            c.name as costume_name,
            m.name as material_name
     FROM assignments a
     JOIN collaborators col ON a.collaborator_id = col.id
     JOIN users u ON col.user_id = u.id
     JOIN events e ON a.event_id = e.id
     LEFT JOIN costumes c ON a.costume_id = c.id
     LEFT JOIN materials m ON a.material_id = m.id
     ORDER BY e.start_date ASC, u.name ASC`
  );
}

export async function getAssignmentById(db: D1Database, id: number): Promise<Assignment | null> {
  return dbFirst<Assignment>(
    db,
    `SELECT a.*, 
            u.name as collaborator_name, 
            e.title as event_title,
            c.name as costume_name,
            m.name as material_name
     FROM assignments a
     JOIN collaborators col ON a.collaborator_id = col.id
     JOIN users u ON col.user_id = u.id
     JOIN events e ON a.event_id = e.id
     LEFT JOIN costumes c ON a.costume_id = c.id
     LEFT JOIN materials m ON a.material_id = m.id
     WHERE a.id = ?`,
    [id]
  );
}

export async function createAssignment(
  db: D1Database,
  collaborator_id: number,
  event_id: number,
  costume_id?: number,
  material_id?: number,
  notes?: string
): Promise<Assignment> {
  await dbExec(
    db,
    `INSERT INTO assignments (collaborator_id, event_id, costume_id, material_id, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [collaborator_id, event_id, costume_id || null, material_id || null, notes || null]
  );
  const rows = await dbQuery<{ last_row_id: number }>(db, 'SELECT last_insert_rowid() as last_row_id');
  const assignment = await getAssignmentById(db, rows[0].last_row_id);
  if (!assignment) throw new Error('Assignment creation failed');
  return assignment;
}

export async function updateAssignment(
  db: D1Database,
  id: number,
  updates: Partial<Pick<Assignment, 'costume_id' | 'material_id' | 'notes'>>
): Promise<Assignment> {
  const fields = [];
  const values: unknown[] = [];
  
  if (updates.costume_id !== undefined) { fields.push('costume_id = ?'); values.push(updates.costume_id); }
  if (updates.material_id !== undefined) { fields.push('material_id = ?'); values.push(updates.material_id); }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  await dbExec(db, `UPDATE assignments SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const assignment = await getAssignmentById(db, id);
  if (!assignment) throw new Error('Assignment not found');
  return assignment;
}

export async function deleteAssignment(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM assignments WHERE id = ?', [id]);
}
