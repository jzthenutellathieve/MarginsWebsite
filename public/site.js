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

})();
