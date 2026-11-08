const { escapeText } = require('./site-utils.cjs');
const { shortTitle, displayDate } = require('./editorial.cjs');
const { byline: articleByline } = require('./article-authors.cjs');
const { displayIsoDate, retrospectiveMonth } = require('./article-dates.cjs');
function renderArticle(article, snippets, assets) {
  const id = article.id;
  const isDevice = id === 'tehg-uv-water-access';
  const byline = articleByline(article);
  const dateline = retrospectiveMonth(article) ? '<time datetime="'+displayIsoDate(article)+'">'+escapeText(displayDate(article))+'</time>' : escapeText(displayDate(article));
  const collaboration = isDevice ? snippets.collaboration : '';
  const diagram = isDevice ? snippets['device-figure'] : '';
  const embeddedVideo = isDevice ? snippets['device-video'] : '';
  const projectLinks = isDevice ? '<div class="md-project-links"><a class="md-nav-link" href="/projects/water/">Read the full water project →</a><a href="/projects/water/#laboratory-video">Watch the laboratory video ↓</a></div>' : id === 'after-cws-orange-county' ? '<div class="md-project-links"><a class="md-nav-link" href="/projects/housing/">Read the housing navigation notes →</a></div>' : '';
    const sourceRefs = block => {
      if (!block.sources || !block.sources.length) return '';
      return ' <span class="md-source-refs">'+block.sources.map(num => {
        const citation = article.citations.find(item => item.num === num);
        if (!citation) throw new Error('Missing source '+num+' in '+id);
        const external = /^https:\/\//.test(citation.url || '');
        if (citation.url && !external) throw new Error('Invalid source URL '+num+' in '+id);
        const href = external ? citation.url : '#source-'+num;
        return '<a href="'+escapeText(href)+'"'+(external ? ' target="_blank" rel="noopener noreferrer"' : '')+' aria-label="Source '+num+'">['+num+']</a>';
      }).join(' ')+'</span>';
    };
    const projectNote = article.projectNote ? '<p class="md-update-date">'+escapeText(article.projectNote)+'</p>' : '';
    const reportingNote = article.reportingNote ? '<div class="md-reporting-note"><p>'+escapeText(article.reportingNote)+'</p>'+(article.acknowledgements ? '<p class="md-acknowledgements">'+escapeText(article.acknowledgements)+'</p>' : '')+'</div>' : '';
    const correction = article.correctionNote ? '<p class="md-update-note">'+escapeText(article.correctionNote)+'</p>' : '';
    const blocks = article.content.map((block, index) => {
      if (block.type === 'paragraph') return '<p>'+escapeText(block.text)+sourceRefs(block)+'</p>';
      if (block.type === 'heading') return (isDevice && block.text === 'One lamp, two electrical demands' ? embeddedVideo : '')+'<h2 id="section-'+index+'">'+escapeText(block.text)+'</h2>';
      if (block.type === 'pullquote') return '<blockquote><p>“'+escapeText(block.text)+'”</p><cite>'+escapeText(block.attribution)+'</cite></blockquote>';
      if (block.type === 'stat') return '<p class="mj-number-note"><strong>'+escapeText(block.number)+'</strong> · '+escapeText(block.label)+sourceRefs(block)+'</p>';
      if (block.type === 'image') {
        if (!assets[block.src]) throw new Error('Unmigrated article photo: '+block.src);
        const creditLink = (label, url) => {
          if (url && !/^https:\/\//.test(url)) throw new Error('Invalid photo credit URL in '+id);
          return url ? '<a href="'+escapeText(url)+'" target="_blank" rel="noopener noreferrer">'+escapeText(label)+'</a>' : escapeText(label);
        };
        const photoCredit = (block.photographer ? 'Photo: '+creditLink(block.photographer, block.photographerUrl)+' / ' : '')
          +creditLink(block.source, block.sourceUrl)
          +(block.license ? ' · '+creditLink(block.license, block.licenseUrl) : '')
          +(block.changes ? '. '+escapeText(block.changes) : '');
        return '<figure><img class="mj-image" loading="'+(block.eager ? 'eager' : 'lazy')+'"'+(block.eager ? ' fetchpriority="high"' : '')+' decoding="async" data-mj-asset="'+escapeText(block.src)+'" alt="'+escapeText(block.alt)+'"><figcaption>'+escapeText(block.caption)+'<br>'+photoCredit+'</figcaption></figure>';
      }
      throw new Error('Unmigrated article block: '+block.type);
    }).join('');
    const sources = article.citations.map(citation => {
      const label = escapeText(citation.text);
      return '<li id="source-'+citation.num+'" value="'+citation.num+'">'+(/^https:\/\//.test(citation.url || '') ? '<a href="'+escapeText(citation.url)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>' : label)+'</li>';
    }).join('');
    const toolbar = '<div class="md-reader-tools"><a href="#article-sources">Sources ↓</a></div>';
    return '<header class="mj-reader-head"><h1>'+escapeText(shortTitle(article))+'</h1>'+(article.deck ? '<p class="mj-reader-subhead">'+escapeText(article.deck)+'</p>' : '')+'<p class="mj-reader-deck">'+escapeText(article.subtitle)+'</p><div class="mj-reader-meta">'+escapeText(byline)+' · '+dateline+' · '+escapeText(article.readTime)+' read<span data-article-views="'+escapeText(id)+'" hidden></span>'+(article.award ? '<br>'+escapeText(article.award) : '')+'</div>'+projectNote+reportingNote+toolbar+projectLinks+'</header><div class="mj-reader-body">'+diagram+blocks+collaboration+correction+'<section class="mj-sources" id="article-sources"><h2>Sources</h2><ol>'+sources+'</ol></section></div>';
}
module.exports = { renderArticle };
