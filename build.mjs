// Vayora website builder — zero dependencies, Node 18+.
//
// Assembles the pages in src/pages with the shared partials in src/partials,
// inlines Lucide icons and SVG artwork, and writes two outputs:
//
//   dist/      Flat multi-page static site: index.html, product.html, pricing.html, inside.html,
//              404.html, assets/, CNAME, .nojekyll, robots.txt, sitemap.xml.
//              Upload the CONTENTS of this folder to GitHub Pages (or any static host).
//   preview/   One self-contained index.html with hash routing (#product, #pricing, #inside).
//              Handy for sharing as a single file or opening without a server.
//
// Usage:  node build.mjs            (or: npm run build)
//         SITE_URL=https://other.example node build.mjs   -> override the site address in src/site.json
//         SITE_URL= node build.mjs                        -> no absolute URLs, no CNAME (e.g. for a github.io test)

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const PREVIEW = path.join(ROOT, 'preview');
const site = JSON.parse(await readFile(path.join(SRC, 'site.json'), 'utf8'));
const SITE_URL = (process.env.SITE_URL ?? site.siteUrl ?? '').replace(/\/$/, '');
const DOMAIN = SITE_URL ? new URL(SITE_URL).hostname : '';
const cache = new Map();
const FONTS = ['inter-latin-wght-normal.woff2', 'manrope-latin-wght-normal.woff2'];

async function read(file) {
  if (!cache.has(file)) cache.set(file, await readFile(file, 'utf8'));
  return cache.get(file);
}

// ---------- token helpers ----------

async function icon(name) {
  let svg = await read(path.join(SRC, 'assets/icons', `${name}.svg`)).catch(() => {
    throw new Error(`Unknown icon "${name}" — copy it into src/assets/icons/`);
  });
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/class="[^"]*"/, 'class="icon" aria-hidden="true" focusable="false"')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

// Artwork can appear more than once in a document (e.g. in the single-file preview),
// so every repeat gets its internal ids suffixed to keep ids unique and gradients/titles working.
let artUses = new Map();
function resetArtUses() { artUses = new Map(); }

async function art(name) {
  let svg = await read(path.join(SRC, 'art', `${name}.svg`)).catch(() => {
    throw new Error(`Unknown artwork "${name}" — expected src/art/${name}.svg`);
  });
  svg = svg.replace(/<\?xml[^>]*>/, '').trim();
  const n = (artUses.get(name) || 0) + 1;
  artUses.set(name, n);
  if (n > 1) {
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) {
      const re = new RegExp(`(id="|url\\(#|aria-labelledby="|href="#)${id}(?=[")])`, 'g');
      svg = svg.replace(re, `$1${id}-${n}`);
    }
  }
  return svg;
}

function pageBySlug(slug) {
  const p = site.pages.find((x) => x.slug === slug);
  if (!p) throw new Error(`Unknown page "${slug}" in link token`);
  return p;
}

function rootFor(page, mode) {
  if (mode === 'preview') return '';
  if (mode === 'absolute') return '/';
  const depth = (page.route.match(/\//g) || []).length;
  return depth ? '../'.repeat(depth) : '';
}

function link(target, page, mode) {
  const [slug, anchor] = target.split('#');
  const dest = pageBySlug(slug);
  if (mode === 'preview') return anchor ? `#${anchor}` : `#${dest.slug}`;
  if (anchor && dest.slug === page.slug) return `#${anchor}`;
  if (mode === 'absolute' && dest.slug === 'home') return '/' + (anchor ? `#${anchor}` : '');
  return rootFor(page, mode) + dest.route + (anchor ? `#${anchor}` : '');
}

async function expandPartials(html, depth = 0) {
  if (depth > 10) throw new Error('Partial nesting too deep');
  const names = [...html.matchAll(/\{\{>\s*([\w-]+)\s*\}\}/g)].map((m) => m[1]);
  if (!names.length) return html;
  for (const name of new Set(names)) {
    const body = await read(path.join(SRC, 'partials', `${name}.html`)).catch(() => {
      throw new Error(`Unknown partial "${name}"`);
    });
    html = html.replaceAll(new RegExp(`\\{\\{>\\s*${name}\\s*\\}\\}`, 'g'), () => body);
  }
  return expandPartials(html, depth + 1);
}

async function replaceAsync(str, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  parts.push(str.slice(last));
  return parts.join('');
}

const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

// {{asset:img/photos/x.webp}} -> a relative path in dist/, an embedded data: URI in the single-file preview.
async function asset(rel, page, mode) {
  const file = path.join(SRC, 'assets', rel);
  if (mode !== 'preview') {
    await readFile(file).catch(() => { throw new Error(`Missing asset ${rel}`); });
    return rootFor(page, mode) + 'assets/' + rel;
  }
  const bytes = await readFile(file);
  return `data:${MIME[path.extname(rel)] || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
}

async function render(html, page, mode) {
  html = await expandPartials(html);
  html = await replaceAsync(html, /\{\{asset:([\w./-]+)\}\}/g, (_, r) => asset(r, page, mode));
  html = await replaceAsync(html, /\{\{art:([\w-]+)\}\}/g, (_, n) => art(n));
  html = await replaceAsync(html, /\{\{icon:([\w-]+)\}\}/g, (_, n) => icon(n));
  html = html.replace(/\{\{link:([\w-]+(?:#[\w-]+)?)\}\}/g, (_, t) => link(t, page, mode));
  html = html.replace(/\{\{current:([\w-]+)\}\}/g, (_, s) =>
    mode !== 'preview' && s === page.slug ? 'aria-current="page"' : ''
  );
  html = html.replaceAll('{{root}}', () => rootFor(page, mode));
  html = html.replaceAll('{{year}}', String(new Date().getFullYear()));
  return html;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function headMeta(page, mode) {
  const url = SITE_URL && page.slug !== '404' ? `${SITE_URL}/${page.route === 'index.html' ? '' : page.route}` : '';
  const ogImage = SITE_URL ? `${SITE_URL}/assets/img/og-image.png` : `${rootFor(page, mode)}assets/img/og-image.png`;
  const lines = [
    `<title>${page.title}</title>`,
    `<meta name="description" content="${escapeAttr(page.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Vayora">`,
    `<meta property="og:title" content="${escapeAttr(page.title)}">`,
    `<meta property="og:description" content="${escapeAttr(page.description)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (mode !== 'preview') lines.push(`<meta property="og:image" content="${ogImage}">`);
  if (url) lines.push(`<link rel="canonical" href="${url}">`, `<meta property="og:url" content="${url}">`);
  if (page.noindex) lines.push(`<meta name="robots" content="noindex">`);
  return lines.join('\n  ');
}

// On https://<user>.github.io/<repo>/, a missing deep URL still serves 404.html; this makes its
// relative links resolve from the repository folder.
const BASE_FOR_PROJECT_SITE = `<script>(function(){var h=location.hostname,s=location.pathname.split('/')[1];if(/\\.github\\.io$/.test(h)&&s&&!/\\./.test(s))document.write('<base href="/'+s+'/">');})();</script>\n  `;

async function inlineFonts(css) {
  for (const f of FONTS) {
    const b64 = (await readFile(path.join(SRC, 'assets/fonts', f))).toString('base64');
    css = css.replaceAll(`../fonts/${f}`, `data:font/woff2;base64,${b64}`);
  }
  return css;
}

// ---------- search index (generated) ----------
// Every <section>, <article> or <details> with an id becomes a search result:
// its first heading (or FAQ summary) is the title, its first paragraph the snippet.
const GENERATED = new Map();
const SKIP_IDS = /^(wl-|cd-|stage-panel|search|waitlist|help|top$)/;

function plain(html) {
  return html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

async function buildSearchIndex() {
  const entries = [];
  for (const page of site.pages) {
    if (page.noindex) continue; // checkout and order pages stay out of site search
    resetArtUses();
    // Drop inline drawings and embedded media so they can't push a section's heading out of reach
    const html = (await render(await read(path.join(SRC, 'pages', page.file)), page, 'preview'))
      .replace(/<svg\b[\s\S]*?<\/svg>/g, '')
      .replace(/data:[^"'\s)]+/g, '');
    const label = page.slug === 'home' ? 'Home' : page.slug[0].toUpperCase() + page.slug.slice(1);
    entries.push({ p: page.slug, r: page.route, l: label, id: '', t: page.title.split(/ [—|] /)[0], s: page.description, k: '' });
    for (const m of html.matchAll(/<(section|article|details)\b([^>]*)>/g)) {
      const id = (m[2].match(/\sid="([^"]+)"/) || [])[1];
      if (!id || SKIP_IDS.test(id)) continue;
      const kw = (m[2].match(/\sdata-keywords="([^"]+)"/) || [])[1] || '';
      const after = html.slice(m.index + m[0].length, m.index + m[0].length + 6000);
      let title = '';
      let rest = after;
      if (m[1] === 'details') {
        const sm = after.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
        if (sm) { title = plain(sm[1]); rest = after.slice(sm.index + sm[0].length); }
      } else {
        const hm = after.match(/<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/);
        if (hm) { title = plain(hm[2]); rest = after.slice(hm.index + hm[0].length); }
      }
      if (!title) continue;
      const pm = rest.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
      let snippet = pm ? plain(pm[1]) : '';
      if (snippet.length > 160) snippet = snippet.slice(0, 157).replace(/\s+\S*$/, '') + '…';
      entries.push({ p: page.slug, r: page.route, l: label, id, t: title, s: snippet, k: kw });
    }
  }
  GENERATED.set('search-index.js',
    `/* Generated by build.mjs: do not edit by hand. */\nwindow.VAYORA_SEARCH = ${JSON.stringify(entries)};\n`);
  return entries.length;
}

async function scriptSource(name) {
  return GENERATED.has(name) ? GENERATED.get(name) : read(path.join(SRC, 'assets/js', name));
}

// ---------- dist build ----------

async function buildDist() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  // GitHub Pages: CNAME binds the custom domain; .nojekyll serves files exactly as they are.
  if (DOMAIN && !DOMAIN.endsWith('github.io')) await writeFile(path.join(DIST, 'CNAME'), DOMAIN + '\n');
  await writeFile(path.join(DIST, '.nojekyll'), '');
  // README for the package: custom-domain guide when a domain is set, github.io guide otherwise.
  await cp(path.join(ROOT, DOMAIN ? 'deploy/README.md' : 'deploy/README-github-io.md'), path.join(DIST, 'README.md'));
  const layout = await read(path.join(SRC, 'partials/layout.html'));

  const pages = [...site.pages, site.notFound];
  for (const page of pages) {
    resetArtUses();
    // With a custom domain the 404 page can use root-absolute paths. Without one (a github.io/<repo>/
    // address) it uses relative paths plus a <base> pointing at the repository folder.
    const mode = page.slug === '404' && DOMAIN ? 'absolute' : 'dist';
    const content = await read(path.join(SRC, 'pages', page.file));
    let html = layout
      .replace('{{head}}', () => (page.slug === '404' && !DOMAIN ? BASE_FOR_PROJECT_SITE : '') + headMeta(page, mode))
      .replace('{{content}}', () => content)
      .replace('{{styles}}', () => `<link rel="stylesheet" href="{{root}}assets/css/styles.css">`)
      .replace(
        '{{scripts}}',
        site.scripts.map((s) => `<script src="{{root}}assets/js/${s}" defer></script>`).join('\n')
      )
      .replace('{{favicon}}', () => '{{root}}assets/img/favicon-32.png')
      .replace('{{appleicon}}', () => '{{root}}assets/img/apple-touch-icon.png')
      .replace('{{fontpreload}}', () => '')
      .replaceAll('{{slug}}', () => page.slug)
      .replace('{{htmlmode}}', () => 'site');
    html = await render(html, page, mode);
    const out = path.join(DIST, page.route);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html);
  }

  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  for (const dir of ['css', 'js', 'img', 'fonts', 'video']) {
    const from = path.join(SRC, 'assets', dir);
    if (!existsSync(from)) continue; // optional folders (e.g. video) may be absent
    await cp(from, path.join(DIST, 'assets', dir), { recursive: true });
  }
  for (const [name, body] of GENERATED) await writeFile(path.join(DIST, 'assets/js', name), body);
  // Embed the fonts in the stylesheet: identical typography on GitHub Pages and when a page is
  // opened straight from disk (browsers block separate font files on file://). Licences stay in assets/fonts/.
  await writeFile(path.join(DIST, 'assets/css/styles.css'), await inlineFonts(await read(path.join(SRC, 'assets/css/styles.css'))));
  for (const f of FONTS) await rm(path.join(DIST, 'assets/fonts', f), { force: true });

  await writeFile(
    path.join(DIST, 'robots.txt'),
    `User-agent: *\nAllow: /\n${SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml\n` : ''}`
  );
  if (SITE_URL) {
    const urls = site.pages.filter((p) => !p.noindex).map((p) => `  <url><loc>${SITE_URL}/${p.route === 'index.html' ? '' : p.route}</loc></url>`).join('\n');
    await writeFile(
      path.join(DIST, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
  }
}

// ---------- single-file preview build ----------

async function buildPreview() {
  await rm(PREVIEW, { recursive: true, force: true });
  await mkdir(PREVIEW, { recursive: true });
  const layout = await read(path.join(SRC, 'partials/layout.html'));
  const home = site.pages[0];

  const routes = [];
  resetArtUses();
  for (const page of site.pages) {
    const content = await read(path.join(SRC, 'pages', page.file));
    const body = await render(content, page, 'preview');
    routes.push(
      `<div class="route" data-route="${page.slug}" data-title="${escapeAttr(page.title)}"${
        page.slug === 'home' ? '' : ' hidden'
      }>\n${body}\n</div>`
    );
  }
  // Inline the fonts as data URIs so the preview is a truly single, offline-capable file.
  const css = await inlineFonts(await read(path.join(SRC, 'assets/css/styles.css')));
  const js = (await Promise.all(site.scripts.map(scriptSource))).join('\n;\n');
  const faviconUri = `data:image/png;base64,${(await readFile(path.join(SRC, 'assets/img/favicon-32.png'))).toString('base64')}`;
  const appleUri = `data:image/png;base64,${(await readFile(path.join(SRC, 'assets/img/apple-touch-icon.png'))).toString('base64')}`;

  let html = layout
    .replace('{{head}}', () => headMeta(home, 'preview'))
    .replace('{{content}}', () => routes.join('\n'))
    .replace('{{styles}}', () => `<style>\n${css}\n</style>`)
    .replace('{{scripts}}', () => `<script>\n${js}\n</script>`)
    .replace('{{favicon}}', () => faviconUri)
    .replace('{{appleicon}}', () => appleUri)
    .replace('{{fontpreload}}', () => '')
    .replaceAll('{{slug}}', () => 'home')
    .replace('{{htmlmode}}', () => 'preview');
  html = await render(html, home, 'preview');
  await writeFile(path.join(PREVIEW, 'index.html'), html);
}

const t0 = Date.now();
const indexed = await buildSearchIndex();
await buildDist();
await buildPreview();
const count = (await readdir(DIST)).length;
console.log(`Indexed ${indexed} search entries. Built dist/ (${count} entries) and preview/index.html in ${Date.now() - t0} ms${SITE_URL ? ` for ${SITE_URL}` : ''}`);
