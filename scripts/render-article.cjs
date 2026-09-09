const { escapeText } = require('./site-utils.cjs');
const { shortTitle, displayDate } = require('./editorial.cjs');
function renderArticle(article, snippets, assets) {
  const id = article.id;
  const isDevice = id === 'tehg-uv-water-access';
  const byline = isDevice ? 'Xingtong Zou & Xingwei Wang' : 'Xingtong Jerry Zou';
  const collaboration = isDevice ? snippets.collaboration : '';
  const diagram = isDevice ? snippets['device-figure'] : '';
  const embeddedVideo = isDevice ? snippets['device-video'] : '';
  const projectLinks = isDevice ? '<div class="md-project-links"><a class="md-nav-link" href="/projects/water/">Read the full water project →</a><a href="/projects/water/#laboratory-video">Watch the laboratory video ↓</a></div>' : '';
    const sourceRefs = block => {
      if (!block.sources || !block.sources.length) return '';
      return ' <span class="md-source-refs">'+block.sources.map(num => {
        const citation = article.citations.find(item => item.num === num);
        if (!citation || !/^https:\/\//.test(citation.url || '')) throw new Error('Missing source '+num+' in '+id);
        return '<a href="'+escapeText(citation.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Source '+num+'">['+num+']</a>';
      }).join(' ')+'</span>';
    };
    const updated = article.updated ? '<p class="md-update-date">Updated '+escapeText(article.updated)+'</p>' : '';
    const projectNote = article.projectNote ? '<p class="md-update-date">'+escapeText(article.projectNote)+'</p>' : '';
    const draftHistoryNote = article.draftHistoryNote ? '<p class="md-update-date">'+escapeText(article.draftHistoryNote)+'</p>' : '';
    const reportingNote = article.reportingNote ? '<div class="md-reporting-note"><p>'+escapeText(article.reportingNote)+'</p>'+(article.acknowledgements ? '<p class="md-acknowledgements">'+escapeText(article.acknowledgements)+'</p>' : '')+'</div>' : '';
    const correction = article.correctionNote ? '<p class="md-update-note">'+escapeText(article.correctionNote)+'</p>' : '';
    const blocks = article.content.map((block, index) => {
      if (block.type === 'paragraph') return '<p>'+escapeText(block.text)+sourceRefs(block)+'</p>';
      if (block.type === 'heading') return '<h2 id="section-'+index+'">'+escapeText(block.text)+'</h2>';
      if (block.type === 'pullquote') return '<blockquote><p>“'+escapeText(block.text)+'”</p><cite>'+escapeText(block.attribution)+'</cite></blockquote>';
      if (block.type === 'stat') return '<p class="mj-number-note"><strong>'+escapeText(block.number)+'</strong> · '+escapeText(block.label)+sourceRefs(block)+'</p>';
      if (block.type === 'image') {
        if (!assets[block.src]) throw new Error('Unmigrated article photo: '+block.src);
        return '<figure><img class="mj-image" loading="'+(block.eager ? 'eager' : 'lazy')+'"'+(block.eager ? ' fetchpriority="high"' : '')+' decoding="async" data-mj-asset="'+escapeText(block.src)+'" alt="'+escapeText(block.alt)+'"><figcaption>'+escapeText(block.caption)+'<br>'+escapeText(block.source)+'</figcaption></figure>'+(isDevice && block.src === '/images/iStock-499538949.jpg' ? embeddedVideo : '');
      }
      throw new Error('Unmigrated article block: '+block.type);
    }).join('');
    const sources = article.citations.map(citation => {
      const label = escapeText(citation.text);
      return '<li>'+(/^https:\/\//.test(citation.url || '') ? '<a href="'+escapeText(citation.url)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>' : label)+'</li>';
    }).join('');
    const contents = article.content.map((block, index) => block.type === 'heading' ? '<li><a href="#section-'+index+'">'+escapeText(block.text)+'</a></li>' : '').join('');
    const toolbar = '<div class="md-reader-tools">'+(contents ? '<details class="md-contents"><summary>In this article</summary><ol>'+contents+'<li><a href="#article-sources">Sources</a></li></ol></details>' : '<a href="#article-sources">Sources ↓</a>')+'<button type="button" data-mj-copy-link hidden>Copy article link ↗</button></div>';
    return '<header class="mj-reader-head"><h1>'+escapeText(shortTitle(article))+'</h1>'+(article.deck ? '<p class="mj-reader-subhead">'+escapeText(article.deck)+'</p>' : '')+'<p class="mj-reader-deck">'+escapeText(article.subtitle)+'</p><div class="mj-reader-meta">'+escapeText(byline)+' · '+escapeText(displayDate(article))+' · '+escapeText(article.readTime)+' read<span data-article-views="'+escapeText(id)+'" hidden></span>'+(article.award ? '<br>'+escapeText(article.award) : '')+'</div>'+updated+projectNote+draftHistoryNote+reportingNote+toolbar+projectLinks+collaboration+'</header><div class="mj-reader-body">'+diagram+blocks+correction+'<section class="mj-sources" id="article-sources"><h2>Sources</h2><ol>'+sources+'</ol></section></div>';
}
module.exports = { renderArticle };
