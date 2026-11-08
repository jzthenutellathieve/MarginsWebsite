const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function validIsoDate(value, label, article) {
  const date = typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)
    ? new Date(value + 'T00:00:00Z') : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid ' + label + ': ' + article.id);
  }
  return value;
}

function isoDate(article) {
  const match = typeof article.date === 'string' && article.date.match(/^([A-Za-z]+) ([1-9]\d?), (\d{4})$/);
  const month = match && months.indexOf(match[1]);
  const value = match && month !== -1
    ? `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}` : article.date;
  return validIsoDate(value, 'publication date', article);
}

function retrospectiveMonth(article) {
  if (article.coverageDate === undefined && article.coverageMonth === undefined && article.coverageCutoff === undefined && article.format !== 'Retrospective') return null;
  const month = article.coverageMonth;
  if (article.format !== 'Retrospective' || typeof month !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Invalid retrospective coverage month: ' + article.id);
  }
  const cutoff = validIsoDate(article.coverageCutoff, 'retrospective coverage cutoff', article);
  const label = `${months[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  if (article.coverageDate !== label || cutoff.slice(0, 7) !== month || cutoff > isoDate(article)) {
    throw new Error('Invalid retrospective coverage date: ' + article.id);
  }
  return month;
}

// One date key controls reader datelines, collection order and archive years.
// Publication metadata continues to use isoDate, never the retrospective cutoff.
const displayIsoDate = article => retrospectiveMonth(article) ? article.coverageCutoff : isoDate(article);
const displayDate = article => retrospectiveMonth(article)
  ? new Date(article.coverageCutoff + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : 'Published ' + article.date;
const sortArticles = articles => articles.map(article => ({ article, date: displayIsoDate(article) }))
  .sort((a, b) => b.date.localeCompare(a.date) || a.article.id.localeCompare(b.article.id))
  .map(entry => entry.article);
function schemaDates(article) {
  const month = retrospectiveMonth(article);
  return {
    datePublished: isoDate(article) + 'T00:00:00.000Z',
    ...(month ? { temporalCoverage: month } : {})
  };
}

module.exports = { isoDate, displayDate, displayIsoDate, retrospectiveMonth, schemaDates, sortArticles };
