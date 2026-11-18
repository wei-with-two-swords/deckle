import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectConfig } from '../shared/types';
import { touchRecentProject } from './db';
import { DEFAULT_WORKSPACE } from './projects';
import { readSettings, saveSettings } from './settings';

const TUTORIAL_DIR_NAME = 'typst-tutorial';
const TUTORIAL_NAME = 'Typst 语法教程';
const TUTORIAL_MAIN = 'main.typ';

function tutorialSourceDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'tutorial');
  return path.join(app.getAppPath(), 'resources', 'tutorial');
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * 首次启动时把内置教程复制成一个普通项目，并加入最近项目。
 * 只在成功播种后写入 settings.tutorialSeeded，用户删除教程后不会再次出现。
 */
export async function seedTutorialProject(): Promise<void> {
  // 冒烟测试使用真实 userData，不应被教程项目污染最近列表。
  if (process.env.DECKLE_SMOKE === '1') return;
  if (readSettings().tutorialSeeded) return;

  const source = tutorialSourceDir();
  if (!(await exists(path.join(source, TUTORIAL_MAIN)))) {
    console.warn('[deckle] tutorial assets not found:', source);
    return;
  }

  const root = path.join(app.getPath('userData'), 'samples', TUTORIAL_DIR_NAME);
  if (!(await exists(root))) {
    await fs.cp(source, root, { recursive: true });
  }

  const metaDir = path.join(root, '.deckle');
  const configPath = path.join(metaDir, 'project.json');
  if (!(await exists(configPath))) {
    const config: ProjectConfig = {
      version: 1,
      name: TUTORIAL_NAME,
      mainFile: TUTORIAL_MAIN,
      createdAt: new Date().toISOString(),
    };
    await writeJson(configPath, config);
  }

  const workspacePath = path.join(metaDir, 'workspace.json');
  if (!(await exists(workspacePath))) {
    await writeJson(workspacePath, {
      ...DEFAULT_WORKSPACE,
      openFile: TUTORIAL_MAIN,
    });
  }

  touchRecentProject({
    path: root,
    name: TUTORIAL_NAME,
    mainFile: TUTORIAL_MAIN,
  });
  saveSettings({ tutorialSeeded: true });
}
