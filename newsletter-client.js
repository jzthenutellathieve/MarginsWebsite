(() => {
  const form = document.querySelector('[data-mj-subscribe-form]');
  const input = document.getElementById('mj-subscribe-email');
  const status = document.getElementById('mj-subscribe-status');
  if (!form || !input || !status || form.dataset.mjConfigured !== 'true') return;
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  const originalLabel = button.textContent;
  let busy = false;
  let recentEmail = '';
  let retryAt = 0;
  let resumeEmail = '';

  async function request(options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.method === 'POST' ? 25000 : 5000);
    try {
      const response = await fetch('/api/newsletter', {
        cache: 'no-store', credentials: 'same-origin', ...options, signal: controller.signal
      });
      if (!(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error('Email service is not connected');
      }
      return { response, data: await response.json() };
    } finally { clearTimeout(timeout); }
  }

  // Keep the existing hosted form usable before the server is configured or on
  // static hosts. No email is saved to browser storage.
  const configuration = request().then(({ response, data }) => response.ok && data.ready === true)
    .catch(() => false);
  configuration.then(ready => {
    if (ready && !busy) status.textContent = 'Subscribe for new articles, or request another welcome email if you are already subscribed.';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const email = input.value.trim().toLowerCase();
    const remaining = Math.ceil((retryAt - Date.now()) / 1000);
    if (email === recentEmail && remaining > 0) {
      status.textContent = `Your last request was received. Please wait ${Math.ceil(remaining / 60)} minute(s) before requesting another email.`;
      status.focus({ preventScroll: true });
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending your subscription request…';
    try {
      if (!await configuration) {
        status.textContent = 'Opening Mailchimp to complete your subscription…';
        form.target = '_self';
        HTMLFormElement.prototype.submit.call(form);
        return;
      }
      const { response, data } = await request({
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true })
      });
      if (response.ok && data.status === 'requested') {
        status.textContent = data.message;
        resumeEmail = '';
        recentEmail = email;
        retryAt = Date.now() + data.retryAfter * 1000;
      } else if (response.ok && data.status === 'confirmation_required') {
        status.textContent = data.message;
        const link = document.createElement('a');
        link.href = 'https://eepurl.com/FCQRQWoPvn';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = ' Complete subscription on Mailchimp.';
        link.addEventListener('click', () => { resumeEmail = email; });
        status.appendChild(link);
      } else {
        status.textContent = data.error || 'We could not confirm your request. Please try again.';
        if (response.status === 429 && Number.isFinite(data.retryAfter)) {
          recentEmail = email;
          retryAt = Date.now() + data.retryAfter * 1000;
        }
      }
    } catch {
      status.textContent = 'We could not confirm your request. If an email has not arrived, wait five minutes before trying again. You can also use the Mailchimp form below.';
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = originalLabel;
      form.removeAttribute('aria-busy');
      status.focus({ preventScroll: true });
    }
  });

  // The hosted form handles legitimate re-subscription. On return, verify the
  // current status on the server before requesting the email. No forced opt-in.
  window.addEventListener('focus', () => {
    if (!resumeEmail || busy) return;
    const matches = input.value.trim().toLowerCase() === resumeEmail;
    resumeEmail = '';
    if (matches) form.requestSubmit();
  });
})();
