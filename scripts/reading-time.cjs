// Include the opening note, body, image captions and embedded figure text.
// Exclude navigation, bibliographies and the time spent watching videos.
const WORDS_PER_MINUTE = 200;
// Allow an additional minute to pause over photographs and the argument.
const READING_BUFFER_MINUTES = 1;

function estimateReadingTime(html, openingNote = '') {
  const body = html.split('<div class="mj-reader-body">')[1]?.split('<section class="mj-sources"')[0];
  if (body === undefined) throw new Error('Article body is missing when calculating reading time');
  const entities = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  const text = (openingNote+' '+body)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (_, name) => entities[name.toLowerCase()] || ' ')
    .replace(/\[\d+\]/g, ' ');
  const words = (text.match(/[\p{L}\p{N}]+(?:[’'.,-][\p{L}\p{N}]+)*/gu) || []).length;
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) + READING_BUFFER_MINUTES;
  return {words, minutes, label:`${minutes} min`};
}

module.exports = {estimateReadingTime, WORDS_PER_MINUTE, READING_BUFFER_MINUTES};
