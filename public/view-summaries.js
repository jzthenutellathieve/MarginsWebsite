(() => {
  const counters = Array.from(document.querySelectorAll('[data-article-view-summary]'));
  if (!counters.length) return;
  let started = false;

  async function read(id) {
    try {
      // Homepage previews read the stored total; only opening an article adds a view.
      const response = await fetch('/api/views?id=' + encodeURIComponent(id), {
        method:'GET', cache:'no-store', signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!data.ready || !Number.isSafeInteger(data.views) || data.views < 0) return;
      counters.filter(node => node.dataset.articleViewSummary === id).forEach(node => {
        node.textContent = ` · ${data.views.toLocaleString('en-US')} ${data.views === 1 ? 'view' : 'views'}`;
        node.title = 'Article page views; repeat visits and reloads count.';
        node.hidden = false;
      });
    } catch {
      // Keep the article links usable if the counter service is unavailable.
    }
  }

  function start() {
    if (started || document.visibilityState !== 'visible' || document.prerendering) return;
    started = true;
    [...new Set(counters.map(node => node.dataset.articleViewSummary))].forEach(read);
  }
  document.addEventListener('visibilitychange', start);
  document.addEventListener('prerenderingchange', start);
  window.addEventListener('pageshow', event => {
    if (event.persisted) started = false;
    start();
  });
  start();
})();
