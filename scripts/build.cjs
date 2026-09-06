const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of ['index.html', 'feed.xml', 'newsletter-client.js', 'sitemap.xml']) {
  fs.copyFileSync(path.join(root, name), path.join(out, name));
}
fs.cpSync(path.join(root, 'images'), path.join(out, 'images'), { recursive: true });
console.log('Built The Margins static assets. Vercel deploys api/newsletter.js separately.');
