import { D1Database } from '@cloudflare/workers-types';
import { dbQuery, dbFirst, dbExec } from './index';

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
  // Dati joined
  user_name?: string;
}

export async function getAllNotifications(db: D1Database): Promise<Notification[]> {
  return dbQuery<Notification>(
    db,
    `SELECT n.*, u.name as user_name
     FROM notifications n
     JOIN users u ON n.user_id = u.id
     ORDER BY n.created_at DESC`
  );
}

export async function getNotificationsByUser(db: D1Database, user_id: number, limit: number = 50): Promise<Notification[]> {
  return dbQuery<Notification>(
    db,
    `SELECT n.*, u.name as user_name
     FROM notifications n
     JOIN users u ON n.user_id = u.id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [user_id, limit]
  );
}

export async function getUnreadNotificationsByUser(db: D1Database, user_id: number): Promise<Notification[]> {
  return dbQuery<Notification>(
    db,
    `SELECT n.*, u.name as user_name
     FROM notifications n
     JOIN users u ON n.user_id = u.id
     WHERE n.user_id = ? AND n.is_read = 0
     ORDER BY n.created_at DESC`,
    [user_id]
  );
}

export async function createNotification(
  db: D1Database,
  user_id: number,
  title: string,
  message: string,
  type: string = 'info'
): Promise<Notification> {
  await dbExec(
    db,
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES (?, ?, ?, ?)`,
    [user_id, title, message, type]
  );
  const rows = await dbQuery<{ last_row_id: number }>(db, 'SELECT last_insert_rowid() as last_row_id');
  const notification = await dbFirst<Notification>(
    db,
    `SELECT n.*, u.name as user_name
     FROM notifications n
     JOIN users u ON n.user_id = u.id
     WHERE n.id = ?`,
    [rows[0].last_row_id]
  );
  if (!notification) throw new Error('Notification creation failed');
  return notification;
}

export async function markNotificationAsRead(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
}

export async function markAllNotificationsAsRead(db: D1Database, user_id: number): Promise<void> {
  await dbExec(db, 'UPDATE notifications SET is_read = 1 WHERE user_id = ?', [user_id]);
}

export async function deleteNotification(db: D1Database, id: number): Promise<void> {
  await dbExec(db, 'DELETE FROM notifications WHERE id = ?', [id]);
}
