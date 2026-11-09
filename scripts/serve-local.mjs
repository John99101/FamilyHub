// Local web server for testing on this computer only (npm run emulators).
//
// Why not the Hosting emulator? With current Node versions it silently drops
// the custom headers from firebase.json, so the Content Security Policy could
// not be tested. This server applies exactly the headers from firebase.json.
// The only change: the policy also allows the local Auth and Firestore
// emulators, and http is not upgraded to https.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hosting = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')).hosting;
const publicDir = join(root, hosting.public);
const PORT = Number(process.env.PORT || 5000);
const EMULATORS = 'http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:5001';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

// Minimal glob support for the patterns used in firebase.json: **, *, @(a|b).
function globToRegExp(glob) {
  const escape = (s) => s.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 1;
      if (glob[i + 1] === '/') i += 1;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '@' && glob[i + 1] === '(') {
      const end = glob.indexOf(')', i);
      re += `(${glob.slice(i + 2, end).split('|').map(escape).join('|')})`;
      i = end;
    } else {
      re += escape(c);
    }
  }
  return new RegExp(`^${re}$`);
}

function localPolicy(value) {
  return value.split(';').map((p) => p.trim())
    .filter((p) => p && p !== 'upgrade-insecure-requests')
    .map((p) => (p.startsWith('connect-src') || p.startsWith('frame-src') ? `${p} ${EMULATORS}` : p))
    .join('; ');
}

const headerRules = hosting.headers.map((rule) => ({
  match: globToRegExp(rule.source.startsWith('/') || rule.source.startsWith('**') ? rule.source : `/${rule.source}`),
  headers: rule.headers.map((h) => ({ key: h.key, value: h.key === 'Content-Security-Policy' ? localPolicy(h.value) : h.value })),
}));

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(publicDir, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(publicDir + sep) && file !== publicDir) { res.writeHead(403).end(); return; }
  for (const rule of headerRules) {
    if (rule.match.test(pathname)) for (const h of rule.headers) res.setHeader(h.key, h.value);
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Nicht gefunden');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`FamilyHub local site: http://127.0.0.1:${PORT}  (stop with Ctrl+C)`);
});
