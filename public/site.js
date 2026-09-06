(() => {
  const root = document.getElementById('margins-water-reviewed');
  if (!root) return;
  const notice = root.querySelector('[data-mj-announcement]');
  root.addEventListener('click', event => {
    const filter = event.target.closest('[data-mj-filter]');
    if (filter) {
      const tag = filter.dataset.mjFilter;
      root.querySelectorAll('[data-mj-filter]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.mjFilter === tag));
      });
      let count = 0;
      root.querySelectorAll('[data-mj-report-tag]').forEach(row => {
        row.hidden = tag !== 'All' && row.dataset.mjReportTag !== tag;
        if (!row.hidden) count++;
      });
      root.querySelector('[data-mj-report-empty]').hidden = count !== 0;
      notice.textContent = count + ' article' + (count === 1 ? '' : 's') + ' · ' + tag;
    }
    const subscribe = event.target.closest('[data-mj-subscribe-open]');
    if (subscribe && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      root.querySelector('#mj-newsletter').scrollIntoView({ block: 'start' });
      root.querySelector('#mj-subscribe-email').focus({ preventScroll: true });
    }
  });
  // All article and section links use ordinary browser navigation.
})();
