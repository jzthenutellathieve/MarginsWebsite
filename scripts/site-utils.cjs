const escapeText = value => String(value == null ? '' : value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const pages = {
  home: { path: '/', title: 'The Margins — A Journal on Displacement' },
  reporting: { path: '/articles/', title: 'Articles | The Margins' },
  solutions: { path: '/projects/', title: 'Projects | The Margins' },
  water: { path: '/projects/water/', title: 'Water treatment without grid electricity | The Margins', parent: 'solutions' },
  housing: { path: '/projects/housing/', title: 'Housing Navigation | The Margins', parent: 'solutions' },
  archive: { path: '/archive/', title: 'Article archive | The Margins' },
  about: { path: '/about/', title: 'About The Margins' }
};
const articlePath = article => `/articles/${article.id}/`;
module.exports = { escapeText, pages, articlePath };
