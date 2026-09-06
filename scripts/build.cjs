const fs = require('node:fs');
const path = require('node:path');
const { escapeText, pages, articlePath } = require('./site-utils.cjs');
const { renderArticle } = require('./render-article.cjs');
const { renderHome, collectionPages, searchIndex, readNext } = require('./editorial.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const config = JSON.parse(read('content/site.json'));
const assets = JSON.parse(read('content/assets.json'));
const articles = fs.readdirSync(path.join(root, 'content/articles')).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(read(`content/articles/${name}`)));
const snippets = Object.fromEntries(['header', 'footer', 'newsletter', 'collaboration', 'device-figure', 'device-video']
  .map(name => [name, read(`templates/${name}.html`)]));
const description = 'An independent journal on displacement, with essays by Jerry Zou and notes from housing work and water-treatment research.';
const legacyRoutes = Object.fromEntries(Object.entries(pages).map(([name, page]) => [name, page.path]));
legacyRoutes[''] = '/';
const seen = new Set();
for (const article of articles) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.id) || seen.has(article.id)) throw new Error('Invalid or duplicate article id');
  seen.add(article.id);
  legacyRoutes[`reporting/${article.id}`] = articlePath(article);
}
function hydrateImages(html) {
  return html.replace(/<img\b[^>]*data-mj-asset="([^"]+)"[^>]*>/g, (tag, key) => {
    if (/\ssrc=/.test(tag)) return tag;
    const asset = assets[key];
    if (!asset) throw new Error(`Missing image ${key}`);
    return tag.slice(0, -1) + ` src="${escapeText(asset.src)}" width="${asset.width}" height="${asset.height}">`;
  });
}
function documentFor({ title, pathname, body, active, summary = description, article }) {
  const canonical = config.siteUrl + pathname;
  const header = snippets.header.replace(new RegExp(`data-mj-view="${active}"`, 'g'), '$& aria-current="page"');
  const metadata = article ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: article.title,
    description: summary, mainEntityOfPage: canonical,
    author: article.id === 'tehg-uv-water-access' ? [
      { '@type': 'Person', name: 'Xingtong Zou' }, { '@type': 'Person', name: 'Xingwei Wang' }
    ] : { '@type': 'Person', name: 'Xingtong Jerry Zou' },
    datePublished: new Date(article.date + ' 00:00:00 UTC').toISOString(),
    ...(article.updated ? { dateModified: new Date(article.updated + ' 00:00:00 UTC').toISOString() } : {}),
    publisher: { '@type': 'Organization', name: 'The Margins' }
  }).replace(/</g, '\\u003c')}</script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="only light">
<meta name="theme-color" content="#ffffff">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="icon" type="image/png" href="/images/favicon.png">
<title>${escapeText(title)}</title>
<meta name="description" content="${escapeText(summary)}">
<link rel="canonical" href="${escapeText(canonical)}">
<meta property="og:title" content="${escapeText(title)}">
<meta property="og:description" content="${escapeText(summary)}">
<meta property="og:url" content="${escapeText(canonical)}">
<meta property="og:type" content="${article ? 'article' : 'website'}">
${article && article.content.find(b => b.type === 'image') ? `<meta property="og:image" content="${config.siteUrl}${assets[article.content.find(b => b.type === 'image').src].src}">` : ''}
<link rel="alternate" type="application/rss+xml" title="The Margins — new articles" href="/feed.xml">
<link rel="stylesheet" href="/site.css">
${metadata}
<script id="legacy-routes" type="application/json">${JSON.stringify(legacyRoutes)}</script>
<script src="/legacy-routes.js"></script>
</head>
<body id="top">
<div id="margins-water-reviewed">
${header}
<main id="main-content">${hydrateImages(body)}</main>
${snippets.newsletter}
${snippets.footer}
<div class="mj-announcement" aria-live="polite" data-mj-announcement></div>
</div>
<script src="/site.js" defer></script>
<script src="/newsletter-client.js" defer></script>
</body>
</html>
`;
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.cpSync(path.join(root, 'images'), path.join(out, 'images'), { recursive: true });
fs.copyFileSync(path.join(root, 'newsletter-client.js'), path.join(out, 'newsletter-client.js'));
for (const [name, page] of Object.entries(pages)) {
  if (name === 'reporting' || name === 'archive') continue;
  const directory = path.join(out, page.path);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), documentFor({
    title: page.title, pathname: page.path,
    body: name === 'home' ? renderHome(read('content/pages/home.html'), articles, config, assets, snippets) : read(`content/pages/${name}.html`),
    active: page.parent || name
  }));
}
const collections = collectionPages(articles, {reporting:read('content/pages/reporting.html'), archive:read('content/pages/archive.html')}, assets, config.articlesPerPage || 6);
for (const page of collections) {
  const directory = path.join(out, page.pathname);
  fs.mkdirSync(directory, {recursive:true});
  fs.writeFileSync(path.join(directory,'index.html'), documentFor(page));
}
fs.writeFileSync(path.join(out, 'article-index.json'), JSON.stringify(searchIndex(articles, assets, config.articlesPerPage || 6)));
for (const article of articles) {
  const pathname = articlePath(article);
  const directory = path.join(out, pathname);
  fs.mkdirSync(directory, { recursive: true });
  const back = '<a class="mj-back md-nav-link" href="/articles/">← Back to Articles</a>';
  const body = `<section class="mj-reader" data-mj-page="reader" aria-label="Article"><div class="md-reading-progress" data-mj-reading-progress aria-hidden="true"></div>${back}<article data-mj-reader-content>${renderArticle(article, snippets, assets)}</article>${readNext(article, articles, assets)}</section>`;
  fs.writeFileSync(path.join(directory, 'index.html'), documentFor({
    title: `${article.title} | The Margins`, pathname, body, active: 'reporting', summary: article.excerpt || article.subtitle, article
  }));
}
const locations = [...new Set([...Object.values(pages).map(page => page.path), ...articles.map(articlePath), ...collections.map(page => page.pathname)])];
fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(url => `  <url><loc>${escapeText(config.siteUrl + url)}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
fs.copyFileSync(path.join(root, 'feed.xml'), path.join(out, 'feed.xml'));
fs.writeFileSync(path.join(out, '404.html'), documentFor({
  title: 'Page not found | The Margins', pathname: '/404.html', active: '',
  body: '<section class="md-prose"><h1>Page not found</h1><p>This page could not be found. <a href="/articles/">Browse the articles</a> or <a href="/">return to the journal</a>.</p></section>'
}).replace('<meta name="description"', '<meta name="robots" content="noindex"><meta name="description"'));
console.log(`Built ${locations.length} independent pages, shared assets, sitemap, RSS and 404 page.`);
