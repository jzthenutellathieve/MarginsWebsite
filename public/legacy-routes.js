(() => {
  // Redirect old bookmarks only; ordinary in-page anchors keep working.
  const hash = window.location.hash;
  if (!hash) return;
  const routes = JSON.parse(document.getElementById('legacy-routes').textContent);
  const key = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (Object.prototype.hasOwnProperty.call(routes, key)) {
    window.location.replace(routes[key] + window.location.search);
  }
})();
