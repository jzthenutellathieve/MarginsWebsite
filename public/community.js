(() => {
  'use strict';

  const account = document.querySelector('#community-account');
  const feed = document.querySelector('#community-feed');
  const noteWriter = document.querySelector('[data-note-composer]');
  const composeDetails = noteWriter?.closest('details');
  const accountLinks = [...document.querySelectorAll('[data-community-account]')];
  const contributeLinks = [...document.querySelectorAll('[data-community-contribute]')];
  const availability = document.querySelector('[data-community-status]');
  const state = {ready:false, user:null, notes:new Map()};
  const visibleNotes = new Set();
  const acceptedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);
  let fieldSequence = 0;
  let accountUI;
  const loginCleanups = new WeakMap();
  const editorBindings = new WeakMap();
  let sessionGeneration = 0, sessionKnown = false, unavailable = false;
  let notesStarted = false;
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
      const response = await fetch('/api/community/?' + params.toString(), {
        method:body === undefined ? 'GET' : 'POST',
        credentials:'same-origin', cache:'no-store', signal:controller.signal,
        ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : '';
        const error = new Error(detail || (response.status === 401 ? 'Please sign in again to continue.' : 'This service is temporarily unavailable. Please try again.'));
        error.status = response.status;
        if (response.status===401 && state.user && !['session','verify','request-code'].includes(action)) void syncSession();
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

  function updateAccountLinks(signedIn=!!state.user) {
    const value=signedIn ? 'member' : 'guest';
    if (document.documentElement) document.documentElement.dataset.viewer=value;
    // A presentation preference only. Authentication stays in HttpOnly cookies.
    try { document.cookie='__Host-margins-ui='+value+'; Path=/; Max-Age=31536000; SameSite=Lax; Secure'; } catch {}
    accountLinks.forEach(link => {
      link.href = '/account/';
      if (!link.querySelector('[data-account-label]')) link.textContent = signedIn ? 'My profile' : 'Log in / Sign up';
    });
    contributeLinks.forEach(link => {
      link.setAttribute('href','/field-notes/#share-a-note');
    });
  }

  function canContribute() {
    return !!state.user;
  }

  function showUnavailable(text) {
    state.ready = false;
    unavailable=true;
    document.querySelectorAll('[data-note-interactions]').forEach(item => { item.hidden = true; });
    if (availability) message(availability, text);
    const host = account || noteWriter;
    if (!host) return;
    host.setAttribute('aria-busy','false');
    if (host.querySelector('.community-retry')) return;
    const retry=button('Retry'), notice=element('div',null,'community-retry');
    if (!availability) notice.append(element('p',text,'community-status'));
    retry.addEventListener('click',()=>{notice.remove();syncSession();});
    notice.append(retry); host.append(notice);
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
      if (availability) message(availability, 'Notes could not be loaded. Please try again.');
    }
  }

  function renderLogin(host) {
    const heading = element('h2', 'Join or log in');
    heading.id = 'membership'; // Keep existing links to this account section working.
    const requestForm = element('form', null, 'community-form');
    const emailField = field('Email address', 'email', {required:true, autocomplete:'email', maxLength:254});
    const requestButton = button('Email me a code', 'submit');
    const feedback = status();
    requestForm.append(emailField.wrap, requestButton, feedback);
    const verifyForm = element('form', null, 'community-form');
    verifyForm.hidden = true;
    const destination = element('p', '', 'community-code-destination');
    const code = field('Code from your email', 'text', {required:true, minLength:6, maxLength:10, inputMode:'numeric', autocomplete:'one-time-code', pattern:'[0-9]{6,10}'});
    const deliveryHelp = element('p', 'Look for an email from accounts@themarginsjournals.com, including in Spam or All Mail. Codes expire after 10 minutes.', 'community-help');
    const name = field('Display name (optional)', 'text', {maxLength:80, autocomplete:'nickname'});
    const nameHelp = element('p', 'New here? Choose the name to show with your notes and comments. Leave this blank to keep your existing name.', 'community-help');
    const verifyButton = button('Sign in', 'submit');
    const changeEmail = button('Use another email');
    changeEmail.classList.add('community-button-quiet');
    const resend = button('Resend code');
    resend.classList.add('community-button-quiet');
    const verifyFeedback = status();
    const actions = element('div', null, 'community-form-actions');
    actions.append(verifyButton, resend, changeEmail);
    verifyForm.append(destination, code.wrap, deliveryHelp, name.wrap, nameHelp, actions, verifyFeedback);
    let requestedEmail = '';
    let resendTimer;
    let resendReady = false;
    function updateResend() {
      resend.disabled = !resendReady || Boolean(verifyButton.disabled);
      resend.textContent = resendReady ? 'Resend code' : 'Resend available in 1 minute';
    }
    function waitToResend() {
      window.clearTimeout(resendTimer);
      resendReady = false;
      updateResend();
      resendTimer = window.setTimeout(() => {
        resendReady = true;
        updateResend();
      }, 60000);
    }
    loginCleanups.set(host, () => window.clearTimeout(resendTimer));
    requestForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (requestButton.disabled || !requestForm.reportValidity()) return;
      requestButton.disabled = true;
      message(feedback, 'Requesting your code…');
      try {
        requestedEmail = emailField.input.value.trim();
        await api('request-code', {email:requestedEmail});
        requestForm.hidden = true;
        verifyForm.hidden = false;
        destination.textContent = 'Check ' + requestedEmail + ' for your code.';
        message(verifyFeedback, '');
        waitToResend();
        code.input.focus();
      } catch (error) { message(feedback, errorMessage(error), true); }
      finally { requestButton.disabled = false; }
    });
    changeEmail.addEventListener('click', () => {
      window.clearTimeout(resendTimer);
      verifyForm.hidden = true;
      requestForm.hidden = false;
      code.input.value = '';
      message(feedback, '');
      emailField.input.focus();
    });
    resend.addEventListener('click', async () => {
      if (resend.disabled) return;
      resend.disabled = verifyButton.disabled = changeEmail.disabled = true;
      message(verifyFeedback, 'Requesting another code…');
      try {
        await api('request-code', {email:requestedEmail});
        code.input.value = '';
        message(verifyFeedback, 'Check your email and enter the latest code.');
        code.input.focus();
      } catch (error) { message(verifyFeedback, errorMessage(error), true); }
      finally {
        waitToResend();
        verifyButton.disabled = changeEmail.disabled = false;
        updateResend();
      }
    });
    verifyForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (verifyButton.disabled || !verifyForm.reportValidity()) return;
      const displayName = name.input.value.trim();
      verifyButton.disabled = true;
      changeEmail.disabled = true;
      updateResend();
      message(verifyFeedback, 'Signing in…');
      try {
        const result = await api('verify', {email:requestedEmail, token:code.input.value.trim(), ...(displayName ? {name:displayName} : {})});
        state.user = result.user || (result.id ? result : null);
        if (!state.user) state.user = (await api('session')).user;
        if (!state.user) throw new Error('Sign-in could not be confirmed. Please request a new code.');
        acceptAuthChange(state.user);
      } catch (error) { message(verifyFeedback, errorMessage(error), true); }
      finally { verifyButton.disabled = false; changeEmail.disabled = false; updateResend(); }
    });
    host.append(heading, requestForm, verifyForm);
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

  function portrait(user) {
    const wrap = element('span', null, 'community-avatar');
    const src = safeImageURL(user.avatar);
    if (src) {
      const photo = element('img');
      photo.src = src;
      photo.alt = 'Your profile photo';
      photo.width = photo.height = 80;
      wrap.append(photo);
    } else {
      wrap.textContent = Array.from(user.name || 'Reader').slice(0,1).join('').toUpperCase();
      wrap.setAttribute('aria-hidden', 'true');
    }
    return wrap;
  }

  function paintProfile(summary,user) {
    const banner=element('div',null,'community-profile-banner');
    banner.style.setProperty('--profile-color',/^#[0-9a-f]{6}$/i.test(user.backgroundColor||'') ? user.backgroundColor : '#e5ece7');
    const src=safeImageURL(user.background);
    if (src) { const img=element('img'); img.src=src; img.alt=''; banner.append(img); }
    const identity=element('div',null,'community-profile-identity');
    const info=element('div'); info.append(element('h2',user.name));
    if (user.bio) info.append(element('p',user.bio,'community-profile-bio'));
    identity.append(portrait(user),info); summary.replaceChildren(banner,identity);
  }

  function appearanceForm() {
    const owner=state.user.id, form=element('form',null,'community-form community-appearance');
    const bio=field('Short bio','textarea',{maxLength:240,rows:2,value:state.user.bio||''});
    const color=field('Background color','color',{value:state.user.backgroundColor||'#e5ece7'});
    const photo=field('Background photo (optional)','file',{accept:'image/jpeg,image/png,image/webp'});
    const remove=button('Remove background photo'); remove.classList.add('community-button-quiet'); remove.hidden=!state.user.background;
    const save=button('Save appearance','submit'), feedback=status(); let erase=false;
    const actions=element('div',null,'community-form-actions'); actions.append(save,remove);
    form.append(element('h3','Profile appearance'),bio.wrap,color.wrap,photo.wrap,element('p','JPG, PNG or WebP, up to 2 MB.','community-help'),actions,feedback);
    photo.input.addEventListener('change',()=>{ erase=false; message(feedback,''); });
    remove.addEventListener('click',()=>{ erase=true; photo.input.value=''; message(feedback,'Save appearance to remove the background photo.'); });
    form.addEventListener('submit',async event=>{
      event.preventDefault(); if (save.disabled || state.user?.id!==owner || !form.reportValidity()) return;
      const file=photo.input.files?.[0];
      if (file && (!acceptedImages.has(file.type)||file.size>2*1024*1024||!file.size)) { message(feedback,'Choose a JPG, PNG or WebP photo up to 2 MB.',true); return; }
      const controls=[save,remove,bio.input,color.input,photo.input]; controls.forEach(c=>{c.disabled=true;});
      try {
        const body={bio:bio.input.value.trim(),backgroundColor:color.input.value};
        if (file) body.background={base64:await fileBase64(file),mime:file.type}; else if (erase) body.background=null;
        if (state.user?.id!==owner) return;
        const result=await api('appearance',body);
        if (result.user?.id!==owner || state.user?.id!==owner) throw new Error('Please reload your profile.');
        state.user=result.user;
        paintProfile(accountUI.querySelector('.community-profile-summary'),state.user);
        photo.input.value=''; bio.input.value=state.user.bio||''; color.input.value=state.user.backgroundColor; remove.hidden=!state.user.background; erase=false;
        message(feedback,'Appearance saved.');
      } catch (error) {message(feedback,errorMessage(error),true);} finally {controls.forEach(c=>{c.disabled=false;});}
    });
    return form;
  }

  function renderProfile() {
    const userId = state.user.id;
    const section = element('section', null, 'community-profile');
    section.id = 'my-profile';
    section.append(element('h2', 'Profile details'));
    const form = element('form', null, 'community-form');
    const name = field('Display name', 'text', {required:true,maxLength:80,autocomplete:'nickname',value:state.user.name});
    const photo = field('Profile photo', 'file', {accept:'image/jpeg,image/png,image/webp'});
    const help = element('p', 'JPG, PNG or WebP, up to 2 MB. Your display name appears with your notes and comments.', 'community-help');
    const remove = button('Remove photo');
    remove.classList.add('community-button-quiet');
    remove.hidden = !state.user.avatar;
    let removePhoto = false;
    const save = button('Save changes', 'submit');
    const feedback = status();
    const actions = element('div', null, 'community-form-actions');
    actions.append(save,remove);
    photo.input.addEventListener('change', () => {
      removePhoto = false;
      message(feedback, '');
      const file = photo.input.files?.[0];
      if (file && (!acceptedImages.has(file.type) || file.size > 2 * 1024 * 1024)) {
        photo.input.value = '';
        message(feedback, 'Choose a JPG, PNG or WebP photo up to 2 MB.', true);
      }
    });
    remove.addEventListener('click', () => {
      removePhoto = true;
      photo.input.value = '';
      message(feedback, 'Save changes to remove your photo.');
    });
    form.append(name.wrap,photo.wrap,help,actions,feedback);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (save.disabled || !form.reportValidity()) return;
      const displayName = name.input.value.trim();
      if (!displayName) { message(feedback, 'Please enter a display name.', true); return; }
      const file = photo.input.files?.[0];
      if (file && (!acceptedImages.has(file.type) || file.size > 2 * 1024 * 1024)) {
        message(feedback, 'Choose a JPG, PNG or WebP photo up to 2 MB.', true);
        return;
      }
      save.disabled = remove.disabled = photo.input.disabled = name.input.disabled = true;
      message(feedback, 'Saving your profile…');
      try {
        const body = {name:displayName};
        if (file) body.avatar = {mime:file.type,base64:await fileBase64(file)};
        else if (removePhoto) body.avatar = null;
        if (state.user?.id!==userId) return;
        const result = await api('profile',body);
        if (!result.user || result.user.id !== userId) throw new Error('The profile update could not be confirmed. Please reload and try again.');
        if (state.user?.id !== userId) return;
        state.user = result.user;
        const summary = accountUI.querySelector('.community-profile-summary');
        if (summary) paintProfile(summary,state.user);
        name.input.value = state.user.name;
        photo.input.value = '';
        remove.hidden = !state.user.avatar;
        removePhoto = false;
        message(feedback, 'Profile saved.');
      } catch (error) { message(feedback,errorMessage(error),true); }
      finally { save.disabled = remove.disabled = photo.input.disabled = name.input.disabled = false; }
    });
    section.append(form,appearanceForm());
    return section;
  }

  function renderEditor(refreshMine,inline=false) {
    const section = element('section', null, 'community-editor');
    section.id = inline ? 'notes-composer' : 'share-a-note';
    const heading = element('h2', 'Write a note');
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
    const discard = button('Discard draft'); discard.classList.add('community-button-quiet');
    const feedback = status();
    let entries = [];
    let submitting = false, owner=null;
    const key=()=> 'margins.note-draft.v1:'+owner;
    function writeDraft() {
      if (!owner || state.user?.id!==owner) return;
      const draft={title:title.input.value,text:text.input.value,date:date.input.value,
        photos:entries.filter(e=>e.path).map(e=>({path:e.path,name:e.name,alt:e.alt.value}))};
      try { if (draft.title||draft.text||draft.date||draft.photos.length) window.localStorage.setItem(key(),JSON.stringify(draft)); else window.localStorage.removeItem(key()); } catch {}
    }
    function bind(id) {
      if (!id || owner===id) return;
      owner=id;
      let draft;
      try { draft=JSON.parse(window.localStorage.getItem(key())); } catch {}
      if (draft && typeof draft==='object') {
        for (const [input,k,max] of [[title.input,'title',120],[text.input,'text',4000],[date.input,'date',10]]) {
          if (!input.value && typeof draft[k]==='string') input.value=draft[k].slice(0,max);
        }
        for (const img of (Array.isArray(draft.photos)?draft.photos:[]).slice(0,4)) {
          if (typeof img?.path==='string' && img.path.startsWith(id+'/') && /^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(img.path)) addEntry(null,img);
        }
      }
      writeDraft(); updateSubmit();
    }
    editorBindings.set(section,{get owner(){return owner;},bind});
    function updateSubmit() {
      const active=!!owner && state.user?.id===owner;
      submit.disabled = !active || submitting || entries.some(entry => !entry.path);
      photos.input.disabled = !active || submitting;
      discard.disabled=submitting;
    }
    function removeEntry(entry) {
      entries = entries.filter(item => item !== entry);
      entry.removed = true;
      entry.row.remove();
      writeDraft();
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
        if (entry.removed || state.user?.id!==owner) return;
        message(entry.progress, 'Uploading…');
        const result = await api('upload', {base64, mime:entry.file.type});
        if (typeof result.path !== 'string' || !result.path) throw new Error('The upload was not confirmed. Please try again.');
        entry.path = result.path;
        writeDraft();
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
      selected.forEach(file => addEntry(file));
    });
    function addEntry(file,stored) {
        const name=String(stored?.name || file?.name || 'Photo').slice(0,255);
        const row = element('li', null, 'community-upload');
        const caption = element('p', name, 'community-upload-name');
        const alt = field('Image description for ' + name, 'text', {required:true, maxLength:300,value:String(stored?.alt||'').slice(0,300)});
        const progress = status();
        const remove = button('Remove photo');
        const retry = button('Retry upload');
        remove.classList.add('community-button-quiet');
        retry.hidden = true;
        const actions = element('div', null, 'community-form-actions');
        actions.append(retry, remove);
        row.append(caption, alt.wrap, progress, actions);
        const entry = {file,name,row,alt:alt.input,progress,retry,path:stored?.path||'',removed:false};
        remove.addEventListener('click', () => removeEntry(entry));
        retry.addEventListener('click', () => upload(entry));
        entries.push(entry);
        photoList.append(row);
        if (file) upload(entry); else message(progress,'Uploaded');
    }
    function clearDraft() {
      entries.forEach(entry => { entry.removed = true; }); entries=[]; photoList.replaceChildren(); form.reset();
      // Reset values explicitly as well for restored fields and the permission checkbox.
      title.input.value=text.input.value=date.input.value=''; permission.checked=false;
      if (owner) try { window.localStorage.removeItem(key()); } catch {}
      updateSubmit();
    }
    discard.addEventListener('click',()=>{
      if (!submitting && window.confirm('Discard this draft?')) { clearDraft(); message(feedback,''); }
    });
    form.addEventListener('input',writeDraft);
    form.addEventListener('change',writeDraft);
    const controls=element('div',null,'community-form-actions'); controls.append(submit,discard);
    form.append(title.wrap, text.wrap, date.wrap, photos.wrap, photoHelp, photoList, permissionWrap, controls, feedback);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!owner || state.user?.id!==owner || submitting || !form.reportValidity()) return;
      if (entries.some(entry => !entry.path)) { message(feedback, 'Wait for every photo to finish uploading, or remove any failed upload.', true); return; }
      if (!permission.checked) { message(feedback, 'Please confirm that you have permission to share this note.', true); return; }
      if (!title.input.value.trim() || (!text.input.value.trim() && !entries.length)) { message(feedback, 'Please add a title, and either a photo or a few words about your observation.', true); return; }
      submitting = true;
      updateSubmit();
      message(feedback, 'Submitting your note…');
      try {
        await api('submit', {
          title:title.input.value.trim(), text:text.input.value.trim(), date:date.input.value, permission:permission.checked,
          media:entries.map(entry => ({path:entry.path, alt:entry.alt.value.trim()}))
        });
        clearDraft();
        message(feedback, 'Submitted for review.');
        refreshMine();
      } catch (error) { message(feedback, errorMessage(error), true); }
      finally { submitting = false; updateSubmit(); }
    });
    if (!inline) section.append(heading);
    section.append(form);
    bind(state.user?.id); updateSubmit();
    return section;
  }

  function renderMine() {
    const section = element('section', null, 'community-mine');
    section.id = 'my-notes';
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
        message(feedback, notes.length ? '' : 'You have not submitted a note yet.');
      } catch (error) { message(feedback, errorMessage(error), true); }
    }
    refresh();
    return {section, refresh};
  }

  function renderReview(refreshMine) {
    const section = element('section', null, 'community-review');
    section.id = 'editor-review';
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
              const label = {note:'Note', comment:'Comment'}[kind];
              message(feedback, label + (control === approve ? ' approved.' : ' rejected.'));
              if (kind === 'note') refreshMine();
            } catch (error) {
              message(itemFeedback, errorMessage(error), true);
              approve.disabled = reject.disabled = false;
            }
          }));
          list.append(card);
        };
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
        message(feedback, notes.length || comments.length ? '' : 'There are no submissions awaiting review.');
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
    loginCleanups.get(accountUI)?.(); loginCleanups.delete(accountUI);
    accountUI.replaceChildren();
    account.append(accountUI);
    account.setAttribute('aria-busy','false');
    if (!state.user) { renderLogin(accountUI); return; }
    const top = element('div', null, 'community-account-heading');
    const summary = element('div',null,'community-profile-summary');
    paintProfile(summary,state.user);
    top.append(summary);
    const signOut = button('Sign out');
    signOut.classList.add('community-button-quiet');
    const feedback = status();
    top.append(signOut);
    const nav = element('nav', null, 'community-account-nav');
    nav.setAttribute('aria-label', 'Your account');
    const destinations = [['Write a note', '#share-a-note'], ['Your submissions', '#my-notes'], ['Edit profile', '#my-profile']];
    if (state.user.isAdmin) destinations.push(['Review submissions', '#editor-review']);
    destinations.forEach(([label, href]) => {
      const link = element('a', label);
      link.href = href;
      nav.append(link);
    });
    accountUI.append(top, nav, feedback);
    signOut.addEventListener('click', async () => {
      signOut.disabled = true;
      try {
        await api('logout', {});
        acceptAuthChange(null);
      } catch (error) { message(feedback, errorMessage(error), true); signOut.disabled = false; syncSession(); }
    });
    if (canContribute()) {
      const mine = renderMine();
      accountUI.append(renderEditor(mine.refresh), mine.section);
      if (state.user.isAdmin) accountUI.append(renderReview(mine.refresh));
    }
    accountUI.append(renderProfile());
    const articleHelp = element('p', null, 'community-help');
    const articleLink = element('a', 'Send a full-length article to the editor');
    articleLink.href = 'mailto:xingtong.themargins@gmail.com?subject=' + encodeURIComponent('Article submission — The Margins');
    articleHelp.append(articleLink);
    accountUI.append(articleHelp);
  }

  function renderNotesWriter() {
    if (!noteWriter || !composeDetails?.open) return;
    const existing=noteWriter.querySelector('.community-editor');
    const hinted=document.documentElement?.dataset.viewer==='member';
    if (state.user || (!sessionKnown && !unavailable && hinted)) {
      if (existing) {
        const binding=editorBindings.get(existing);
        if (!binding.owner || binding.owner===state.user?.id) { binding.bind(state.user?.id); return; }
      }
      loginCleanups.get(noteWriter)?.(); loginCleanups.delete(noteWriter);
      noteWriter.replaceChildren(renderEditor(()=>{},true));
    } else if (state.ready && (!noteWriter.querySelector('form') || existing)) {
      noteWriter.replaceChildren(); renderLogin(noteWriter);
    }
  }

  function clearPrivateUI() {
    for (const host of [accountUI,noteWriter]) if (host) {
      loginCleanups.get(host)?.(); loginCleanups.delete(host); host.replaceChildren();
    }
    for (const item of state.notes.values()) {
      if (item.commentsPanel) { item.commentsPanel.replaceChildren(); item.commentsPanel.hidden=true; item.commentsButton.setAttribute('aria-expanded','false'); }
      if (item.data) { item.data.liked=false; updateCounts(item); }
    }
  }
  function acceptAuthChange(user) {
    ++sessionGeneration; clearPrivateUI(); state.user=user; state.ready=true; sessionKnown=true; unavailable=false;
    updateAccountLinks(); renderAccount(); renderNotesWriter();
    try {window.localStorage.setItem('margins.auth.changed',(user?'member:':'guest:')+Date.now());} catch {}
  }
  function startNotes() {
    if (!feed || notesStarted) return;
    notesStarted=true;
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
    attachNotes(); loadFeed();
    const resume = () => {
      if (isVisible()) visibleNotes.forEach(article => loadNote(state.notes.get(article.dataset.noteId)));
    };
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('prerenderingchange', resume);
  }
  async function syncSession() {
    const generation=++sessionGeneration;
    const full=Boolean(account||feed||noteWriter);
    try {
      const session=await api('session',undefined,account ? {} : {view:full?'writer':'nav'});
      if (generation!==sessionGeneration) return;
      if (session.ready===false) {showUnavailable('Accounts are temporarily unavailable.');return;}
      const previous=state.user?.id;
      const render=!sessionKnown || !state.ready || previous!==(session.user?.id);
      if (full && previous && previous!==session.user?.id) clearPrivateUI();
      state.user=session.user||null; state.ready=sessionKnown=true; unavailable=false;
      updateAccountLinks(full ? !!state.user : session.signedIn===true);
      if (availability) message(availability,'');
      for (const host of [account,noteWriter]) if(host) { host.setAttribute('aria-busy','false'); host.querySelector('.community-retry')?.remove(); }
      if (render) renderAccount();
      renderNotesWriter(); startNotes();
    } catch {
      if (generation===sessionGeneration) showUnavailable('Your account could not be reached.');
    }
  }
  function openComposerAtHash() {
    if (composeDetails && window.location.hash==='#share-a-note') { composeDetails.open=true; renderNotesWriter(); }
  }
  composeDetails?.addEventListener('toggle',()=>{
    if (composeDetails.open && window.location.hash!=='#share-a-note') window.history.replaceState(null,'','#share-a-note');
    else if (!composeDetails.open && window.location.hash==='#share-a-note') window.history.replaceState(null,'',window.location.pathname+window.location.search);
    renderNotesWriter();
  });
  window.addEventListener('hashchange',openComposerAtHash); openComposerAtHash();
  window.addEventListener('pageshow',event=>{
    if (!event.persisted) return;
    // A restored page can belong to a different or signed-out member. Reconfirm
    // its private contents; a transient error never rewrites the remembered label.
    ++sessionGeneration; state.user=null; state.ready=false; sessionKnown=false; clearPrivateUI();
    if (document.documentElement) {
      let viewer='pending'; try {viewer=document.cookie.match(/(?:^|; *)__Host-margins-ui=(member|guest)(?:;|$)/)?.[1]||viewer;} catch {}
      document.documentElement.dataset.viewer=viewer;
    }
    syncSession();
  });
  window.addEventListener('storage',event=>{
    if (event.key!=='margins.auth.changed') return;
    ++sessionGeneration; state.user=null; state.ready=false; sessionKnown=false; clearPrivateUI();
    // The hint can select a label; the server must confirm the new user's identity before restoring a draft or profile.
    if (document.documentElement) document.documentElement.dataset.viewer=String(event.newValue).startsWith('guest:')?'guest':'pending';
    syncSession();
  });
  syncSession();
})();
