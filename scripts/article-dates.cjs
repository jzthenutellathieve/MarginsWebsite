const isoDate = article => new Date(article.date + ' 00:00:00 UTC').toISOString().slice(0, 10);

function retrospectiveMonth(article) {
  if (article.coverageDate === undefined && article.coverageMonth === undefined && article.format !== 'Retrospective') return null;
  const month = article.coverageMonth;
  if (article.format !== 'Retrospective' || typeof month !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Invalid retrospective coverage month: ' + article.id);
  }
  const label = new Date(month + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (article.coverageDate !== label || month > isoDate(article).slice(0, 7)) {
    throw new Error('Invalid retrospective coverage date: ' + article.id);
  }
  return month;
}

const displayDate = article => retrospectiveMonth(article) ? article.coverageDate + ' · Retrospective' : 'Published ' + article.date;
const displayIsoDate = article => retrospectiveMonth(article) || isoDate(article);
function schemaDates(article) {
  const month = retrospectiveMonth(article);
  return {
    datePublished: new Date(article.date + ' 00:00:00 UTC').toISOString(),
    ...(month ? { temporalCoverage: month } : {})
  };
}

module.exports = { isoDate, displayDate, displayIsoDate, retrospectiveMonth, schemaDates };
