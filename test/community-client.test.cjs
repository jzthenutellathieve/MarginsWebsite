const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.parentNode = null;
    this._text = '';
    this.value = '';
    const styles = new Map();
    this.style = {setProperty:(name, value) => styles.set(name, String(value)), getPropertyValue:name => styles.get(name) || ''};
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.contains(name) : force;
        this.classList[enabled ? 'add' : 'remove'](name);
        return enabled;
      }
    };
  }
  get id() { return this.attributes.id || ''; }
  set id(value) { this.attributes.id = String(value); }
  get className() { return this.attributes.class || ''; }
  set className(value) { this.attributes.class = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    this._text = String(value ?? '');
  }
  set innerHTML(value) {
    assert.equal(value, '', 'The community client must create DOM nodes instead of parsing HTML');
    this.textContent = '';
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.firstChild; }
  get parentElement() { return this.parentNode; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'href' || name === 'src') this[name] = String(value);
  }
  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
    return this.attributes[name] ?? this[name] ?? null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
    if (name === 'hidden') this.hidden = false;
  }
  appendChild(child) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...children) {
    children.forEach(child => {
      if (typeof child === 'string') {
        const text = new Element('#text', this.ownerDocument);
        text.textContent = child;
        child = text;
      }
      this.appendChild(child);
    });
  }
  replaceChildren(...children) { this.textContent = ''; this.append(...children); }
  insertBefore(child, next) {
    child.remove();
    const index = this.children.indexOf(next);
    if (index === -1) return this.appendChild(child);
    child.parentNode = this;
    this.children.splice(index, 0, child);
    return child;
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  async emit(name, detail = {}) {
    for (const callback of this.listeners[name] || []) await callback({ target: this, preventDefault() {}, ...detail });
  }
  matches(selector) {
    const attributes = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
    const simple = selector.replace(/\[[^\]]+\]/g, '');
    const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
    const id = simple.match(/#([\w-]+)/)?.[1];
    const classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    return (!tag || this.tagName === tag.toUpperCase()) && (!id || this.id === id) &&
      classes.every(name => this.classList.contains(name)) && attributes.every(([, name, value]) =>
        value === undefined ? this.getAttribute(name) !== null : this.getAttribute(name) === value);
  }
  querySelectorAll(selector) {
    const matches = [];
    const selectors = selector.split(',').map(part => part.trim().split(/\s+/));
    const walk = node => {
      for (const child of node.children) {
        if (selectors.some(parts => {
          if (!child.matches(parts[parts.length - 1])) return false;
          let ancestor = child.parentNode;
          for (let index = parts.length - 2; index >= 0; index--) {
            while (ancestor && !ancestor.matches(parts[index])) ancestor = ancestor.parentNode;
            if (!ancestor) return false;
            ancestor = ancestor.parentNode;
          }
          return true;
        })) matches.push(child);
        walk(child);
      }
    };
    walk(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  focus() {}
  reportValidity() { return true; }
}

function page({ ready = true, unavailable = false, notes = [], noteDetails = {}, user = null, responses = {} } = {}) {
  const document = new Element('document');
  document.ownerDocument = document;
  document.readyState = 'complete';
  document.visibilityState = 'visible';
  document.createElement = tag => new Element(tag, document);
  document.createTextNode = text => {
    const node = new Element('#text', document);
    node.textContent = text;
    return node;
  };
  document.getElementById = id => document.querySelector('#' + id);
  const create = (tag, attributes = {}, text = '') => {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    element.textContent = text;
    return element;
  };
  const body = create('body');
  document.body = body;
  document.append(body);
  const header = create('header');
  const join = create('a', { href: 'mailto:xingtong.themargins@gmail.com?subject=Joining%20The%20Margins', 'data-community-account': '' }, 'Join us');
  const accountLink = join;
  const contributeLink = create('a', {href:'mailto:xingtong.themargins@gmail.com?subject=Field%20Note', 'data-community-contribute':''}, 'Share a field note');
  header.append(join, contributeLink);
  const account = create('section', { id: 'community-account' });
  const fallback = create('p', { 'data-community-fallback': '' }, 'Send a Field Note by email.');
  const status = create('p', { 'data-community-status': '' });
  const feed = create('section', { id: 'community-feed' });
  const staticNotes = [
    ['static-recent', '2026-08-01T00:00:00.000Z', 'Existing August note'],
    ['static-older', '2026-06-01T00:00:00.000Z', 'Existing June note']
  ].map(([id, date, title]) => {
    const article = create('article', { 'data-note-id': id, 'data-note-date': date });
    article.append(create('h2', {}, title), create('p', {}, 'The original published note remains readable.'),
      create('div', { 'data-note-interactions': '' }));
    feed.append(article);
    return article;
  });
  account.append(fallback, status);
  body.append(header, account, feed);
  const requests = [];
  const resendTimers = new Map();
  const window = { document, location: new URL('https://themargins.example/field-notes/'),
    addEventListener() {},
    setTimeout(callback, delay) {
      if (delay === 60000) { const id = {}; resendTimers.set(id, callback); return id; }
      return setTimeout(callback, delay);
    },
    clearTimeout(id) { if (resendTimers.has(id)) resendTimers.delete(id); else clearTimeout(id); }, crypto: { randomUUID: () => 'test-page-load' } };
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const parsed = new URL(url, window.location);
    assert.equal(parsed.pathname, '/api/community/');
    assert.equal(options.credentials, 'same-origin');
    if (unavailable) throw new Error('Network unavailable');
    const action = parsed.searchParams.get('action');
    let payload;
    if (Object.hasOwn(responses, action)) payload = typeof responses[action] === 'function' ? responses[action]() : responses[action];
    else if (action === 'status') payload = { ready };
    else if (action === 'session') payload = { user };
    else if (action === 'feed') payload = { notes };
    else if (action === 'note') payload = { likes: 0, liked: false, views: 0, comments: [], canModerate: false, ...noteDetails };
    else if (action === 'mine') payload = {notes:[]};
    else if (action === 'review') payload = {requests:[], notes:[], comments:[]};
    else if (action === 'like') payload = {likes:1, liked:true};
    else if (['comment', 'moderate', 'request-code'].includes(action)) payload = {};
    else throw new Error('Unexpected community request: ' + action);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const source = fs.readFileSync(path.join(__dirname, '../public/community.js'), 'utf8');
  class FileReader {
    readAsDataURL(file) { this.result = 'data:' + file.type + ';base64,' + file.base64; this.onload(); }
  }
  vm.runInNewContext(source, { document, window, location: window.location, fetch, URL, URLSearchParams, FileReader,
    AbortController, AbortSignal, setTimeout, clearTimeout, console, crypto: window.crypto });
  return { document, feed, account, accountLink, contributeLink, fallback, status, join, staticNotes, requests,
    expireResendTimer() { for (const [id, callback] of resendTimers) { resendTimers.delete(id); callback(); } },
    async settle() { for (let index = 0; index < 6; index++) await new Promise(resolve => setImmediate(resolve)); } };
}

for (const scenario of [{ name: 'unconfigured storage', ready: false }, { name: 'network failure', unavailable: true }]) {
  test(scenario.name + ' preserves published notes and the header email link while hiding account interactions', async () => {
    const app = page(scenario);
    await app.settle();
    assert.deepEqual(app.feed.querySelectorAll('article[data-note-id]'), app.staticNotes);
    assert.match(app.feed.textContent, /The original published note remains readable/);
    assert.equal(new URL(app.join.href).pathname, 'xingtong.themargins@gmail.com');
    assert.equal(new URL(app.join.href).protocol, 'mailto:');
    assert.equal(new URL(app.contributeLink.href).protocol, 'mailto:');
    assert.equal(app.join.hidden, false);
    assert.equal(app.account.hidden, false);
    assert.equal(app.account.querySelectorAll('form').length, 0);
    assert.equal(app.accountLink.hidden, false);
    assert.ok(app.staticNotes.every(note => note.querySelector('[data-note-interactions]').hidden));
    assert.equal(app.fallback.hidden, false);
    assert.equal(app.requests.length, 1);
    assert.equal(new URL(app.requests[0].url, 'https://themargins.example').searchParams.get('action'), 'status');
  });
}

test('published member notes merge with existing notes by publication date, newest first', async () => {
  const notes = [
    { id: 'member-oldest', date: '2026-05-01' },
    { id: 'member-middle', date: '2026-07-01' },
    { id: 'member-newest', date: '2026-09-01' }
  ].map(note => ({ ...note, title: note.id, text: 'A member observation.', author: { name: 'Reader' }, media: [] }));
  const app = page({ notes });
  await app.settle();
  assert.deepEqual(app.feed.querySelectorAll('article[data-note-id]').map(note => note.dataset.noteId),
    ['member-newest', 'static-recent', 'member-middle', 'static-older', 'member-oldest']);
  assert.ok(app.staticNotes.every(note => app.feed.contains(note)), 'Original published DOM nodes are retained');
  assert.equal(app.account.hidden, false);
  assert.ok(app.account.querySelector('form'), 'Online sign-in is available when the backend is ready');
  assert.equal(app.accountLink.textContent, 'Log in / Sign up');
});

test('member notes and comments render literal text and skip unsafe media URLs', async () => {
  const title = '<img src=x onerror="alert(1)">';
  const text = '<script>alert("note")</script>';
  const author = '<svg onload="alert(2)">Reader</svg>';
  const commentName = '<img src=x onerror="alert(3)">';
  const commentText = '<script>alert("comment")</script>';
  const safeSrc = 'https://project.supabase.co/storage/v1/object/sign/community-media/photo.jpg?token=signed';
  const app = page({ notes: [{ id: 'member-untrusted', title, text, date: '2026-09-01',
    author: { name: author }, media: [
      { src: 'javascript:alert(4)', alt: 'Unsafe script' },
      { src: 'data:text/html,<script>alert(5)</script>', alt: 'Unsafe data' },
      { src: 'file:///etc/passwd', alt: 'Unsafe file' },
      { src: safeSrc, alt: 'A real photograph', width: 1200, height: 800 }
    ] }], noteDetails: { comments: [{ id: 'comment-untrusted', name: commentName, text: commentText,
      createdAt: '2026-09-02T12:00:00.000Z' }] } });
  await app.settle();
  const note = app.feed.querySelector('[data-note-id="member-untrusted"]');
  assert.ok(note, 'The member note is present');
  for (const value of [title, text, author]) assert.ok(note.textContent.includes(value), 'UGC is preserved as literal text: ' + value);
  const commentButton = note.querySelectorAll('button').find(button => /comment/i.test(button.textContent));
  if (commentButton) await commentButton.emit('click');
  await app.settle();
  for (const value of [commentName, commentText]) assert.ok(note.textContent.includes(value), 'Comment data is rendered as literal text: ' + value);
  assert.equal(note.querySelectorAll('script, svg').length, 0);
  assert.deepEqual(note.querySelectorAll('img').map(image => image.src), [safeSrc]);
  assert.equal(note.querySelector('img').alt, 'A real photograph');
  assert.equal(note.querySelector('figure').style.getPropertyValue('--note-ratio'), '1.5');
});

test('a verified account opens the note composer without a membership application', async () => {
  const app = page({user:{id:'reader-id', name:'Jerry', isAdmin:false, isMember:false, membership:'none'}});
  await app.settle();
  assert.equal(app.accountLink.textContent, 'My profile');
  assert.equal(app.contributeLink.href, '/account/#share-a-note');
  assert.ok(app.account.querySelector('.community-editor'));
  assert.ok(app.account.querySelector('.community-mine'));
  assert.ok(app.requests.some(request => request.url.includes('action=mine')));
  const note = app.staticNotes[0];
  await note.querySelectorAll('button').find(button => button.getAttribute('aria-pressed') !== null).emit('click');
  await note.querySelectorAll('button').find(button => /comment/i.test(button.textContent)).emit('click');
  const comment = note.querySelector('.community-comment-form');
  comment.querySelector('textarea').value = 'Thank you for sharing this.';
  await comment.emit('submit');
  assert.ok(app.requests.some(request => request.url.includes('action=like')));
  assert.ok(app.requests.some(request => request.url.includes('action=comment')));
  assert.equal(app.account.querySelector('.community-membership'), null);
  assert.equal(app.account.querySelectorAll('section')[0].id, 'share-a-note');
  assert.deepEqual(app.account.querySelectorAll('.community-account-nav a').map(a => a.href), ['#share-a-note','#my-notes','#my-profile']);
  assert.equal(app.requests.some(request => request.url.includes('action=request-membership')), false);
});

test('legacy membership states do not add another application step', async () => {
  for (const membership of ['pending','rejected']) {
    const app = page({user:{id:'reader-id', name:'Reader', isAdmin:false, isMember:false, membership}});
    await app.settle();
    assert.ok(app.account.querySelector('.community-editor'));
    assert.equal(app.account.querySelector('.community-membership'), null);
    assert.doesNotMatch(app.account.textContent, /membership request|Become a member/);
  }
});

test('email verification opens posting and offers full article submission by email', async () => {
  const approved = {id:'member-id', name:'Contributor', isAdmin:false, isMember:true, membership:'approved'};
  const app = page({responses:{verify:{user:approved}}});
  await app.settle();
  const [request, verify] = app.account.querySelectorAll('form');
  request.querySelector('input').value = 'reader@example.com';
  await request.emit('submit');
  const [code, name] = verify.querySelectorAll('input');
  code.value = '123456';
  name.value = 'Contributor';
  await verify.emit('submit');
  await app.settle();
  assert.ok(app.account.querySelector('.community-editor'));
  assert.ok(app.account.querySelector('.community-mine'));
  assert.equal(app.account.querySelector('.community-review'), null);
  assert.equal(app.contributeLink.href, '/account/#share-a-note');
  const article = app.account.querySelectorAll('a').find(a => a.href?.startsWith('mailto:'));
  assert.equal(article.textContent, 'Send a full-length article to the editor');
  const destination = new URL(article.href);
  assert.equal(destination.protocol, 'mailto:');
  assert.equal(destination.pathname, 'xingtong.themargins@gmail.com');
  assert.equal(destination.searchParams.get('subject'), 'Article submission — The Margins');
});

test('profile saves upload the selected photo, update the displayed name, and preserve an unfinished note', async () => {
  const user = {id:'reader-id',name:'Reader',avatar:null,isMember:false,isAdmin:false,membership:'none'};
  const saved = {...user,name:'<svg>New name</svg>',avatar:'https://project.supabase.co/storage/v1/object/sign/community-avatars/own/photo.png?token=signed'};
  const app = page({user,responses:{profile:{user:saved}}});
  await app.settle();
  const noteDraft = app.account.querySelector('.community-editor textarea');
  noteDraft.value = 'An unfinished note';
  const form = app.account.querySelector('.community-profile form');
  form.querySelector('input[type="text"]').value = saved.name;
  const photo = form.querySelector('input[type="file"]');
  photo.files = [{type:'image/png',size:100,base64:'cGhvdG8='}];
  await form.emit('submit');
  const request = app.requests.find(request => request.url.includes('action=profile'));
  assert.deepEqual(JSON.parse(request.options.body),{name:saved.name,avatar:{mime:'image/png',base64:'cGhvdG8='}});
  assert.equal(app.account.querySelector('.community-profile-summary img').src,saved.avatar);
  assert.equal(app.account.querySelector('.community-profile-summary h2').textContent,saved.name);
  assert.equal(app.account.querySelector('svg'),null);
  assert.match(form.textContent,/Profile saved/);
  assert.equal(noteDraft.value,'An unfinished note');
  assert.equal(app.account.querySelector('.community-editor textarea'),noteDraft);
  assert.equal(app.account.querySelector('.community-review'),null);
});

test('profile removal is explicit; failed saves retain the name draft and allow retry', async () => {
  const user = {id:'reader-id',name:'Reader',avatar:'https://project.supabase.co/storage/v1/object/sign/community-avatars/photo.png',isMember:false,isAdmin:false,membership:'none'};
  let fail = true;
  const app = page({user,responses:{profile:() => {if (fail) throw new Error('Temporary failure');return {user:{...user,name:'New name',avatar:null}};}}});
  await app.settle();
  const form = app.account.querySelector('.community-profile form');
  const name = form.querySelector('input[type="text"]');
  name.value = 'New name';
  const remove = form.querySelectorAll('button').find(b => b.textContent==='Remove photo');
  const save = form.querySelectorAll('button').find(b => b.textContent==='Save changes');
  await remove.emit('click');
  assert.equal(app.requests.filter(r => r.url.includes('action=profile')).length,0);
  await form.emit('submit');
  assert.match(form.textContent,/Temporary failure/);
  assert.equal(name.value,'New name');
  assert.equal(save.disabled,false);
  fail = false;
  await form.emit('submit');
  const request = app.requests.filter(r => r.url.includes('action=profile')).at(-1);
  assert.deepEqual(JSON.parse(request.options.body),{name:'New name',avatar:null});
  assert.equal(app.account.querySelector('.community-profile-summary img'),null);
  assert.equal(remove.hidden,true);
});

test('a returning reader can verify without resetting their existing display name', async () => {
  const user = {id:'reader-id',name:'Existing name',avatar:null,isMember:false,isAdmin:false,membership:'none'};
  const app = page({responses:{verify:{user}}});
  await app.settle();
  const [request,verify] = app.account.querySelectorAll('form');
  request.querySelector('input').value = 'reader@example.com';
  await request.emit('submit');
  verify.querySelectorAll('input')[0].value = '123456';
  verify.querySelectorAll('input')[1].value = '';
  await verify.emit('submit');
  const sent = app.requests.find(r => r.url.includes('action=verify'));
  assert.deepEqual(JSON.parse(sent.options.body),{email:'reader@example.com',token:'123456'});
  assert.equal(app.account.querySelector('.community-profile-summary h2').textContent,'Existing name');
  assert.ok(app.account.querySelector('.community-editor'));
});

test('editors review notes and comments without a membership queue', async () => {
  const notes = [{id:'community-one',title:'<script>A note</script>',text:'An observation.',date:'2026-09-27',media:[]}];
  const comments = [{id:'comment-two',name:'Two',text:'A comment.'}];
  const app = page({user:{id:'editor-id', name:'Jerry', isAdmin:true, isMember:true, membership:'approved'},
    responses:{review:{requests:[{id:'old-request',name:'Old applicant'}], notes, comments}}});
  await app.settle();
  const review = app.account.querySelector('.community-review');
  const cards = review.querySelectorAll('article');
  assert.equal(cards.length, 2);
  assert.match(cards[0].textContent, /<script>A note<\/script>/);
  assert.equal(cards[0].querySelector('script'), null);
  await cards[0].querySelectorAll('button').find(button => button.textContent === 'Approve').emit('click');
  await cards[1].querySelectorAll('button').find(button => button.textContent === 'Reject').emit('click');
  assert.deepEqual(app.requests.filter(request => request.url.includes('action=moderate')).map(request => JSON.parse(request.options.body)), [
    {kind:'note', id:'community-one', approve:true},
    {kind:'comment', id:'comment-two', approve:false}
  ]);
  assert.equal(review.querySelectorAll('article').length, 0);
});

test('the code step identifies the destination and resends only after the cooldown', async () => {
  const app = page();
  await app.settle();
  const [request,verify] = app.account.querySelectorAll('form');
  request.querySelector('input').value = 'reader@example.com';
  await request.emit('submit');
  assert.equal(verify.hidden, false);
  assert.equal(verify.querySelector('.community-code-destination').textContent, 'Check reader@example.com for your code.');
  assert.match(verify.textContent, /accounts@themarginsjournals.com/);
  const resend = verify.querySelectorAll('button').find(b => b.textContent.startsWith('Resend'));
  assert.equal(resend.disabled,true);
  await resend.emit('click');
  assert.equal(app.requests.filter(r => r.url.includes('action=request-code')).length,1);
  app.expireResendTimer();
  assert.equal(resend.disabled,false);
  await resend.emit('click');
  const requests = app.requests.filter(r => r.url.includes('action=request-code'));
  assert.equal(requests.length,2);
  assert.deepEqual(JSON.parse(requests[1].options.body),{email:'reader@example.com'});
  assert.equal(resend.disabled,true);
  await verify.querySelectorAll('button').find(b => b.textContent === 'Use another email').emit('click');
  assert.equal(request.hidden,false);
  assert.equal(verify.hidden,true);
});
