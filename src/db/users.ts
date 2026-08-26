import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'user';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export async function getAllUsers(db: D1Database): Promise<User[]> {
  return dbQuery<User>(db, 'SELECT * FROM users ORDER BY created_at DESC');
}

export async function getUserById(db: D1Database, id: number): Promise<User | null> {
  return dbFirst<User>(db, 'SELECT * FROM users WHERE id = ?', [id]);
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return dbFirst<User>(db, 'SELECT * FROM users WHERE email = ?', [email]);
}

export async function createUser(
  db: D1Database,
  email: string,
  password_hash: string,
  name: string,
  role: 'admin' | 'user' = 'user'
): Promise<User> {
  await dbExec(
    db,
    `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)`,
    [email, password_hash, name, role]
  );
  const user = await getUserByEmail(db, email);
  if (!user) throw new Error('User creation failed');
  return user;
}

export async function updateUser(
  db: D1Database,
  id: number,
  updates: Partial<Pick<User, 'name' | 'email' | 'avatar_url'>>
): Promise<User> {
  const fields = [];
  const values: unknown[] = [];
  
  if (updates.name) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.email) { fields.push('email = ?'); values.push(updates.email); }
  if (updates.avatar_url) { fields.push('avatar_url = ?'); values.push(updates.avatar_url); }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  await dbExec(db, `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const user = await getUserById(db, id);
  if (!user) throw new Error('User not found');
  return user;
}

export async function deleteUser(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM users WHERE id = ?', [id]);
}

export async function verifyPassword(db: D1Database, email: string, password: string): Promise<User | null> {
  const user = await getUserByEmail(db, email);
  if (!user) return null;
  
  // In produzione usa bcrypt o simile
  // Per ora confronto semplice (da migliorare!)
  if (user.password_hash === password) {
    return user;
  }
  return null;
}
