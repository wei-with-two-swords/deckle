import { app, protocol } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SCHEME = 'typstor';
const HOST = 'app';

/** 必须在 app ready 之前调用。 */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

function rendererRoot(): string {
  return path.resolve(app.getAppPath(), '.webpack/renderer');
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const root = rendererRoot();
  const rawPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const relative = rawPath === '' ? 'index.html' : rawPath;
  const file = path.resolve(root, relative);

  if (file !== root && !file.startsWith(root + path.sep)) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const body = await fs.readFile(file);
    return new Response(new Uint8Array(body), {
      headers: {
        'content-type':
          MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

export function registerProtocolHandler(): void {
  protocol.handle(SCHEME, (request) => serve(request));
}

export function appUrl(): string {
  return `${SCHEME}://${HOST}/main_window/index.html`;
}
