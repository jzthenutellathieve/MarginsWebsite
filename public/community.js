(() => {
  'use strict';

  const account = document.querySelector('#community-account');
  const feed = document.querySelector('#community-feed');
  const accountLinks = [...document.querySelectorAll('[data-community-account]')];
  const membershipLinks = [...document.querySelectorAll('[data-community-membership]')];
  const contributeLinks = [...document.querySelectorAll('[data-community-contribute]')];
  const originalLinks = new Map([...accountLinks, ...membershipLinks, ...contributeLinks].map(link => [link, {href:link.getAttribute('href'), text:link.textContent}]));
  const availability = document.querySelector('[data-community-status]');
  const state = {ready:false, user:null, notes:new Map()};
  const visibleNotes = new Set();
  const acceptedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);
  let fieldSequence = 0;
  let accountUI;
  let observer;

  function element(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  }

  function button(text, type = 'button') {
    const item = element('button', text, 'community-button');
    item.type = type;
    return item;
  }

  function status() {
    const item = element('p', '', 'community-status');
    item.setAttribute('role', 'status');
    item.setAttribute('aria-live', 'polite');
    return item;
  }

  function message(target, text, isError = false) {
    target.textContent = text;
    target.classList.toggle('is-error', isError);
  }

  function errorMessage(error) {
    return error && error.message ? error.message : 'This could not be completed. Please try again.';
  }

  async function api(action, body, query = {}) {
    const params = new URLSearchParams({action, ...query});
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/community?' + params.toString(), {
        method:body === undefined ? 'GET' : 'POST',
        credentials:'same-origin', cache:'no-store', signal:controller.signal,
        ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : '';
        const error = new Error(detail || (response.status === 401 ? 'Please sign in again to continue.' : 'This service is temporarily unavailable. Please try again.'));
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request timed out. Please try again.');
      if (error instanceof TypeError) throw new Error('Could not connect. Check your connection and try again.');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function field(labelText, type = 'text', options = {}) {
    const wrap = element('div', null, 'community-field');
    const input = element(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.id = 'community-field-' + (++fieldSequence);
    Object.entries(options).forEach(([key, value]) => { input[key] = value; });
    const label = element('label', labelText);
    label.htmlFor = input.id;
    wrap.append(label, input);
    return {wrap, input};
  }

  function safeImageURL(src) {
    if (typeof src !== 'string') return '';
    try {
      const url = new URL(src);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function dateValue(value) {
    const date = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}(-\d{2})?$/.test(date) ? (date.length === 7 ? date + '-01' : date) : '';
  }

  function dateLabel(value) {
    const day = dateValue(value);
    if (!day) return '';
    const date = new Date(day + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      month:'long', year:'numeric', ...(String(value).length > 7 ? {day:'numeric'} : {}), timeZone:'UTC'
    });
  }

  function appendPhotos(parent, media) {
    if (!Array.isArray(media)) return;
    const photos = element('div', null, 'md-note-photos community-photos');
    media.slice(0, 4).forEach(photo => {
      const src = safeImageURL(photo && photo.src);
      if (!src) return;
      const figure = element('figure');
      const link = element('a');
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const image = element('img');
      image.src = src;
      image.alt = typeof photo.alt === 'string' ? photo.alt : '';
      image.loading = 'lazy';
      if (Number.isSafeInteger(photo.width) && photo.width > 0) image.width = photo.width;
      if (Number.isSafeInteger(photo.height) && photo.height > 0) image.height = photo.height;
      if (image.width > 0 && image.height > 0) figure.style.setProperty('--note-ratio', String(image.width / image.height));
      link.setAttribute('aria-label', image.alt ? 'View full image: ' + image.alt : 'View full image');
      link.append(image);
      figure.append(link);
      photos.append(figure);
    });
    if (photos.children.length) parent.append(photos);
  }

  function noteCard(note, compact = false) {
    const article = element('article', null, compact ? 'community-submission' : 'md-note md-note-entry community-note');
    const heading = element(compact ? 'h3' : 'h2');
    if (compact) heading.textContent = note.title || 'Untitled field note';
    else {
      article.id = note.id.replace(/[^a-zA-Z0-9_-]/g, '-');
      const link = element('a', note.title || 'Untitled field note');
      link.href = '#' + article.id;
      heading.append(link);
    }
    const meta = element('p', null, 'md-note-meta');
    const time = element('time', dateLabel(note.date));
    time.dateTime = String(note.date || '');
    meta.append(time);
    if (note.author && note.author.name) meta.append(document.createTextNode(' · ' + note.author.name));
    const header = element('header');
    header.append(meta, heading);
    article.append(header);
    if (note.text) article.append(element('p', note.text, 'md-note-text community-note-text'));
    appendPhotos(article, note.media);
    return article;
  }

  function updateAccountLinks() {
    accountLinks.forEach(link => {
      if (state.ready) {
        link.href = '/account/';
        link.textContent = state.user ? 'My account' : 'Log in / Sign up';
      } else {
        link.setAttribute('href', originalLinks.get(link).href);
        link.textContent = originalLinks.get(link).text;
      }
    });
    membershipLinks.forEach(link => {
      link.setAttribute('href', state.ready ? '/account/#membership' : originalLinks.get(link).href);
    });
    contributeLinks.forEach(link => {
      link.setAttribute('href', state.ready ? (canContribute() ? '/account/#share-a-note' : '/account/#membership') : originalLinks.get(link).href);
    });
  }

  function canContribute() {
    return !!(state.user?.isMember || state.user?.isAdmin);
  }

  function showUnavailable(text) {
    state.ready = false;
    updateAccountLinks();
    document.querySelectorAll('[data-note-interactions]').forEach(item => { item.hidden = true; });
    if (availability) message(availability, text);
    if (account && !availability) {
      accountUI = accountUI || element('div', null, 'community-ui');
      accountUI.replaceChildren(element('p', text, 'community-status'));
      account.append(accountUI);
    }
  }

  function signInPrompt(target) {
    target.replaceChildren(document.createTextNode('Please '));
    const link = element('a', 'sign in');
    link.href = '/account/';
    target.append(link, document.createTextNode(' to take part.'));
  }

  function countLabel(count, singular, plural = singular + 's') {
    return Number.isSafeInteger(count) && count >= 0 ? count.toLocaleString('en-US') + ' ' + (count === 1 ? singular : plural) : '';
  }

  function updateCounts(noteState) {
    const data = noteState.data;
    noteState.like.textContent = countLabel(data.likes, 'like') || 'Like';
    noteState.like.setAttribute('aria-pressed', String(Boolean(data.liked)));
    noteState.like.setAttribute('aria-label', (data.liked ? 'Unlike this field note' : 'Like this field note') + (Number.isSafeInteger(data.likes) ? ' · ' + countLabel(data.likes, 'like') : ''));
    noteState.views.textContent = countLabel(data.views, 'view');
    noteState.views.hidden = !noteState.views.textContent;
    const comments = Array.isArray(data.comments) ? data.comments : [];
    noteState.commentsButton.textContent = countLabel(comments.length, 'comment');
  }

  function renderComments(noteState) {
    const panel = noteState.commentsPanel;
    panel.replaceChildren();
    const comments = Array.isArray(noteState.data.comments) ? noteState.data.comments : [];
    const list = element('ol', null, 'community-comments');
    comments.forEach(comment => {
      const item = element('li');
      const meta = element('p', null, 'community-comment-meta');
      meta.append(element('strong', comment.name || 'Reader'));
      if (dateLabel(comment.createdAt)) meta.append(document.createTextNode(' · ' + dateLabel(comment.createdAt)));
      item.append(meta, element('p', comment.text || '', 'community-comment-text'));
      list.append(item);
    });
    panel.append(comments.length ? list : element('p', 'No published comments yet.', 'community-help'));
    if (!state.user) {
      const prompt = status();
      signInPrompt(prompt);
      panel.append(prompt);
      return;
    }
    const form = element('form', null, 'community-comment-form');
    const text = field('Leave a comment', 'textarea', {required:true, maxLength:2000, rows:3});
    const help = element('p', 'Comments are reviewed before they appear.', 'community-help');
    const submit = button('Send for review', 'submit');
    const feedback = status();
    form.append(text.wrap, help, submit, feedback);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const value = text.input.value.trim();
      if (!value) { message(feedback, 'Please write a comment first.', true); return; }
      submit.disabled = true;
      message(feedback, 'Sending your comment…');
      try {
        await api('comment', {id:noteState.id, text:value});
        text.input.value = '';
        message(feedback, 'Your comment was sent for review. It will appear after approval.');
      } catch (error) { message(feedback, errorMessage(error), true); }
      finally { submit.disabled = false; }
    });
    panel.append(form);
  }

  function renderInteractions(noteState) {
    const box = noteState.box;
    const bar = element('div', null, 'community-actions');
    noteState.like = button('Like');
    noteState.commentsButton = button('Comments');
    noteState.commentsButton.setAttribute('aria-expanded', 'false');
    noteState.views = element('span', '', 'community-views');
    noteState.feedback = status();
    noteState.commentsPanel = element('div', null, 'community-comment-panel');
    noteState.commentsPanel.id = 'community-comments-' + (++fieldSequence);
    noteState.commentsPanel.hidden = true;
    noteState.commentsButton.setAttribute('aria-controls', noteState.commentsPanel.id);
    bar.append(noteState.like, noteState.commentsButton, noteState.views);
    box.replaceChildren(bar, noteState.feedback, noteState.commentsPanel);
    box.classList.add('community-interactions');
    box.hidden = false;
    updateCounts(noteState);
    noteState.like.addEventListener('click', async () => {
      if (!state.user) { signInPrompt(noteState.feedback); return; }
      noteState.like.disabled = true;
      try {
        const result = await api('like', {id:noteState.id, liked:!noteState.data.liked});
        if (typeof result.liked === 'boolean' && Number.isSafeInteger(result.likes)) {
          noteState.data.liked = result.liked;
          noteState.data.likes = result.likes;
        } else {
          noteState.data = await api('note', undefined, {id:noteState.id});
        }
        updateCounts(noteState);
        message(noteState.feedback, '');
      } catch (error) { message(noteState.feedback, errorMessage(error), true); }
      finally { noteState.like.disabled = false; }
    });
    noteState.commentsButton.addEventListener('click', async () => {
      const expanded = noteState.commentsPanel.hidden;
      noteState.commentsPanel.hidden = !expanded;
      noteState.commentsButton.setAttribute('aria-expanded', String(expanded));
      if (!expanded) return;
      renderComments(noteState);
      try {
        noteState.data = await api('note', undefined, {id:noteState.id});
        updateCounts(noteState);
        // Preserve a draft if the reader began typing while the request was pending.
        if (!noteState.commentsPanel.querySelector('textarea')?.value) renderComments(noteState);
      } catch (error) { message(noteState.feedback, errorMessage(error), true); }
    });
  }

  function eventID(id) {
    const key = 'margins:note-view:' + id;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    try {
      const existing = window.sessionStorage.getItem(key);
      if (uuidPattern.test(existing || '')) return existing;
    } catch { /* A private browsing setting may disable storage. */ }
    if (!window.crypto?.randomUUID) return '';
    const value = window.crypto.randomUUID();
    try { window.sessionStorage.setItem(key, value); } catch { /* The ID still covers retries on this page. */ }
    return value;
  }

  function isVisible() {
    return document.visibilityState === 'visible' && !document.prerendering;
  }

  async function recordView(noteState, retry = false) {
    if (!isVisible() || !visibleNotes.has(noteState.article) || noteState.viewDone || noteState.viewBusy) return;
    noteState.eventId = noteState.eventId || eventID(noteState.id);
    if (!noteState.eventId) return;
    noteState.viewBusy = true;
    try {
      const result = await api('view', {id:noteState.id, eventId:noteState.eventId});
      noteState.viewDone = true;
      if (Number.isSafeInteger(result.views) && result.views >= 0) {
        noteState.data.views = result.views;
        updateCounts(noteState);
      }
    } catch {
      if (!retry) window.setTimeout(() => recordView(noteState, true), 1200);
    } finally { noteState.viewBusy = false; }
  }

  async function loadNote(noteState) {
    if (!state.ready || noteState.loading) return;
    if (!noteState.data) {
      noteState.loading = true;
      try {
        noteState.data = await api('note', undefined, {id:noteState.id});
        renderInteractions(noteState);
      } catch {
        noteState.box.hidden = true;
        // A failed community request must never remove the published note.
        return;
      } finally { noteState.loading = false; }
    }
    recordView(noteState);
  }

  function attachNotes() {
    document.querySelectorAll('article[data-note-id]').forEach(article => {
      const id = article.dataset.noteId;
      if (!id || state.notes.has(id)) return;
      const box = article.querySelector('[data-note-interactions]');
      if (!box) return;
      const noteState = {id, article, box};
      state.notes.set(id, noteState);
      if (observer) observer.observe(article);
      else loadNote(noteState); // Counts stay readable in browsers without visibility observation; no view is recorded.
    });
  }

  async function loadFeed() {
    if (!feed) return;
    try {
      const result = await api('feed');
      const known = new Set([...feed.querySelectorAll('article[data-note-id]')].map(note => note.dataset.noteId));
      let anchorTarget;
      (Array.isArray(result.notes) ? result.notes : []).forEach(note => {
        if (!note || typeof note.id !== 'string' || known.has(note.id)) return;
        known.add(note.id);
        const article = noteCard(note);
        article.dataset.noteId = note.id;
        article.dataset.noteDate = String(note.date || '');
        if (window.location.hash === '#' + article.id) anchorTarget = article;
        const box = element('div');
        box.setAttribute('data-note-interactions', '');
        box.hidden = true;
        article.append(box);
        feed.append(article);
      });
      [...feed.querySelectorAll('article[data-note-id]')]
        .sort((a, b) => dateValue(b.dataset.noteDate).localeCompare(dateValue(a.dataset.noteDate)))
        .forEach(note => feed.append(note));
      attachNotes();
      if (anchorTarget) anchorTarget.scrollIntoView({block:'start'});
    } catch {
      if (availability) message(availability, 'Member field notes could not be loaded. Please try again later; you can still contribute by email.');
    }
  }

  function renderLogin() {
    const heading = element('h2', 'Sign in to The Margins');
    heading.id = 'membership';
    const intro = element('p', 'Receive a code by email to like a field note, leave a comment, or ask to become a member.', 'community-help');
    const requestForm = element('form', null, 'community-form');
    const emailField = field('Email address', 'email', {required:true, autoComplete:'email', maxLength:254});
    const requestButton = button('Email me a code', 'submit');
    const feedback = status();
    requestForm.append(emailField.wrap, requestButton, feedback);
    const verifyForm = element('form', null, 'community-form');
    verifyForm.hidden = true;
    const code = field('Code from your email', 'text', {required:true, minLength:6, maxLength:10, inputMode:'numeric', autoComplete:'one-time-code', pattern:'[0-9]{6,10}'});
    const name = field('Display name', 'text', {required:true, maxLength:80, autoComplete:'nickname'});
    const nameHelp = element('p', 'This name will appear with your field notes and comments.', 'community-help');
    const verifyButton = button('Sign in', 'submit');
    const changeEmail = button('Use another email');
    changeEmail.classList.add('community-button-quiet');
    const verifyFeedback = status();
    const actions = element('div', null, 'community-form-actions');
    actions.append(verifyButton, changeEmail);
    verifyForm.append(code.wrap, name.wrap, nameHelp, actions, verifyFeedback);
    let requestedEmail = '';
    requestForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!requestForm.reportValidity()) return;
      requestButton.disabled = true;
      message(feedback, 'Requesting your code…');
      try {
        requestedEmail = emailField.input.value.trim();
        await api('request-code', {email:requestedEmail});
        requestForm.hidden = true;
        verifyForm.hidden = false;
        message(verifyFeedback, 'Enter the code sent to ' + requestedEmail + '.');
        code.input.focus();
      } catch (error) { message(feedback, errorMessage(error), true); }
      finally { requestButton.disabled = false; }
    });
    changeEmail.addEventListener('click', () => {
      verifyForm.hidden = true;
      requestForm.hidden = false;
      code.input.value = '';
      message(feedback, '');
      emailField.input.focus();
    });
    verifyForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!verifyForm.reportValidity()) return;
      const displayName = name.input.value.trim();
      if (!displayName) { message(verifyFeedback, 'Please enter a display name.', true); return; }
      verifyButton.disabled = true;
      changeEmail.disabled = true;
      message(verifyFeedback, 'Signing in…');
      try {
        const result = await api('verify', {email:requestedEmail, token:code.input.value.trim(), name:displayName});
        state.user = result.user || (result.id ? result : null);
        if (!state.user) state.user = (await api('session')).user;
        if (!state.user) throw new Error('Sign-in could not be confirmed. Please request a new code.');
        updateAccountLinks();
        renderAccount();
      } catch (error) { message(verifyFeedback, errorMessage(error), true); }
      finally { verifyButton.disabled = false; changeEmail.disabled = false; }
    });
    accountUI.append(heading, intro, requestForm, verifyForm);
  }

  function renderMembership() {
    const section = element('section', null, 'community-membership');
    section.id = 'membership';
    if (canContribute()) {
      section.append(element('h2', 'Ready to share a story?'),
        element('p', 'As a member, you can share a field note below or send an article to Jerry.', 'community-help'));
      const article = element('a', 'Send an article');
      article.href = 'mailto:xingtong.themargins@gmail.com?subject=' + encodeURIComponent('Article submission — The Margins');
      section.append(article);
      return section;
    }
    section.append(element('h2', 'Want to share your own stories?'));
    if (state.user.membership === 'pending') {
      section.append(element('p', 'Your request is with Jerry. You can still join the conversation in Field Notes.', 'community-help'));
      const check = button('Check request status');
      const feedback = status();
      check.addEventListener('click', async () => {
        check.disabled = true;
        try {
          state.user = (await api('session')).user || null;
          updateAccountLinks();
          renderAccount();
        } catch (error) { message(feedback, errorMessage(error), true); }
        finally { check.disabled = false; }
      });
      section.append(check, feedback);
      return section;
    }
    section.append(element('p', 'Become a member to contribute field notes and articles.', 'community-help'));
    if (state.user.membership === 'rejected') {
      section.append(element('p', "Your last request wasn't approved. You're welcome to introduce yourself again.", 'community-help'));
    }
    const open = button('Become a member');
    const form = element('form', null, 'community-form');
    form.id = 'membership-request';
    form.hidden = true;
    open.setAttribute('aria-expanded', 'false');
    open.setAttribute('aria-controls', form.id);
    const introduction = field('A little about you (optional)', 'textarea', {maxLength:1000, rows:3});
    const send = button('Send request', 'submit');
    const feedback = status();
    form.append(introduction.wrap, send, feedback);
    open.addEventListener('click', () => {
      form.hidden = !form.hidden;
      open.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) introduction.input.focus();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (send.disabled || !form.reportValidity()) return;
      send.disabled = true;
      message(feedback, 'Sending your request…');
      try {
        const result = await api('request-membership', {message:introduction.input.value.trim()});
        state.user = {...state.user, membership:result.membership || 'pending', isMember:result.isMember === true};
        updateAccountLinks();
        renderAccount();
      } catch (error) { message(feedback, errorMessage(error), true); }
      finally { send.disabled = false; }
    });
    section.append(open, form);
    return section;
  }

  function fileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('This photo could not be read. Please choose it again.'));
      reader.onabort = () => reject(new Error('Reading this photo was cancelled.'));
      reader.readAsDataURL(file);
    });
  }

  function renderEditor(refreshMine) {
    const section = element('section', null, 'community-editor');
    section.id = 'share-a-note';
    const heading = element('h2', 'Share a field note');
    const intro = element('p', 'A few photos and a few words about what you noticed. Each submission is read before it appears.', 'community-help');
    const form = element('form', null, 'community-form');
    const title = field('Title', 'text', {required:true, maxLength:120});
    const text = field('What did you notice?', 'textarea', {maxLength:4000, rows:7});
    const date = field('Date of your observation or photos', 'date', {required:true});
    const photos = field('Add photos (optional)', 'file', {accept:'image/jpeg,image/png,image/webp', multiple:true});
    const photoHelp = element('p', 'Up to 4 JPG, PNG, or WebP photos, 2 MB each. Add a short description for each image.', 'community-help');
    const photoList = element('ul', null, 'community-upload-list');
    const permissionWrap = element('label', null, 'community-permission');
    const permission = element('input');
    permission.type = 'checkbox';
    permission.required = true;
    permissionWrap.append(permission, element('span', 'I wrote this note and own these photos, or have permission to share them on The Margins.'));
    const submit = button('Submit for review', 'submit');
    const feedback = status();
    let entries = [];
    let submitting = false;
    function updateSubmit() {
      submit.disabled = submitting || entries.some(entry => !entry.path);
      photos.input.disabled = submitting;
    }
    function removeEntry(entry) {
      entries = entries.filter(item => item !== entry);
      entry.removed = true;
      entry.row.remove();
      updateSubmit();
    }
    async function upload(entry) {
      entry.path = '';
      entry.retry.hidden = true;
      entry.progress.setAttribute('aria-busy', 'true');
      message(entry.progress, 'Reading photo…');
      updateSubmit();
      try {
        const base64 = await fileBase64(entry.file);
        if (entry.removed) return;
        message(entry.progress, 'Uploading…');
        const result = await api('upload', {base64, mime:entry.file.type});
        if (typeof result.path !== 'string' || !result.path) throw new Error('The upload was not confirmed. Please try again.');
        entry.path = result.path;
        message(entry.progress, 'Uploaded');
      } catch (error) {
        message(entry.progress, errorMessage(error), true);
        entry.retry.hidden = false;
      } finally {
        entry.progress.setAttribute('aria-busy', 'false');
        updateSubmit();
      }
    }
    photos.input.addEventListener('change', () => {
      const selected = [...(photos.input.files || [])];
      photos.input.value = '';
      if (entries.length + selected.length > 4) { message(feedback, 'You can add up to four photos. Remove one before choosing more.', true); return; }
      if (selected.some(file => !acceptedImages.has(file.type) || file.size > 2 * 1024 * 1024 || file.size === 0)) {
        message(feedback, 'Choose JPG, PNG, or WebP photos between 1 byte and 2 MB. Your photos have not been changed.', true);
        return;
      }
      message(feedback, '');
      selected.forEach(file => {
        const row = element('li', null, 'community-upload');
        const caption = element('p', file.name, 'community-upload-name');
        const alt = field('Image description for ' + file.name, 'text', {required:true, maxLength:300});
        const progress = status();
        const remove = button('Remove photo');
        const retry = button('Retry upload');
        remove.classList.add('community-button-quiet');
        retry.hidden = true;
        const actions = element('div', null, 'community-form-actions');
        actions.append(retry, remove);
        row.append(caption, alt.wrap, progress, actions);
        const entry = {file, row, alt:alt.input, progress, retry, path:'', removed:false};
        remove.addEventListener('click', () => removeEntry(entry));
        retry.addEventListener('click', () => upload(entry));
        entries.push(entry);
        photoList.append(row);
        upload(entry);
      });
    });
    form.append(title.wrap, text.wrap, date.wrap, photos.wrap, photoHelp, photoList, permissionWrap, submit, feedback);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submitting || !form.reportValidity()) return;
      if (entries.some(entry => !entry.path)) { message(feedback, 'Wait for every photo to finish uploading, or remove any failed upload.', true); return; }
      if (!permission.checked) { message(feedback, 'Please confirm that you have permission to share this note.', true); return; }
      if (!title.input.value.trim() || (!text.input.value.trim() && !entries.length)) { message(feedback, 'Please add a title, and either a photo or a few words about your observation.', true); return; }
      submitting = true;
      updateSubmit();
      message(feedback, 'Submitting your field note…');
      try {
        await api('submit', {
          title:title.input.value.trim(), text:text.input.value.trim(), date:date.input.value, permission:permission.checked,
          media:entries.map(entry => ({path:entry.path, alt:entry.alt.value.trim()}))
        });
        entries.forEach(entry => { entry.removed = true; });
        entries = [];
        photoList.replaceChildren();
        form.reset();
        message(feedback, 'Your field note was submitted for review. It is not public yet.');
        refreshMine();
      } catch (error) { message(feedback, errorMessage(error), true); }
      finally { submitting = false; updateSubmit(); }
    });
    section.append(heading, intro, form);
    return section;
  }

  function renderMine() {
    const section = element('section', null, 'community-mine');
    section.append(element('h2', 'Your submissions'));
    const feedback = status();
    const list = element('div', null, 'community-submissions');
    section.append(feedback, list);
    async function refresh() {
      message(feedback, 'Loading your submissions…');
      try {
        const result = await api('mine');
        const notes = Array.isArray(result.notes) ? result.notes : [];
        list.replaceChildren();
        notes.forEach(note => {
          const card = noteCard(note, true);
          const labels = {pending:'Awaiting review', approved:'Published', published:'Published', rejected:'Not published'};
          card.append(element('p', labels[note.status] || 'Status unavailable', 'community-submission-status'));
          list.append(card);
        });
        message(feedback, notes.length ? '' : 'You have not submitted a field note yet.');
      } catch (error) { message(feedback, errorMessage(error), true); }
    }
    refresh();
    return {section, refresh};
  }

  function renderReview(refreshMine) {
    const section = element('section', null, 'community-review');
    section.append(element('h2', 'Review submissions'));
    const feedback = status();
    const refreshButton = button('Refresh review list');
    const list = element('div');
    section.append(refreshButton, feedback, list);
    async function refresh() {
      refreshButton.disabled = true;
      message(feedback, 'Loading submissions for review…');
      try {
        const result = await api('review');
        list.replaceChildren();
        const notes = Array.isArray(result.notes) ? result.notes : [];
        const comments = Array.isArray(result.comments) ? result.comments : [];
        const requests = Array.isArray(result.requests) ? result.requests : [];
        const addActions = (card, item, kind) => {
          const actions = element('div', null, 'community-form-actions');
          const approve = button('Approve');
          const reject = button('Reject');
          reject.classList.add('community-button-quiet');
          const itemFeedback = status();
          actions.append(approve, reject);
          card.append(actions, itemFeedback);
          [approve, reject].forEach(control => control.addEventListener('click', async () => {
            approve.disabled = reject.disabled = true;
            try {
              await api('moderate', {kind, id:item.id, approve:control === approve});
              card.remove();
              const label = {note:'Field note', comment:'Comment', membership:'Membership request'}[kind];
              message(feedback, label + (control === approve ? ' approved.' : ' rejected.'));
              if (kind === 'note') refreshMine();
            } catch (error) {
              message(itemFeedback, errorMessage(error), true);
              approve.disabled = reject.disabled = false;
            }
          }));
          list.append(card);
        };
        requests.forEach(request => {
          const card = element('article', null, 'community-submission');
          card.append(element('h3', (request.name || 'Reader') + ' wants to join'));
          if (dateLabel(request.createdAt)) card.append(element('p', dateLabel(request.createdAt), 'community-help'));
          card.append(element('p', request.message || 'No introduction included.'));
          addActions(card, request, 'membership');
        });
        notes.forEach(note => addActions(noteCard(note, true), note, 'note'));
        comments.forEach(comment => {
          const card = element('article', null, 'community-submission');
          card.append(element('h3', 'Comment by ' + (comment.name || 'Reader')));
          if (comment.noteId) {
            const context = element('p', null, 'community-help');
            const link = element('a', comment.noteTitle || 'View the field note');
            link.href = '/field-notes/#' + String(comment.noteId).replace(/[^a-zA-Z0-9_-]/g, '-');
            context.append(link);
            card.append(context);
          }
          card.append(element('p', comment.text || '', 'community-comment-text'));
          addActions(card, comment, 'comment');
        });
        message(feedback, requests.length || notes.length || comments.length ? '' : 'There are no submissions awaiting review.');
      } catch (error) { message(feedback, errorMessage(error), true); }
      finally { refreshButton.disabled = false; }
    }
    refreshButton.addEventListener('click', refresh);
    refresh();
    return section;
  }

  function renderAccount() {
    if (!account) return;
    accountUI = accountUI || element('div', null, 'community-ui');
    accountUI.replaceChildren();
    account.append(accountUI);
    if (!state.user) { renderLogin(); return; }
    const top = element('div', null, 'community-account-heading');
    top.append(element('h2', 'Hello, ' + state.user.name));
    const signOut = button('Sign out');
    signOut.classList.add('community-button-quiet');
    const feedback = status();
    top.append(signOut);
    accountUI.append(top, feedback);
    signOut.addEventListener('click', async () => {
      signOut.disabled = true;
      try {
        await api('logout', {});
        state.user = null;
        updateAccountLinks();
        renderAccount();
      } catch (error) { message(feedback, errorMessage(error), true); signOut.disabled = false; }
    });
    accountUI.append(renderMembership());
    if (canContribute()) {
      const mine = renderMine();
      accountUI.append(renderEditor(mine.refresh), mine.section);
      if (state.user.isAdmin) accountUI.append(renderReview(mine.refresh));
    }
  }

  async function start() {
    try {
      const config = await api('status');
      if (!config.ready) {
        showUnavailable('Online accounts are not available yet. You can share a field note or join The Margins by email.');
        return;
      }
      const session = await api('session');
      state.ready = true;
      state.user = session.user || null;
      if (availability) message(availability, '');
      updateAccountLinks();
      renderAccount();
      if ('IntersectionObserver' in window) {
        observer = new window.IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0) {
              visibleNotes.add(entry.target);
              if (isVisible()) loadNote(state.notes.get(entry.target.dataset.noteId));
            } else visibleNotes.delete(entry.target);
          });
        }, {threshold:[0, 0.1]});
      }
      attachNotes();
      loadFeed();
      const resume = () => {
        if (!isVisible()) return;
        visibleNotes.forEach(article => loadNote(state.notes.get(article.dataset.noteId)));
      };
      document.addEventListener('visibilitychange', resume);
      document.addEventListener('prerenderingchange', resume);
    } catch {
      showUnavailable('Community accounts could not be reached. Please try again later, or send your field note by email.');
    }
  }

  start();
})();
