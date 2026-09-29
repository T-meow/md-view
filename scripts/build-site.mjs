import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { content } from '../site/content.mjs';
import { renderPage } from '../site/template.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const { plus: version } = JSON.parse(await readFile(resolve(root, 'editionVersions.json'), 'utf8'));
const output = resolve(root, 'dist-site');
const base = `/${(process.env.VITE_BASE_PATH || '/md-view/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
await mkdir(resolve(output, 'en'), { recursive: true });
for (const locale of ['zh', 'en'])
  await writeFile(
    resolve(output, locale === 'zh' ? 'index.html' : 'en/index.html'),
    renderPage(content[locale], locale, base, version),
    'utf8'
  );
for (const file of ['styles.css', 'site.js', 'favicon.svg'])
  await copyFile(resolve(root, 'site', file), resolve(output, file));
await copyFile(resolve(root, 'assets/preview.png'), resolve(output, 'preview.png'));
await writeFile(resolve(output, '.nojekyll'), '');
await writeFile(
  resolve(output, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: https://t-meow.github.io${base}sitemap.xml\n`
);
await writeFile(
  resolve(output, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://t-meow.github.io${base}</loc></url><url><loc>https://t-meow.github.io${base}en/</loc></url><url><loc>https://t-meow.github.io${base}play/</loc></url></urlset>`
);
console.log(`Product site built: ${output}`);
