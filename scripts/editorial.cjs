const { escapeText: e, articlePath } = require('./site-utils.cjs');
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Missing template value: ${key}`);
  return values[key];
});
const shortTitle = article => article.displayTitle || article.title;
const byline = article => article.id === 'tehg-uv-water-access' ? 'Xingtong Zou & Xingwei Wang' : 'Xingtong Jerry Zou';
const isoDate = article => new Date(article.date + ' 00:00:00 UTC').toISOString().slice(0, 10);
const sortArticles = articles => [...articles].sort((a, b) => isoDate(b).localeCompare(isoDate(a)) || a.id.localeCompare(b.id));
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const photoBlocks = article => article.content.filter(block => block.type === 'image');
function imageTag(photo, assets, eager = false) {
  const asset = assets[photo.src];
  if (!asset) throw new Error(`Missing photo: ${photo.src}`);
  return `<img src="${e(asset.src)}" width="${asset.width}" height="${asset.height}" alt="${e(photo.alt)}" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async">`;
}
function gallery(article, assets, eager = false) {
  const photos = photoBlocks(article).slice(0, 2);
  if (!photos.length) return '';
  return `<div class="md-gallery" data-mj-gallery role="region" aria-roledescription="carousel" aria-label="${e(shortTitle(article))} photographs">
    <div class="md-gallery-stage">${photos.map((photo, i) => `<a class="md-gallery-slide${i === 0 ? ' is-active' : ''}" data-mj-slide href="${articlePath(article)}" aria-label="Read ${e(shortTitle(article))}"${i ? ' aria-hidden="true" tabindex="-1"' : ''}>${imageTag(photo, assets, eager && i === 0)}</a>`).join('')}</div>
    <div class="md-gallery-bottom"><div class="md-gallery-captions">${photos.map((photo, i) => `<p data-mj-caption${i ? ' hidden' : ''}>${e(photo.caption)} <span>${e(photo.source)}</span></p>`).join('')}</div>
    ${photos.length > 1 ? `<div class="md-gallery-controls" data-mj-gallery-controls hidden><button type="button" data-mj-prev aria-label="Previous photograph">←</button><span data-mj-counter>01 / ${String(photos.length).padStart(2, '0')}</span><button type="button" data-mj-next aria-label="Next photograph">→</button><button type="button" data-mj-pause aria-label="Pause slideshow">Pause</button></div>` : ''}</div>
  </div>`;
}
function story(article, assets, featured = false) {
  const heading = featured ? 'h1' : 'h3';
  return `<article class="${featured ? 'md-lead-story' : 'md-story'}" data-mj-story>
    ${gallery(article, assets, featured)}
    <div class="md-story-copy">
    <${heading}><a class="md-title-link" href="${articlePath(article)}">${e(shortTitle(article))}</a></${heading}>
    ${article.deck ? `<p class="md-deck">${e(article.deck)}</p>` : ''}
    <p class="md-description">${e(article.subtitle)}</p>
    ${article.homeNoteTitle ? `<aside class="md-initiative-note" aria-label="About this project"><p class="md-initiative-title">${e(article.homeNoteTitle)}</p><p>${e(article.homeNoteText)}</p></aside>` : article.cardNote ? `<p class="md-story-note">${e(article.cardNote)}</p>` : ''}
    <p class="md-meta">${e(byline(article))}<br><time datetime="${isoDate(article)}">${e(article.date)}</time><span> · ${e(article.readTime)} read</span></p>
    ${article.award ? `<p class="md-award">${e(article.award)}</p>` : ''}</div></article>`;
}
function renderHome(template, articles, config, assets, snippets) {
  const ordered = sortArticles(articles);
  const featured = ordered.find(article => article.id === config.featuredArticle) || ordered[0];
  if (!featured) throw new Error('The journal needs a published article');
  const recent = ordered.filter(article => article.id !== featured.id).slice(0, config.recentArticleLimit || 4);
  return fill(template, {featured: story(featured, assets, true), recent: recent.map(a => story(a, assets)).join(''), video: snippets['device-video'], collaboration: snippets.collaboration});
}
function listRow(article, assets) {
  const photo = photoBlocks(article)[0];
  return `<article class="md-list-story" data-mj-story>
    ${photo ? `<a class="md-list-photo" href="${articlePath(article)}" tabindex="-1" aria-hidden="true">${imageTag(photo, assets)}</a>` : ''}
    <div class="md-list-copy"><p class="md-kicker">${e(article.format || article.tag)} · ${e(article.region || article.tag)}</p>
    <h2><a class="md-title-link" href="${articlePath(article)}">${e(shortTitle(article))}</a></h2>
    ${article.deck ? `<p class="md-list-deck">${e(article.deck)}</p>` : ''}
    <p class="md-list-summary">${e(article.subtitle)}</p>
    ${article.cardNote ? `<p class="md-story-note">${e(article.cardNote)}</p>` : ''}
    <p class="md-meta">${e(byline(article))} · <time datetime="${isoDate(article)}">${e(article.date)}</time> · ${e(article.readTime)} read</p></div>
    <a class="md-list-arrow" href="${articlePath(article)}" aria-label="Read ${e(shortTitle(article))}">↗</a></article>`;
}
const pagePath = (base, page) => page === 1 ? base : `${base}page/${page}/`;
function pagination(base, page, total, label = 'Article pages') {
  if (total <= 1) return '';
  const nearby = Array.from({length: total}, (_, i) => i + 1).filter(n => n === 1 || n === total || Math.abs(n - page) <= 1);
  let previous = 0;
  const numbers = nearby.map(n => { const gap = previous && n - previous > 1 ? '<span aria-hidden="true">…</span>' : ''; previous = n; return gap + `<a href="${pagePath(base, n)}"${n === page ? ' aria-current="page"' : ''} aria-label="Page ${n}">${n}</a>`; }).join('');
  return `<nav class="md-pagination" aria-label="${label}">${page > 1 ? `<a rel="prev" href="${pagePath(base, page - 1)}">← Previous</a>` : '<span></span>'}<div>${numbers}</div>${page < total ? `<a rel="next" href="${pagePath(base, page + 1)}">Next →</a>` : '<span></span>'}</nav>`;
}
const countText = n => `${n} article${n === 1 ? '' : 's'}`;
const rangeText = (page, size, total) => total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${countText(total)}` : 'No articles yet';
function collectionPages(articles, templates, assets, pageSize = 6) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size');
  const ordered = sortArticles(articles);
  const topics = [...new Set(ordered.map(article => article.tag))].sort();
  const results = [];
  for (const topic of ['', ...topics]) {
    const matches = topic ? ordered.filter(article => article.tag === topic) : ordered;
    const base = topic ? `/articles/topic/${slug(topic)}/` : '/articles/';
    const total = Math.max(1, Math.ceil(matches.length / pageSize));
    const navigation = ['', ...topics].map(tag => `<a href="${tag ? `/articles/topic/${slug(tag)}/` : '/articles/'}"${tag === topic ? ' aria-current="page"' : ''}>${e(tag || 'All writing')}</a>`).join('');
    for (let page = 1; page <= total; page++) {
      results.push({pathname: pagePath(base, page), title: `${topic ? topic + ' articles' : 'Articles'}${page > 1 ? ' — Page ' + page : ''} | The Margins`, active: 'reporting', body: fill(templates.reporting, {
        topic: e(topic), heading: e(topic || 'All writing'), basePath: base, topics: navigation,
        summary: rangeText(page, pageSize, matches.length),
        articles: matches.slice((page - 1) * pageSize, page * pageSize).map(a => listRow(a, assets)).join(''),
        pagination: pagination(base, page, total)
      })});
    }
  }
  const years = [...new Set(ordered.map(a => isoDate(a).slice(0, 4)))];
  const archiveSize = 12;
  for (const year of ['', ...years]) {
    const matches = year ? ordered.filter(a => isoDate(a).startsWith(year)) : ordered;
    const base = year ? `/archive/${year}/` : '/archive/';
    const total = Math.max(1, Math.ceil(matches.length / archiveSize));
    const navigation = ['', ...years].map(y => `<a href="${y ? `/archive/${y}/` : '/archive/'}"${year === y ? ' aria-current="page"' : ''}>${y || 'All years'}</a>`).join('');
    for (let page = 1; page <= total; page++) {
      let currentYear;
      const rows = matches.slice((page - 1) * archiveSize, page * archiveSize).map(article => {
        const y = isoDate(article).slice(0, 4);
        const heading = y !== currentYear ? `<h2 class="md-archive-year">${y}</h2>` : '';
        currentYear = y;
        return `${heading}<article class="md-archive-row"><time datetime="${isoDate(article)}">${e(article.date.replace(', ' + y, ''))}</time><div><h3><a class="md-title-link" href="${articlePath(article)}">${e(shortTitle(article))}</a></h3><p>${e(article.deck || article.subtitle)}</p></div><span class="md-kicker">${e(article.tag)}</span></article>`;
      }).join('');
      results.push({pathname: pagePath(base, page), title: `${year ? year + ' — ' : ''}Article archive${page > 1 ? ' — Page ' + page : ''} | The Margins`, active:'archive', body:fill(templates.archive, {years:navigation, summary:rangeText(page, archiveSize, matches.length), articles:rows, pagination:pagination(base,page,total,'Archive pages')})});
    }
  }
  return results;
}
function searchIndex(articles, assets, pageSize) {
  return {pageSize, articles:sortArticles(articles).map(a => ({id:a.id, url:articlePath(a), title:shortTitle(a), fullTitle:a.title, deck:a.deck || '', summary:a.subtitle, cardNote:a.cardNote || '', tag:a.tag, format:a.format || a.tag, region:a.region || a.tag, author:byline(a), date:a.date, isoDate:isoDate(a), readTime:a.readTime, photo:photoBlocks(a)[0] ? {src:assets[photoBlocks(a)[0].src].src, alt:photoBlocks(a)[0].alt} : null}))};
}
function readNext(article, articles, assets) {
  const others = sortArticles(articles).filter(a => a.id !== article.id).slice(0,2);
  return `<aside class="md-read-next" aria-labelledby="read-next-title"><div class="md-section-rule"><h2 id="read-next-title">Keep reading</h2><a href="/articles/">All articles →</a></div>${others.map(a => listRow(a,assets)).join('')}</aside>`;
}
module.exports = { fill, shortTitle, byline, isoDate, slug, sortArticles, renderHome, collectionPages, searchIndex, readNext, pagePath, gallery };
