const { escapeText: esc } = require('./site-utils.cjs');

const contributeUrl = 'mailto:jerryzou2021@gmail.com?subject=' + encodeURIComponent('A field note for The Margins') + '&body=' + encodeURIComponent('Name to credit:\nPlace:\nMonth / year:\n\nWhat I noticed:\n\nPhoto credit / permission:\n\nPlease attach your photos before sending.');
const noteDate = date => new Date((date.length === 7 ? date + '-01' : date) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', ...(date.length > 7 ? { day: 'numeric' } : {}), year: 'numeric', timeZone: 'UTC' });

function noteMedia(note) {
  return note.media || [...(note.photos || []).map(photo => ({ ...photo, type: 'image' })), ...(note.videos || []).filter(video => video.src).map(video => ({ ...video, type: 'video' }))];
}

function videoPlayer(video) {
  return `<video controls playsinline preload="metadata"${video.poster ? ` poster="${esc(video.poster)}"` : ''} aria-label="${esc(video.title)}"><source src="${esc(video.src)}" type="video/mp4"><a href="${esc(video.src)}">Watch ${esc(video.title)}</a></video>`;
}

function renderNotes(notes, members) {
  return notes.map(note => {
    const author = members.find(member => member.id === note.author);
    if (!author) throw new Error('Unknown field note author: ' + note.author);
    return `<article class="md-note-entry" id="${esc(note.id)}" aria-labelledby="${esc(note.id)}-title">
      <header><p class="md-note-meta"><time datetime="${esc(note.date)}">${esc(noteDate(note.date))}</time> · <a href="/about/#member-${esc(author.id)}">${esc(author.name)}</a></p>
      <h2 id="${esc(note.id)}-title"><a href="#${esc(note.id)}">${esc(note.title)}</a></h2></header>
      <p class="md-note-text">${esc(note.text)}</p>
      <div class="md-note-photos" tabindex="0" role="region" aria-label="Photos and videos from this field note">${noteMedia(note).map((item, index) => `<figure>${item.type === 'video' ? videoPlayer(item) : `<a href="${esc(item.src)}" aria-label="View full photograph: ${esc(item.alt)}"><img src="${esc(item.src)}" alt="${esc(item.alt)}" width="${item.width}" height="${item.height}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></a>`}${item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
      <p class="md-note-credit">${noteMedia(note).some(item => item.type === 'video') ? 'Photos and videos' : 'Photographs'} by ${esc(author.name)}</p>
    </article>`;
  }).join('\n');
}

function renderMembers(members) {
  return members.map(member => `<article class="md-member" id="member-${esc(member.id)}">
    ${member.avatar ? `<img class="md-member-avatar" src="${esc(member.avatar)}" alt="${esc(member.name)}" width="64" height="64" loading="lazy">` : `<span class="md-member-avatar md-member-initial" style="background-color:${esc(member.avatarColor || '#35584f')}" aria-hidden="true">${esc(member.initial || member.name[0].toUpperCase())}</span>`}
    <div class="md-member-info"><h3>${esc(member.name)}</h3><p class="md-member-username">@${esc(member.username || member.id)}</p>
    <p class="md-member-role">${esc(member.role)}</p></div>
  </article>`).join('\n');
}

function renderNotePreview(notes, members) {
  const note = notes[0];
  if (!note) return '';
  const author = members.find(member => member.id === note.author);
  const first = noteMedia(note)[0];
  const href = `/field-notes/#${esc(note.id)}`;
  return `<div class="md-note-preview">
    ${first.type === 'video' ? videoPlayer(first) : `<a href="${href}" aria-label="View ${esc(note.title)}"><img src="${esc(first.src)}" alt="${esc(first.alt)}" width="${first.width}" height="${first.height}" loading="lazy"></a>`}
    <div><p class="md-note-meta">${esc(noteDate(note.date))} · ${esc(author.name)}</p><h3><a href="${href}">${esc(note.title)}</a></h3><p>${esc(note.text)}</p><a class="md-note-preview-link" href="${href}">View the note →</a></div>
  </div>`;
}

module.exports = { contributeUrl, renderNotes, renderMembers, renderNotePreview };
