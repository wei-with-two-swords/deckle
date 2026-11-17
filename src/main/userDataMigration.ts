import { app } from 'electron';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';

const LEGACY_DIR = 'typstor';
const LEGACY_DB = 'typstor.db';
const NEW_DB = 'deckle.db';
const DB_SUFFIXES = ['', '-wal', '-shm'];

/**
 * 1.0 版把数据放在 %APPDATA%\typstor。改名后 userData 变成 %APPDATA%\Deckle，
 * 首次启动时把旧目录里的项目记录、快照、模板与设置复制过来。
 * 只复制数据文件，不复制 Chromium 缓存；不覆盖新版本已经写入的数据。
 */
export function migrateLegacyUserData(): void {
  const legacyRoot = path.join(app.getPath('appData'), LEGACY_DIR);
  const currentRoot = app.getPath('userData');
  if (!existsSync(legacyRoot)) return;

  try {
    mkdirSync(currentRoot, { recursive: true });
    const currentDb = path.join(currentRoot, NEW_DB);

    // 新库已存在时不再复制旧库，避免两份数据库同时出现。
    if (!existsSync(currentDb)) {
      for (const suffix of DB_SUFFIXES) {
        const source = path.join(legacyRoot, `${LEGACY_DB}${suffix}`);
        const target = path.join(currentRoot, `${LEGACY_DB}${suffix}`);
        if (existsSync(source) && !existsSync(target)) {
          copyFileSync(source, target);
        }
      }

      for (const suffix of DB_SUFFIXES) {
        const legacyDb = path.join(currentRoot, `${LEGACY_DB}${suffix}`);
        const deckleDb = path.join(currentRoot, `${NEW_DB}${suffix}`);
        if (existsSync(legacyDb) && !existsSync(deckleDb)) {
          renameSync(legacyDb, deckleDb);
        }
      }
    }

    for (const name of ['settings.json']) {
      const source = path.join(legacyRoot, name);
      const target = path.join(currentRoot, name);
      if (existsSync(source) && !existsSync(target)) {
        copyFileSync(source, target);
      }
    }

    const legacyTemplates = path.join(legacyRoot, 'templates');
    const currentTemplates = path.join(currentRoot, 'templates');
    if (existsSync(legacyTemplates) && !existsSync(currentTemplates)) {
      cpSync(legacyTemplates, currentTemplates, { recursive: true });
    }
  } catch (error) {
    console.error('[deckle] user data migration failed:', error);
  }
}
