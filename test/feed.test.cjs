const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const python = `
import importlib.util, json, sys
from datetime import date
import xml.etree.ElementTree as ET
spec = importlib.util.spec_from_file_location("build_feed", "scripts/build_feed.py")
feed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feed)
xml, count = feed.build_feed_from_articles(json.load(sys.stdin), feed.DEFAULT_SITE, date(2026, 11, 7))
print(json.dumps([{"id": item.findtext("guid").removeprefix("urn:the-margins:article:"),
                   "published": item.findtext("pubDate")} for item in ET.fromstring(xml).findall("./channel/item")]))
`;
function build(articles) {
  const result = spawnSync('python3', ['-B', '-c', python], {
    cwd: path.resolve(__dirname, '..'), input: JSON.stringify(articles), encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}
const ordinary = (id, date) => ({ id, date, title: id, subtitle: 'An article summary.' });
const retrospective = (id, cutoff) => ({ ...ordinary(id, 'November 7, 2026'),
  format: 'Retrospective', coverageCutoff: cutoff, coverageMonth: cutoff.slice(0, 7) });

test('RSS interleaves retrospective coverage with original dates while preserving actual pubDate', () => {
  const output = build([
    retrospective('sunday', '2024-08-31'), ordinary('sand', 'May 28, 2025'),
    retrospective('live-in', '2025-01-31'), ordinary('water', 'June 20, 2026'),
    retrospective('ukraine', '2026-06-30'), ordinary('musasa', 'August 5, 2026'),
    retrospective('barcelona', '2026-08-31'), ordinary('cws', 'September 13, 2026')
  ]);
  assert.deepEqual(output.map(item => item.id),
    ['cws', 'barcelona', 'musasa', 'ukraine', 'water', 'sand', 'live-in', 'sunday']);
  for (const id of ['sunday', 'live-in', 'ukraine', 'barcelona']) {
    assert.equal(output.find(item => item.id === id).published, 'Sat, 07 Nov 2026 00:00:00 GMT');
  }
  assert.equal(output.find(item => item.id === 'water').published, 'Sat, 20 Jun 2026 00:00:00 GMT');
});

test('RSS date ties use ascending article IDs and future publications stay excluded', () => {
  const articles = [retrospective('z-retrospective', '2026-08-31'),
    ordinary('a-original', 'August 31, 2026'), ordinary('unpublished', 'November 8, 2026')];
  assert.deepEqual(build(articles).map(item => item.id), ['a-original', 'z-retrospective']);
  assert.deepEqual(build([...articles].reverse()), build(articles));
});

test('RSS rejects invalid, inconsistent and future retrospective cutoff dates', () => {
  const article = retrospective('historical', '2024-08-31');
  for (const fields of [
    { coverageCutoff: undefined }, { coverageCutoff: 'August 31, 2024' },
    { coverageCutoff: '2024-8-31' }, { coverageCutoff: '2024-02-30', coverageMonth: '2024-02' },
    { coverageMonth: '2024-07' }, { format: 'Essay' },
    { coverageCutoff: '2026-11-08', coverageMonth: '2026-11' }
  ]) {
    assert.throws(() => build([{ ...article, ...fields }]), /invalid retrospective coverage cutoff/);
  }
});
