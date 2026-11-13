import { app } from 'electron';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RecentProject } from '../shared/types';
import { t } from './i18n';

let db: DatabaseSync | null = null;

interface RecentRow {
  path: string;
  name: string;
  main_file: string;
  opened_at: number;
  pinned: number;
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'typstor.db');
}

function migrate(handle: DatabaseSync): void {
  const row = handle.prepare('PRAGMA user_version').get() as
    | { user_version?: number }
    | undefined;
  const version = row?.user_version ?? 0;

  if (version < 1) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS recent_projects (
        path TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        main_file TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0
      );
      PRAGMA user_version = 1;
    `);
  }

  if (version < 2) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_file
        ON snapshots (project_path, file_path, created_at DESC);
      PRAGMA user_version = 2;
    `);
  }
}

export function initDb(): void {
  if (db) return;

  const target = filePath();
  mkdirSync(path.dirname(target), { recursive: true });

  const handle = new DatabaseSync(target);
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  migrate(handle);
  db = handle;
}

function requireDb(): DatabaseSync {
  if (!db) {
    throw new Error(t('数据库尚未初始化'));
  }
  return db;
}

function projectTimes(
  projectPath: string,
  mainFile: string,
  fallback: number,
): { createdAt: number; modifiedAt: number } {
  try {
    const dir = statSync(projectPath);
    const createdAt = dir.birthtimeMs > 0 ? dir.birthtimeMs : fallback;
    let modifiedAt = dir.mtimeMs;
    try {
      const main = statSync(path.join(projectPath, mainFile));
      modifiedAt = Math.max(modifiedAt, main.mtimeMs);
    } catch {
      // 主文件可能已被移走，目录 mtime 仍可用
    }
    return { createdAt, modifiedAt };
  } catch {
    return { createdAt: fallback, modifiedAt: fallback };
  }
}

export function listRecentProjects(limit = 50): RecentProject[] {
  const rows = requireDb()
    .prepare(
      `SELECT path, name, main_file, opened_at, pinned
       FROM recent_projects
       ORDER BY pinned DESC, opened_at DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as RecentRow[];

  return rows.map((row) => {
    const times = projectTimes(row.path, row.main_file, row.opened_at);
    return {
      path: row.path,
      name: row.name,
      mainFile: row.main_file,
      openedAt: row.opened_at,
      createdAt: times.createdAt,
      modifiedAt: times.modifiedAt,
      pinned: row.pinned !== 0,
    };
  });
}

export function touchRecentProject(project: {
  path: string;
  name: string;
  mainFile: string;
}): void {
  const handle = requireDb();
  handle
    .prepare(
      `INSERT INTO recent_projects(path, name, main_file, opened_at, pinned)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(path) DO UPDATE SET
         name = excluded.name,
         main_file = excluded.main_file,
         opened_at = excluded.opened_at`,
    )
    .run(project.path, project.name, project.mainFile, Date.now());

  handle.exec(`
    DELETE FROM recent_projects
    WHERE pinned = 0 AND path NOT IN (
      SELECT path FROM recent_projects ORDER BY pinned DESC, opened_at DESC LIMIT 50
    )
  `);
}

export function removeRecentProject(projectPath: string): void {
  requireDb()
    .prepare('DELETE FROM recent_projects WHERE path = ?')
    .run(projectPath);
}

interface SnapshotRow {
  id: number;
  project_path: string;
  file_path: string;
  content: string;
  created_at: number;
}

export function saveSnapshot(
  projectPath: string,
  filePath: string,
  content: string,
): void {
  const handle = requireDb();
  handle
    .prepare(
      `INSERT INTO snapshots (project_path, file_path, content, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(projectPath, filePath, content, Date.now());
  handle
    .prepare(
      `DELETE FROM snapshots
       WHERE project_path = ? AND file_path = ? AND id NOT IN (
         SELECT id FROM snapshots
         WHERE project_path = ? AND file_path = ?
         ORDER BY id DESC LIMIT 20
       )`,
    )
    .run(projectPath, filePath, projectPath, filePath);
}

export function latestSnapshots(projectPath: string): SnapshotRow[] {
  return requireDb()
    .prepare(
      `SELECT s.* FROM snapshots s
       JOIN (
         SELECT file_path, MAX(id) AS max_id
         FROM snapshots WHERE project_path = ?
         GROUP BY file_path
       ) latest ON latest.max_id = s.id
       ORDER BY s.created_at DESC`,
    )
    .all(projectPath) as unknown as SnapshotRow[];
}

export function removeSnapshot(id: number): void {
  requireDb().prepare('DELETE FROM snapshots WHERE id = ?').run(id);
}

export function clearSnapshots(projectPath: string): void {
  requireDb()
    .prepare('DELETE FROM snapshots WHERE project_path = ?')
    .run(projectPath);
}

export function snapshotPreview(content: string): string {
  const line = content
    .split(/\r\n|\n|\r/)
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  return (line ?? '').slice(0, 120);
}

export function closeDb(): void {
  db?.close();
  db = null;
}
