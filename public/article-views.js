(() => {
  const counter = document.querySelector('[data-article-views]');
  if (!counter || !window.crypto?.randomUUID) return;
  let started = false;

  async function record(eventId, retry = false) {
    try {
      const response = await fetch('/api/views', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:counter.dataset.articleViews, eventId}),
        cache:'no-store', signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('Views unavailable');
      const data = await response.json();
      if (!data.ready || !Number.isSafeInteger(data.views) || data.views < 0) return;
      counter.textContent = ` · ${data.views.toLocaleString('en-US')} ${data.views === 1 ? 'view' : 'views'}`;
      const since = data.trackedSince ? data.trackedSince.slice(0, 10) : '';
      counter.title = `Page loads${since ? ' recorded since ' + since : ''}; repeat visits and reloads count.${data.historicalViews ? ' Includes ' + data.historicalViews.toLocaleString('en-US') + ' imported historical page views.' : ''}`;
      counter.hidden = false;
    } catch {
      // Reuse this load's ID: a response lost after an increment must not add twice.
      if (!retry) window.setTimeout(() => record(eventId, true), 1000);
    }
  }

  function start() {
    if (started || document.visibilityState !== 'visible' || document.prerendering) return;
    started = true;
    record(window.crypto.randomUUID());
  }
  document.addEventListener('visibilitychange', start);
  document.addEventListener('prerenderingchange', start);
  window.addEventListener('pageshow', event => {
    if (event.persisted) started = false;
    start();
  });
  start();
})();
