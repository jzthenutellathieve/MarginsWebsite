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
}

function page({ ready = true, unavailable = false, notes = [], noteDetails = {} } = {}) {
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
  header.append(join);
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
  const window = { document, location: new URL('https://themargins.example/field-notes/'),
    addEventListener() {}, setTimeout, clearTimeout, crypto: { randomUUID: () => 'test-page-load' } };
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const parsed = new URL(url, window.location);
    assert.equal(parsed.pathname, '/api/community');
    assert.equal(options.credentials, 'same-origin');
    if (unavailable) throw new Error('Network unavailable');
    const action = parsed.searchParams.get('action');
    let payload;
    if (action === 'status') payload = { ready };
    else if (action === 'session') payload = { user: null };
    else if (action === 'feed') payload = { notes };
    else if (action === 'note') payload = { likes: 0, liked: false, views: 0, comments: [], canModerate: false, ...noteDetails };
    else throw new Error('Unexpected community request: ' + action);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const source = fs.readFileSync(path.join(__dirname, '../public/community.js'), 'utf8');
  vm.runInNewContext(source, { document, window, location: window.location, fetch, URL, URLSearchParams,
    AbortController, AbortSignal, setTimeout, clearTimeout, console, crypto: window.crypto });
  return { document, feed, account, accountLink, fallback, status, join, staticNotes, requests,
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
});
