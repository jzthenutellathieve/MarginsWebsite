const { escapeText: esc } = require('./site-utils.cjs');

const contributeUrl = 'mailto:jerryzou2021@gmail.com?subject=' + encodeURIComponent('A field note for The Margins') + '&body=' + encodeURIComponent('Name to credit:\nPlace:\nMonth / year:\n\nWhat I noticed:\n\nPhoto credit / permission:\n\nPlease attach your photos before sending.');
const noteDate = date => new Date((date.length === 7 ? date + '-01' : date) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', ...(date.length > 7 ? { day: 'numeric' } : {}), year: 'numeric', timeZone: 'UTC' });

function renderNotes(notes, members) {
  return notes.map(note => {
    const author = members.find(member => member.id === note.author);
    if (!author) throw new Error('Unknown field note author: ' + note.author);
    return `<article class="md-note-entry" id="${esc(note.id)}" aria-labelledby="${esc(note.id)}-title">
      <header><p class="md-note-meta"><time datetime="${esc(note.date)}">${esc(noteDate(note.date))}</time> · <a href="/about/#member-${esc(author.id)}">${esc(author.name)}</a></p>
      <h2 id="${esc(note.id)}-title"><a href="#${esc(note.id)}">${esc(note.title)}</a></h2></header>
      <p class="md-note-text">${esc(note.text)}</p>
      <div class="md-note-photos" tabindex="0" role="region" aria-label="Photos and videos from this field note">${note.photos.map((photo, index) => `<figure>
        <a href="${esc(photo.src)}" aria-label="View full photograph: ${esc(photo.alt)}"><img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="${photo.width}" height="${photo.height}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></a>
        <figcaption>${esc(photo.caption)}</figcaption></figure>`).join('')}${(note.videos || []).map(video => video.src ? `<figure><video controls playsinline preload="metadata"${video.poster ? ` poster="${esc(video.poster)}"` : ''} aria-label="${esc(video.title)}"><source src="${esc(video.src)}" type="video/mp4"><a href="${esc(video.src)}">Watch ${esc(video.title)}</a></video><figcaption>${esc(video.title)}</figcaption></figure>` : `<figure><div class="md-video-placeholder"><span>${esc(video.title)}</span><span>Coming soon</span></div><figcaption>${esc(video.title)}</figcaption></figure>`).join('')}</div>
      <p class="md-note-credit">Photographs by ${esc(author.name)}</p>
    </article>`;
  }).join('\n');
}

function renderMembers(members) {
  return members.map(member => `<article class="md-member" id="member-${esc(member.id)}">
    ${member.avatar ? `<img class="md-member-avatar" src="${esc(member.avatar)}" alt="${esc(member.name)}" width="64" height="64" loading="lazy">` : `<span class="md-member-avatar md-member-initial" style="background-color:${esc(member.avatarColor || '#35584f')}" aria-hidden="true">${esc(member.initial || member.name[0].toUpperCase())}</span>`}
    <div class="md-member-info"><h3>${esc(member.name)}</h3><p class="md-member-username">@${esc(member.username || member.id)}</p>
    <dl class="md-member-stats"><div><dt>Followers</dt><dd>${member.followers == null ? '<span aria-label="Not available">—</span>' : esc(String(member.followers))}</dd></div><div><dt>Following</dt><dd>${member.following == null ? '<span aria-label="Not available">—</span>' : esc(String(member.following))}</dd></div></dl></div>
  </article>`).join('\n');
}

function renderNotePreview(notes, members) {
  const note = notes[0];
  if (!note) return '';
  const author = members.find(member => member.id === note.author);
  return `<a class="md-note-preview" href="/field-notes/#${esc(note.id)}">
    <img src="${esc(note.photos[0].src)}" alt="${esc(note.photos[0].alt)}" width="${note.photos[0].width}" height="${note.photos[0].height}" loading="lazy">
    <div><p class="md-note-meta">${esc(noteDate(note.date))} · ${esc(author.name)}</p><h3>${esc(note.title)}</h3><p>${esc(note.text)}</p><span>View the note →</span></div>
  </a>`;
}

module.exports = { contributeUrl, renderNotes, renderMembers, renderNotePreview };
