/**
 * R8 Staff & Workforce OS — read helpers for staff list/detail/working.
 * Users table remains SoR. Does not own auth or mutations.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../db';

export const STAFF_SELECT_FIELDS =
  'id, name, email, role, (pin_hash IS NOT NULL) AS has_pin, is_active, created_at, updated_at';

export const VALID_STAFF_ROLES = ['owner', 'manager', 'cashier', 'waiter', 'chef'] as const;

export type StaffListQuery = {
  role?: string;
  active?: 'true' | 'false';
  search?: string;
};

function shiftsTableExists(db: Database.Database): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shifts'`)
    .get() as { name?: string } | undefined;
  return Boolean(row?.name);
}

export function listStaffMembers(query: StaffListQuery): Array<Record<string, unknown>> {
  const db = getDatabase();
  let sql = `SELECT ${STAFF_SELECT_FIELDS} FROM users WHERE 1=1`;
  const params: unknown[] = [];

  if (query.role) {
    sql += ' AND role = ?';
    params.push(query.role);
  }
  if (query.active === 'true') {
    sql += ' AND is_active = 1';
  }
  if (query.active === 'false') {
    sql += ' AND is_active = 0';
  }
  const search = query.search?.trim();
  if (search) {
    sql += " AND (name LIKE ? COLLATE NOCASE OR IFNULL(email, '') LIKE ? COLLATE NOCASE)";
    const like = `%${search}%`;
    params.push(like, like);
  }

  sql += ' ORDER BY role, name';
  return db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
}

export function getStaffMember(id: string): Record<string, unknown> | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT ${STAFF_SELECT_FIELDS} FROM users WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  return row || null;
}

export function getStaffTodayPerformance(userId: string): {
  orders_served: number;
  total_sales: number;
} {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT COUNT(*) as orders_served, COALESCE(SUM(total), 0) as total_sales
       FROM orders
       WHERE user_id = ? AND date(created_at) = date('now')`,
    )
    .get(userId) as { orders_served: number; total_sales: number };
  return {
    orders_served: Number(row?.orders_served || 0),
    total_sales: Number(row?.total_sales || 0),
  };
}

export function getStaffRecentShifts(userId: string, limit = 20): Array<Record<string, unknown>> {
  const db = getDatabase();
  if (!shiftsTableExists(db)) return [];
  return db
    .prepare(
      `SELECT id, status, terminal_id, opened_at, closed_at, opened_by_user_id, closed_by_user_id
       FROM shifts
       WHERE opened_by_user_id = ? OR closed_by_user_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(userId, userId, limit) as Array<Record<string, unknown>>;
}

export function getStaffOpenShiftCount(userId: string): number {
  const db = getDatabase();
  if (!shiftsTableExists(db)) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM shifts WHERE opened_by_user_id = ? AND status = 'open'`)
    .get(userId) as { c: number };
  return Number(row?.c || 0);
}

export function buildStaffDetail(id: string): Record<string, unknown> | null {
  const member = getStaffMember(id);
  if (!member) return null;
  return {
    ...member,
    performance: getStaffTodayPerformance(id),
    recent_shifts: getStaffRecentShifts(id),
    open_shift_count: getStaffOpenShiftCount(id),
  };
}

export type WorkingStaffRow = {
  user_id: string;
  name: string;
  role: string;
  shift_id: number;
  terminal_id: string;
  opened_at: string | null;
};

export function listCurrentlyWorkingStaff(): WorkingStaffRow[] {
  const db = getDatabase();
  if (!shiftsTableExists(db)) return [];
  return db
    .prepare(
      `SELECT
         u.id as user_id,
         u.name as name,
         u.role as role,
         s.id as shift_id,
         s.terminal_id as terminal_id,
         s.opened_at as opened_at
       FROM shifts s
       INNER JOIN users u ON u.id = s.opened_by_user_id
       WHERE s.status = 'open'
       ORDER BY s.opened_at DESC`,
    )
    .all() as WorkingStaffRow[];
}
