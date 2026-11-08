const legacyAuthors = {
  'after-cws-orange-county': ['Xingtong Zou'],
  'refugee-water-crisis-27000-problem': ['Xingtong Zou'],
  'tehg-uv-water-access': ['Xingtong Zou', 'Xingwei Wang'],
  'after-wang-fuk-court': ['Xingtong Zou'],
  'cws-after-the-la-fires': ['Xingtong Zou'],
  'after-the-fire-before-a-lease': ['Xingtong Zou'],
  'sand-cartels-southeast-asia': ['Xingtong Zou']
};

function articleAuthors(article) {
  const authors = article.authors === undefined
    ? legacyAuthors[article.id]?.map(name => ({ name, type: 'Person' })) || [{ name: 'The Margins', type: 'Organization' }]
    : article.authors;
  if (!Array.isArray(authors) || !authors.length) throw new Error('Missing article authors: ' + article.id);
  return authors.map(author => {
    if (!author || typeof author.name !== 'string' || !author.name.trim() ||
        !['Person', 'Organization'].includes(author.type || 'Person')) {
      throw new Error('Invalid article author: ' + article.id);
    }
    return { '@type': author.type || 'Person', name: author.name.trim() };
  });
}

const byline = article => articleAuthors(article).map(author => author.name).join(' & ');
function schemaAuthors(article) {
  const authors = articleAuthors(article);
  return authors.length === 1 ? authors[0] : authors;
}

module.exports = { articleAuthors, byline, schemaAuthors };
