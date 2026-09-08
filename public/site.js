(() => {
  const root = document.getElementById('margins-water-reviewed');
  if (!root) return;
  const notice = root.querySelector('[data-mj-announcement]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  root.addEventListener('click', event => {
    const subscribe = event.target.closest('[data-mj-subscribe-open]');
    if (subscribe && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      root.querySelector('#mj-newsletter').scrollIntoView({ block: 'start' });
      root.querySelector('#mj-subscribe-email').focus({ preventScroll: true });
    }
  });

  root.querySelectorAll('[data-mj-gallery]').forEach(gallery => {
    const slides = [...gallery.querySelectorAll('[data-mj-slide]')];
    if (slides.length < 2) return;
    const captions = [...gallery.querySelectorAll('[data-mj-caption]')];
    const controls = gallery.querySelector('[data-mj-gallery-controls]');
    const counter = gallery.querySelector('[data-mj-counter]');
    const pause = gallery.querySelector('[data-mj-pause]');
    let current = 0, timer, paused = motion.matches, hovering = false, focused = false, visible = true;
    const stop = () => clearTimeout(timer);
    const schedule = () => {
      stop();
      if (!paused && !hovering && !focused && visible && !document.hidden) {
        timer = setTimeout(() => { show(current + 1); schedule(); }, 3000);
      }
    };
    function show(index, announce = false) {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        slide.classList.toggle('is-active', i === current);
        slide.setAttribute('aria-hidden', String(i !== current));
        slide.tabIndex = i === current ? 0 : -1;
        captions[i].hidden = i !== current;
      });
      counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
      if (announce && notice) notice.textContent = `Photograph ${current + 1} of ${slides.length}. ${captions[current].textContent}`;
    }
    function updatePause() {
      pause.textContent = paused ? 'Play' : 'Pause';
      pause.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
      schedule();
    }
    const advance = amount => { show(current + amount, true); schedule(); };
    gallery.querySelector('[data-mj-prev]').addEventListener('click', () => advance(-1));
    gallery.querySelector('[data-mj-next]').addEventListener('click', () => advance(1));
    pause.addEventListener('click', () => { paused = !paused; updatePause(); });
    gallery.addEventListener('mouseenter', () => { hovering = true; stop(); });
    gallery.addEventListener('mouseleave', () => { hovering = false; schedule(); });
    gallery.addEventListener('focusin', () => { focused = true; stop(); });
    gallery.addEventListener('focusout', event => {
      if (!gallery.contains(event.relatedTarget)) { focused = false; schedule(); }
    });
    gallery.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        advance(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', event => { paused = event.matches; updatePause(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.15 }).observe(gallery);
    }
    controls.hidden = false;
    updatePause();
  });

  const copy = root.querySelector('[data-mj-copy-link]');
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      const url = document.querySelector('link[rel="canonical"]').href;
      try {
        await navigator.clipboard.writeText(url);
        copy.textContent = 'Link copied';
        if (notice) notice.textContent = 'Article link copied.';
        setTimeout(() => { copy.textContent = 'Copy article link'; }, 2500);
      } catch {
        if (notice) notice.textContent = 'Copy the article address from your browser to share it.';
      }
    });
  }
  const progress = root.querySelector('[data-mj-reading-progress]');
  const body = root.querySelector('.mj-reader-body');
  if (progress && body) {
    let pending = false;
    const measure = () => {
      const bounds = body.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - window.innerHeight);
      const fraction = Math.min(1, Math.max(0, -bounds.top / distance));
      progress.style.transform = `scaleX(${fraction})`;
      pending = false;
    };
    const update = () => { if (!pending) { pending = true; requestAnimationFrame(measure); } };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
    update();
  }

  const collection = root.querySelector('[data-mj-collection]');
  if (!collection) return;
  const form = collection.querySelector('[data-mj-search]');
  const input = form.querySelector('input[name="q"]');
  const results = collection.querySelector('[data-mj-results]');
  const summary = collection.querySelector('[data-mj-results-summary]');
  const pagination = collection.querySelector('[data-mj-pagination]');
  const topic = collection.dataset.topic;
  const base = new URL(form.action).pathname;
  const initial = { results: results.innerHTML, summary: summary.textContent, pagination: pagination.innerHTML };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const link = (className, text, href) => {
    const node = element('a', className, text);
    node.href = href;
    return node;
  };
  function row(article) {
    const item = element('article', 'md-list-story');
    item.dataset.mjStory = '';
    if (article.photo) {
      const photo = link('md-list-photo', '', article.url);
      photo.tabIndex = -1;
      photo.setAttribute('aria-hidden', 'true');
      const img = element('img');
      img.src = article.photo.src;
      img.alt = article.photo.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      photo.append(img);
      item.append(photo);
    }
    const copy = element('div', 'md-list-copy');
    copy.append(element('p', 'md-kicker', `${article.format} · ${article.region}`));
    const title = element('h2');
    title.append(link('md-title-link', article.title, article.url));
    copy.append(title);
    if (article.deck) copy.append(element('p', 'md-list-deck', article.deck));
    copy.append(element('p', 'md-list-summary', article.summary));
    if (article.cardNote) copy.append(element('p', 'md-story-note', article.cardNote));
    const meta = element('p', 'md-meta', article.author + ' · ');
    const date = element('time', '', article.date);
    date.dateTime = article.isoDate;
    meta.append(date, document.createTextNode(` · ${article.readTime} read`));
    copy.append(meta);
    const arrow = link('md-list-arrow', '↗', article.url);
    arrow.setAttribute('aria-label', 'Read ' + article.title);
    item.append(copy, arrow);
    return item;
  }
  fetch('/article-index.json').then(response => {
    if (!response.ok) throw new Error('Search unavailable');
    return response.json();
  }).then(index => {
    function render() {
      const params = new URLSearchParams(location.search);
      const query = (params.get('q') || '').trim();
      input.value = query;
      collection.querySelectorAll('.md-topics a').forEach(anchor => {
        const url = new URL(anchor.href);
        if (query) url.searchParams.set('q', query);
        else url.searchParams.delete('q');
        anchor.href = url;
      });
      if (!query) {
        results.innerHTML = initial.results;
        summary.textContent = initial.summary;
        pagination.innerHTML = initial.pagination;
        return;
      }
      const terms = query.toLocaleLowerCase().split(/\s+/);
      const matches = index.articles.filter(article => {
        const text = [article.fullTitle, article.title, article.deck, article.summary, article.cardNote, article.tag, article.region, article.author].join(' ').toLocaleLowerCase();
        return (!topic || article.tag === topic) && terms.every(term => text.includes(term));
      });
      const total = Math.max(1, Math.ceil(matches.length / index.pageSize));
      const page = Math.min(total, Math.max(1, Number.parseInt(params.get('page'), 10) || 1));
      const start = (page - 1) * index.pageSize;
      summary.textContent = matches.length ? `${start + 1}–${Math.min(start + index.pageSize, matches.length)} of ${matches.length} article${matches.length === 1 ? '' : 's'} for “${query}”` : `No articles found for “${query}”`;
      results.replaceChildren(...matches.slice(start, start + index.pageSize).map(row));
      if (!matches.length) {
        const empty = element('div', 'md-empty');
        empty.append(element('h2', '', 'Try another search.'), element('p', '', 'Search by title, subject or author, or return to all writing.'));
        empty.append(link('md-text-link', 'Clear search →', base));
        results.append(empty);
      }
      pagination.replaceChildren();
      if (total > 1) {
        const nav = element('nav', 'md-pagination');
        nav.setAttribute('aria-label', 'Search result pages');
        const pageLink = (number, label) => {
          const url = new URL(location.href);
          url.searchParams.set('page', number);
          const anchor = link('', label, url.href);
          if (number === page) anchor.setAttribute('aria-current', 'page');
          anchor.addEventListener('click', event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            history.pushState(null, '', url);
            render();
            summary.scrollIntoView({ block: 'start' });
          });
          return anchor;
        };
        nav.append(page > 1 ? pageLink(page - 1, '← Previous') : element('span'));
        const numbers = element('div');
        let previous = 0;
        for (let n = 1; n <= total; n++) {
          if (n !== 1 && n !== total && Math.abs(n - page) > 1) continue;
          if (previous && n - previous > 1) numbers.append(element('span', '', '…'));
          numbers.append(pageLink(n, String(n)));
          previous = n;
        }
        nav.append(numbers, page < total ? pageLink(page + 1, 'Next →') : element('span'));
        pagination.append(nav);
      }
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const query = input.value.trim();
      const url = new URL(location.href);
      url.searchParams.delete('focus');
      url.searchParams.delete('page');
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      history.pushState(null, '', url);
      render();
    });
    window.addEventListener('popstate', render);
    form.hidden = false;
    render();
    if (new URLSearchParams(location.search).get('focus') === 'search') input.focus();
  }).catch(() => {
    if (location.search.includes('q=')) summary.textContent = 'Search is temporarily unavailable. You can browse the articles below.';
  });
  // Article and section links retain ordinary full-page browser navigation.
})();
