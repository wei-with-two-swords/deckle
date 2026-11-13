/** IPC 通道名，统一 domain:action。 */
export const CH = {
  WIN_MINIMIZE: 'win:minimize',
  WIN_TOGGLE_MAXIMIZE: 'win:toggleMaximize',
  WIN_IS_MAXIMIZED: 'win:isMaximized',
  WIN_CLOSE: 'win:close',
  WIN_MAXIMIZED_CHANGED: 'win:maximized-changed',

  PROJECT_CREATE: 'project:create',
  PROJECT_IMPORT: 'project:import',
  PROJECT_OPEN: 'project:open',
  PROJECT_RECENT: 'project:recent',
  PROJECT_REMOVE_RECENT: 'project:removeRecent',
  PROJECT_SAVE_WORKSPACE: 'project:saveWorkspace',
  PROJECT_UPDATE_CONFIG: 'project:updateConfig',
  PROJECT_SEARCH: 'project:search',
  PROJECT_WORD_COUNT: 'project:wordCount',
  PROJECT_THUMBNAIL: 'project:thumbnail',
  PROJECT_EXPORT_PDF: 'project:exportPdf',
  PROJECT_EXPORT_ARCHIVE: 'project:exportArchive',
  PROJECT_DELETE: 'project:delete',
  PROJECT_WATCH_STOP: 'project:stopWatch',
  PROJECT_WATCH_EVENT: 'project:watch-event',
  SNAPSHOT_SAVE: 'snapshot:save',
  SNAPSHOT_LIST: 'snapshot:list',
  SNAPSHOT_DELETE: 'snapshot:delete',
  SNAPSHOT_CLEAR: 'snapshot:clear',

  FS_READ_DIR: 'fs:readDir',
  FS_READ_FILE: 'fs:readFile',
  FS_WRITE_FILE: 'fs:writeFile',
  FS_CREATE_ENTRY: 'fs:createEntry',
  FS_RENAME_ENTRY: 'fs:renameEntry',
  FS_DELETE_ENTRY: 'fs:deleteEntry',
  FS_IMPORT_FILES: 'fs:importFiles',

  COMPILE_DOCUMENT: 'compile:document',
  EXPORT_PDF: 'export:pdf',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  FONTS_LIST: 'fonts:list',

  TEMPLATES_LIST: 'templates:list',
  TEMPLATES_IMPORT: 'templates:import',
  TEMPLATES_DELETE: 'templates:delete',

  APP_INFO: 'app:info',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  APP_SHOW_ITEM: 'app:showItem',
} as const;

export type Channel = (typeof CH)[keyof typeof CH];
