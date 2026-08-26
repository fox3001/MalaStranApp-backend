import { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
}

// Helper per eseguire query
export async function dbQuery<T>(db: D1Database, sql: string, params?: unknown[]): Promise<T[]> {
  const stmt = db.prepare(sql);
  const result = params ? stmt.bind(...params) : stmt;
  const { results } = await result.all<T>();
  return results || [];
}

// Helper per eseguire una singola query che ritorna un oggetto
export async function dbFirst<T>(db: D1Database, sql: string, params?: unknown[]): Promise<T | null> {
  const results = await dbQuery<T>(db, sql, params);
  return results[0] || null;
}

// Helper per eseguire query senza ritorno (INSERT, UPDATE, DELETE)
export async function dbExec(db: D1Database, sql: string, params?: unknown[]): Promise<void> {
  const stmt = db.prepare(sql);
  const result = params ? stmt.bind(...params) : stmt;
  await result.run();
}

// Export di funzioni specifiche per ogni tabella
export * from './users';
export * from './events';
export * from './collaborators';
export * from './costumes';
export * from './materials';
export * from './availability';
export * from './assignments';
export * from './notifications';
