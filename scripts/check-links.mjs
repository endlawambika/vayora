// Verifies that every internal link, asset reference and in-page anchor in dist/ resolves.
// Usage: node scripts/check-links.mjs   (run after `npm run build`)
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');
const problems = [];

async function walk(d) {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}
const exists = (p) => stat(p).then(() => true, () => false);
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const files = (await walk(DIST)).filter((f) => !f.endsWith('404.html'));
for (const file of files) {
  const html = await readFile(file, 'utf8');
  const own = ids(html);
  for (const [, ref] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:)/.test(ref)) continue;
    const [p, hash] = ref.split('#');
    if (!p) { if (hash && !own.has(hash)) problems.push(`${path.relative(DIST, file)}: missing anchor #${hash}`); continue; }
    let target = path.resolve(path.dirname(file), p);
    if (p.endsWith('/') || p === '.' || p === './') target = path.join(target, 'index.html');
    if (!(await exists(target))) { problems.push(`${path.relative(DIST, file)}: broken ${ref}`); continue; }
    if (hash && target.endsWith('.html') && !ids(await readFile(target, 'utf8')).has(hash))
      problems.push(`${path.relative(DIST, file)}: ${ref} -> anchor not found`);
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`All internal links, assets and anchors OK across ${files.length} pages.`);
