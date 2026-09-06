const { escapeText } = require('./site-utils.cjs');
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
    const correction = article.correctionNote ? '<p class="md-update-note">'+escapeText(article.correctionNote)+'</p>' : '';
    const blocks = article.content.map(block => {
      if (block.type === 'paragraph') return '<p>'+escapeText(block.text)+sourceRefs(block)+'</p>';
      if (block.type === 'heading') return '<h2>'+escapeText(block.text)+'</h2>';
      if (block.type === 'pullquote') return '<blockquote><p>“'+escapeText(block.text)+'”</p><cite>'+escapeText(block.attribution)+'</cite></blockquote>';
      if (block.type === 'stat') return '<p class="mj-number-note"><strong>'+escapeText(block.number)+'</strong> · '+escapeText(block.label)+sourceRefs(block)+'</p>';
      if (block.type === 'image') {
        if (!assets[block.src]) throw new Error('Unmigrated article photo: '+block.src);
        return '<figure><img class="mj-image" data-mj-asset="'+escapeText(block.src)+'" alt="'+escapeText(block.alt)+'"><figcaption>'+escapeText(block.caption)+'<br>'+escapeText(block.source)+'</figcaption></figure>'+(isDevice && block.src === '/images/iStock-499538949.jpg' ? embeddedVideo : '');
      }
      throw new Error('Unmigrated article block: '+block.type);
    }).join('');
    const sources = article.citations.map(citation => {
      const label = escapeText(citation.text);
      return '<li>'+(/^https:\/\//.test(citation.url || '') ? '<a href="'+escapeText(citation.url)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>' : label)+'</li>';
    }).join('');
    return '<header class="mj-reader-head"><h1>'+escapeText(article.title)+'</h1><p class="mj-reader-deck">'+escapeText(article.subtitle)+'</p><div class="mj-reader-meta">'+escapeText(byline)+' · '+escapeText(article.date)+' · '+escapeText(article.readTime)+(article.award ? '<br>'+escapeText(article.award) : '')+'</div>'+updated+projectLinks+collaboration+'</header><div class="mj-reader-body">'+diagram+blocks+correction+'<section class="mj-sources"><h2>Sources</h2><ol>'+sources+'</ol></section></div>';
}
module.exports = { renderArticle };
