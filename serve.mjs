// Tiny zero-dependency static server for local testing of dist/ (behaves like GitHub Pages).
// Usage: node serve.mjs [folder] [port]   ->   http://localhost:4173
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.ico': 'image/x-icon',
};

async function resolve(urlPath) {
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(dir, safe);
  if (!file.startsWith(dir)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    // Like GitHub Pages: /product serves product.html
    for (const alt of [file + '.html', file + '/index.html']) {
      try { await stat(alt); return alt; } catch { /* try next */ }
    }
    return null;
  }
}

createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://x').pathname;
  // Redirect /product -> /product/ so relative asset paths resolve like on Netlify/Vercel.
  if (!path.extname(urlPath) && !urlPath.endsWith('/')) {
    try {
      if ((await stat(path.join(dir, decodeURIComponent(urlPath)))).isDirectory()) {
        res.writeHead(301, { Location: urlPath + '/' }); return res.end();
      }
    } catch { /* not a directory */ }
  }
  const file = await resolve(urlPath);
  if (!file) {
    const nf = await readFile(path.join(dir, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'Content-Type': types['.html'] });
    return res.end(nf);
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));
