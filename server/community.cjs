const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHmac} = require('node:crypto');

const BUCKET = 'community-media';
const AVATARS = 'community-avatars';
const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_BODY = 3 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTE_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ACCESS = '__Host-margins-access';
const REFRESH = '__Host-margins-refresh';
const OWNER_EMAIL = 'xingtong.themargins@gmail.com';
const ORIGINS = new Set(['https://themarginsjournals.com', 'https://www.themarginsjournals.com']);
class PublicError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
class ProviderError extends Error {
  constructor(status) { super('Community provider unavailable'); this.status = status; }
}
function fail(status, message) { throw new PublicError(status, message); }
function configFrom(env) {
  const url = (env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  let valid = false;
  try { const u = new URL(url); valid = u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/'; } catch {}
  const anon = (env.SUPABASE_ANON_KEY || '').trim();
  const service = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return {url, anon, service, ready: valid && !!anon && !!service && env.COMMUNITY_ENABLED === 'true' && (!env.VERCEL_ENV || env.VERCEL_ENV === 'production')};
}
function staticNoteIds() {
  return new Set(fs.readdirSync(path.join(__dirname, '../content/field-notes')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)));
}
function text(value, max, required = true) {
  if (typeof value !== 'string') fail(400, 'Invalid text');
  const result = value.trim();
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) fail(400, 'Invalid text');
  return result;
}
function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'Enter a valid email address');
  return result;
}
function date(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Use a valid date');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value || value < '1900-01-01' || +parsed > now() + 86400000) fail(400, 'Use a valid date');
  return value;
}
function imageInfo(base64, mime) {
  if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(MAX_IMAGE / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) fail(400, 'Invalid image');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE) fail(413, 'Images must be 2 MB or smaller');
  let width, height, ext;
  if (mime === 'image/png' && bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); ext = 'png';
  } else if (mime === 'image/jpeg' && bytes.length > 20 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && size >= 8) {
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); ext = 'jpg'; break;
      }
      offset += size;
    }
  } else if (mime === 'image/webp' && bytes.length >= 30 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const kind = bytes.toString('ascii',12,16);
    if (kind === 'VP8X') { width = 1 + bytes.readUIntLE(24,3); height = 1 + bytes.readUIntLE(27,3); }
    else if (kind === 'VP8 ' && bytes.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a]))) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
    else if (kind === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
    ext = 'webp';
  }
  if (!ext || !width || !height || width > 12000 || height > 12000 || width * height > 40000000) fail(400, 'Use a valid JPEG, PNG or WebP image');
  return {bytes, mime, ext, width, height};
}
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
async function readBody(req, limit) {
  if (Number(req.headers['content-length'] || 0) > limit) fail(413, 'Request too large');
  let raw;
  if (req.body !== undefined) raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else {
    const chunks = []; let length = 0;
    for await (const chunk of req) { const part = Buffer.from(chunk); length += part.length; if (length > limit) fail(413, 'Request too large'); chunks.push(part); }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw || '') > limit) fail(413, 'Request too large');
  let body;
  try { body = JSON.parse(raw); } catch { fail(400, 'Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid request');
  return body;
}
function cookies(req) {
  const result = {};
  for (const item of (req.headers.cookie || '').split(';')) {
    const index = item.indexOf('=');
    if (index > 0) { const key = item.slice(0,index).trim(); try { result[key] = decodeURIComponent(item.slice(index + 1)); } catch {} }
  }
  return result;
}
function setSession(res, session) {
  const entries = session ? [[ACCESS, session.access_token, Math.min(Number(session.expires_in) || 3600, 86400)], [REFRESH, session.refresh_token, 2592000]] : [[ACCESS,'',0],[REFRESH,'',0]];
  if (session && entries.some(([,value]) => typeof value !== 'string' || !value || value.length > 3800)) throw new Error('Invalid auth session');
  res.setHeader('Set-Cookie', entries.map(([name,value,age]) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`));
}
function createBackend({env = process.env, fetchImpl = fetch} = {}) {
  const config = configFrom(env);
  async function request(endpoint, {method = 'GET', body, token, auth = false, headers = {}, binary = false} = {}) {
    const key = auth ? config.anon : config.service;
    const bearer = token || (!key.startsWith('sb_') ? key : null);
    const response = await fetchImpl(config.url + endpoint, {method, redirect:'error', signal:AbortSignal.timeout(10000), headers:{apikey:key, ...(bearer ? {Authorization:`Bearer ${bearer}`} : {}), ...(body !== undefined ? {'Content-Type':binary ? body.mime : 'application/json'} : {}), ...headers}, ...(body !== undefined ? {body:binary ? body.bytes : JSON.stringify(body)} : {})});
    if (!response.ok) throw new ProviderError(response.status);
    if (response.status === 204 || response.headers?.get('content-length') === '0') return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  const table = (name, query = '', opts) => request('/rest/v1/' + name + (query ? '?' + query : ''), opts);
  const rpc = (name, body) => request('/rest/v1/rpc/' + name, {method:'POST', body});
  return {
    ready:config.ready,
    ping:() => Promise.all([table('community_targets', 'select=note_id&limit=0'), table('community_memberships', 'select=user_id&limit=0'), table('community_profiles', 'select=avatar_path&limit=0')]),
    rate:(key, limit, seconds) => rpc('community_rate_limit', {p_bucket_key:key,p_limit:limit,p_window_seconds:seconds}),
    requestCode:address => request('/auth/v1/otp', {method:'POST',auth:true,body:{email:address,create_user:true}}),
    verify:(address, token) => request('/auth/v1/verify', {method:'POST',auth:true,body:{email:address,token,type:'email'}}),
    getUser:token => request('/auth/v1/user', {auth:true,token}),
    refresh:token => request('/auth/v1/token?grant_type=refresh_token', {method:'POST',auth:true,body:{refresh_token:token}}),
    logout:token => request('/auth/v1/logout?scope=local', {method:'POST',auth:true,token}),
    profile:async id => (await table('community_profiles', 'select=user_id,name,avatar_path&user_id=eq.' + id + '&limit=1'))[0] || null,
    saveProfile:(id,name) => table('community_profiles', 'on_conflict=user_id', {method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{user_id:id,name}}),
    updateProfile:(id,name,avatarPath,changeAvatar) => rpc('community_update_profile', {p_user_id:id,p_name:name,p_avatar_path:avatarPath,p_change_avatar:changeAvatar}),
    uploadAvatar:(objectPath,info) => request('/storage/v1/object/' + AVATARS + '/' + objectPath, {method:'POST',body:info,binary:true,headers:{'x-upsert':'false'}}),
    deleteAvatar:objectPath => request('/storage/v1/object/' + AVATARS, {method:'DELETE',body:{prefixes:[objectPath]}}),
    syncOwner:() => rpc('community_sync_owner', {}),
    membership:async id => (await table('community_memberships', 'select=status&user_id=eq.' + id + '&limit=1'))[0] || null,
    requestMembership:(id,message) => rpc('community_request_membership', {p_user_id:id,p_message:message}),
    membershipRequests:() => table('community_memberships', 'select=user_id,message,created_at&status=eq.pending&order=created_at.asc&limit=100'),
    isAdmin:async id => (await table('community_admins', 'select=user_id&user_id=eq.' + id + '&limit=1')).length === 1,
    ensureStatic:id => table('community_targets', 'on_conflict=note_id', {method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:{note_id:id,published:true}}),
    target:async id => (await table('community_targets','select=note_id,published&note_id=eq.' + id + '&limit=1'))[0] || null,
    noteState:(id,userId) => rpc('community_note_state',{p_target_id:id,p_user_id:userId || null}),
    listNotes:(mode,userId) => table('community_notes', 'select=*&order=date.desc,created_at.desc&limit=100&' + (mode === 'mine' ? 'author_id=eq.' + userId : 'status=eq.' + (mode === 'review' ? 'pending' : 'published'))),
    listComments:(id,review = false) => table('community_comments', 'select=*&order=created_at.' + (review ? 'desc' : 'asc') + '&limit=100&status=eq.' + (review ? 'pending' : 'published') + (id ? '&note_id=eq.' + id : '')),
    uploadRow:async objectPath => (await table('community_uploads','select=*&path=eq.' + encodeURIComponent(objectPath) + '&limit=1'))[0] || null,
    upload:async (objectPath,userId,info) => {
      await request('/storage/v1/object/' + BUCKET + '/' + objectPath, {method:'POST',body:info,binary:true,headers:{'x-upsert':'false'}});
      try { await table('community_uploads','',{method:'POST',body:{path:objectPath,user_id:userId,mime:info.mime,width:info.width,height:info.height}}); }
      catch (error) { try { await request('/storage/v1/object/' + BUCKET, {method:'DELETE',body:{prefixes:[objectPath]}}); } catch {} throw error; }
    },
    sign:async (objectPath,bucket = BUCKET) => {
      if (![BUCKET,AVATARS].includes(bucket)) throw new Error('Invalid media bucket');
      const result = await request('/storage/v1/object/sign/' + bucket + '/' + objectPath,{method:'POST',body:{expiresIn:3600}});
      const signed = result.signedURL || result.signedUrl;
      if (typeof signed !== 'string') throw new Error('Invalid media response');
      const url = new URL(signed.startsWith('/object/') ? '/storage/v1' + signed : signed, config.url);
      if (url.origin !== config.url || !url.pathname.startsWith('/storage/v1/object/sign/' + bucket + '/')) throw new Error('Invalid media response');
      return url.href;
    },
    submit:payload => rpc('community_submit_note',payload),
    like:(id,userId,liked) => rpc('community_set_like',{p_target_id:id,p_user_id:userId,p_liked:liked}),
    comment:(id,userId,value) => table('community_comments','',{method:'POST',body:{note_id:id,author_id:userId,text:value,status:'pending'}}),
    view:(id,eventId) => rpc('community_record_view',{p_target_id:id,p_event_id:eventId}),
    moderate:(kind,id,approve,adminId) => rpc('community_moderate',{p_kind:kind,p_id:id,p_approve:approve,p_admin_id:adminId})
  };
}
function createHandler({env = process.env, backend = createBackend({env}), ids = staticNoteIds(), now = Date.now, uuid = randomUUID} = {}) {
  const enabled = env.COMMUNITY_ENABLED === 'true' && backend.ready && (!env.VERCEL_ENV || env.VERCEL_ENV === 'production');
  const secret = env.SUPABASE_SERVICE_ROLE_KEY || 'unconfigured';
  const hash = value => createHmac('sha256',secret).update(value).digest('hex');
  async function limit(key,max,seconds) {
    const result = await backend.rate(hash(key),max,seconds);
    if (!result?.allowed) fail(429,'Please wait before trying again');
  }
  async function account(user,profile) {
    const isAdmin = user.email?.toLowerCase() === OWNER_EMAIL && await backend.isAdmin(user.id);
    const membership = isAdmin ? 'approved' : (await backend.membership(user.id))?.status || 'none';
    if (!['none','pending','approved','rejected'].includes(membership)) throw new Error('Invalid membership state');
    return {id:user.id,name:profile.name,avatarPath:profile.avatar_path || null,isAdmin,membership,isMember:membership === 'approved'};
  }
  async function identity(req,res) {
    const jar = cookies(req); let token = jar[ACCESS]; let user;
    if (token && token.length <= 3800) {
      try { user = await backend.getUser(token); }
      catch (error) { if (![401,403].includes(error.status)) throw error; }
    }
    if (!user && jar[REFRESH] && jar[REFRESH].length <= 3800) {
      try { const session = await backend.refresh(jar[REFRESH]); token = session.access_token; user = await backend.getUser(token); setSession(res,session); }
      catch (error) { if (![400,401,403].includes(error.status)) throw error; setSession(res,null); }
    }
    if (!user) return null;
    if (!UUID.test(user.id || '') || !user.email_confirmed_at) return null;
    const profile = await backend.profile(user.id);
    if (!profile) return null;
    return {...await account(user,profile),token};
  }
  function ownImagePath(id,value) {
    return typeof value === 'string' && value.startsWith(id + '/') && /^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(value);
  }
  async function publicUser(user) {
    if (!user) return null;
    let avatar = null;
    if (user.avatarPath) {
      if (!ownImagePath(user.id,user.avatarPath)) throw new Error('Invalid stored avatar');
      avatar = await backend.sign(user.avatarPath,AVATARS);
    }
    return {id:user.id,name:user.name,avatar,isAdmin:user.isAdmin,membership:user.membership,isMember:user.isMember};
  }
  async function target(value) {
    if (typeof value !== 'string' || !NOTE_ID.test(value)) fail(400,'Invalid field note');
    if (ids.has(value)) await backend.ensureStatic(value);
    const result = await backend.target(value);
    if (!result?.published) fail(404,'Field note not found');
    return value;
  }
  async function authorName(id,cache) {
    if (!cache.has(id)) cache.set(id, (await backend.profile(id))?.name || 'Member');
    return cache.get(id);
  }
  async function notesFor(mode,user) {
    const rows = await backend.listNotes(mode,user?.id); const names = new Map();
    return Promise.all(rows.map(async note => {
      if (!(note.status === 'published' || user?.isAdmin || note.author_id === user?.id)) throw new Error('Invalid private note response');
      const media = await Promise.all((note.media || []).map(async item => {
        if (typeof item.path !== 'string' || !item.path.startsWith(note.author_id + '/') || !/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(item.path)) throw new Error('Invalid stored image');
        return {src:await backend.sign(item.path),alt:item.alt,width:item.width,height:item.height};
      }));
      return {id:note.id,title:note.title,text:note.text,date:note.date,author:{name:await authorName(note.author_id,names)},media,...(mode !== 'feed' ? {status:note.status} : {})};
    }));
  }
  return async function community(req,res) {
    try {
      const url = new URL(req.url,'https://themarginsjournals.com');
      const action = url.searchParams.get('action') || 'status';
      if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); fail(405,'Method not allowed'); }
      if (req.method === 'GET' && action === 'status') {
        if (!enabled) return reply(res,200,{ready:false});
        try { await backend.ping(); return reply(res,200,{ready:true}); } catch { return reply(res,200,{ready:false}); }
      }
      if (req.method === 'POST') {
        if (!ORIGINS.has(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') fail(403,'Use The Margins website');
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail(415,'JSON required');
      }
      if (!enabled) {
        if (req.method === 'GET' && action === 'session') return reply(res,200,{ready:false,user:null});
        if (req.method === 'GET' && action === 'feed') return reply(res,200,{ready:false,notes:[]});
        fail(503,'Member features are not available yet');
      }
      const client = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      await limit('ip:' + client + ':' + (req.method === 'GET' ? 'read' : action), action === 'request-code' ? 5 : action === 'verify' ? 12 : action === 'upload' ? 20 : 180, action === 'request-code' || action === 'verify' ? 600 : action === 'upload' ? 3600 : 60);
      if (req.method === 'GET') {
        if (!['session','feed','note','mine','review'].includes(action)) fail(404,'Unknown action');
        const user = action === 'feed' ? null : await identity(req,res);
        if (action === 'session') return reply(res,200,{user:await publicUser(user)});
        if (action === 'feed') return reply(res,200,{notes:await notesFor('feed',null)});
        if (action === 'note') {
          const id = await target(url.searchParams.get('id'));
          const rows = await backend.listComments(id); const names = new Map();
          const comments = await Promise.all(rows.filter(c => c.status === 'published').map(async c => ({id:c.id,name:await authorName(c.author_id,names),text:c.text,createdAt:c.created_at})));
          return reply(res,200,{...await backend.noteState(id,user?.id),comments,canModerate:!!user?.isAdmin});
        }
        if (!user) fail(401,'Sign in to continue');
        if (action === 'mine') return reply(res,200,{notes:await notesFor('mine',user)});
        if (!user.isAdmin) fail(403,'Editor access required');
        const names = new Map();
        const comments = await Promise.all((await backend.listComments(null,true)).map(async c => ({id:c.id,noteId:c.note_id,name:await authorName(c.author_id,names),text:c.text,createdAt:c.created_at,status:c.status})));
        const requests = await Promise.all((await backend.membershipRequests()).map(async r => ({id:r.user_id,name:await authorName(r.user_id,names),message:r.message,createdAt:r.created_at})));
        return reply(res,200,{notes:await notesFor('review',user),comments,requests});
      }
      if (!['request-code','verify','logout','like','comment','view','upload','submit','moderate','request-membership','profile'].includes(action)) fail(404,'Unknown action');
      const body = await readBody(req,['upload','profile'].includes(action) ? MAX_BODY : 32000);
      if (action === 'request-code') {
        const address = email(body.email); await limit('email:' + address,3,600);
        try { await backend.requestCode(address); } catch (error) { if (![400,422,429].includes(error.status)) throw error; }
        return reply(res,200,{message:'If this address can receive a sign-in code, check your inbox.'});
      }
      if (action === 'verify') {
        const address = email(body.email);
        if (typeof body.token !== 'string' || !/^\d{6,10}$/.test(body.token)) fail(400,'Enter the code from your email');
        await limit('verify:' + address,12,600);
        let session;
        try { session = await backend.verify(address,body.token); } catch (error) { if ([400,401,403,422].includes(error.status)) fail(400,'The code is invalid or expired'); throw error; }
        const verified = await backend.getUser(session.access_token);
        if (!verified.email_confirmed_at || !UUID.test(verified.id || '') || verified.email?.toLowerCase() !== address) fail(401,'Email verification required');
        const profile = await backend.profile(verified.id);
        const name = body.name === undefined ? profile?.name || 'Reader' : text(body.name,80);
        await backend.saveProfile(verified.id,name);
        if (address === OWNER_EMAIL) await backend.syncOwner();
        const user = await publicUser(await account(verified,{...profile,name}));
        setSession(res,session);
        return reply(res,200,{user});
      }
      if (action === 'logout') {
        const token = cookies(req)[ACCESS];
        setSession(res,null);
        if (token) { try { await backend.logout(token); } catch (error) { if (![401,403].includes(error.status)) throw error; } }
        return reply(res,200,{message:'Signed out'});
      }
      if (action === 'view') {
        const id = await target(body.id);
        if (typeof body.eventId !== 'string' || !UUID.test(body.eventId)) fail(400,'Invalid page-view ID');
        const result = await backend.view(id,body.eventId);
        return reply(res,200,{views:result.views});
      }
      const user = await identity(req,res);
      if (!user) fail(401,'Sign in to continue');
      await limit('user:' + user.id + ':' + action, action === 'request-membership' ? 3 : action === 'submit' ? 10 : ['upload','comment','profile'].includes(action) ? 20 : 120, ['submit','upload','comment','profile','request-membership'].includes(action) ? 3600 : 60);
      if (action === 'profile') {
        if (Object.keys(body).some(key => !['name','avatar'].includes(key))) fail(400,'Only your name and photo can be changed here');
        const name = text(body.name,80);
        const changeAvatar = Object.hasOwn(body,'avatar');
        let avatarPath = null;
        if (changeAvatar && body.avatar !== null) {
          if (!body.avatar || typeof body.avatar !== 'object' || Array.isArray(body.avatar)) fail(400,'Choose a photo to upload');
          const info = imageInfo(body.avatar.base64,body.avatar.mime);
          avatarPath = user.id + '/' + uuid() + '.' + info.ext;
          await backend.uploadAvatar(avatarPath,info);
        }
        const result = await backend.updateProfile(user.id,name,avatarPath,changeAvatar);
        // The RPC serializes replacements and returns the actual previous path.
        // If its response is lost, leave the new object for retention cleanup:
        // deleting it here could remove an avatar that was successfully saved.
        if (changeAvatar && ownImagePath(user.id,result.previous_avatar_path) && result.previous_avatar_path !== avatarPath) {
          try { await backend.deleteAvatar(result.previous_avatar_path); } catch { /* Retention cleanup can retry. */ }
        }
        return reply(res,200,{user:await publicUser({...user,name,avatarPath:result.avatar_path}),message:'Profile saved.'});
      }
      if (action === 'request-membership') {
        if (['id','userId','user_id','status','isMember','isAdmin'].some(key => key in body)) fail(400,'Membership is reviewed by the editor');
        const message = text(body.message ?? '',1000,false);
        const result = user.isAdmin ? {status:'approved'} : await backend.requestMembership(user.id,message);
        const approved = result.status === 'approved';
        return reply(res,200,{status:result.status,membership:result.status,isMember:approved,message:approved ? 'You are already a member.' : 'Your membership request is awaiting review.'});
      }
      if (action === 'like') {
        if (typeof body.liked !== 'boolean') fail(400,'Choose a like state');
        return reply(res,200,await backend.like(await target(body.id),user.id,body.liked));
      }
      if (action === 'comment') {
        const value = text(body.text,2000); await backend.comment(await target(body.id),user.id,value);
        return reply(res,201,{message:'Your comment is awaiting review.',status:'pending'});
      }
      if (action === 'upload') {
        const info = imageInfo(body.base64,body.mime);
        const objectPath = user.id + '/' + uuid() + '.' + info.ext;
        await backend.upload(objectPath,user.id,info);
        return reply(res,201,{path:objectPath});
      }
      if (action === 'submit') {
        if (['author','authorId','author_id','userId','id','status'].some(key => key in body)) fail(400,'Author and publication status are assigned by the server');
        if (body.permission !== true) fail(400,'Confirm that you have permission to share this material');
        const title = text(body.title,120); const value = text(body.text ?? '',4000,false); const noteDate = date(body.date,now);
        if (!Array.isArray(body.media) || body.media.length > 4 || (!body.media.length && !value)) fail(400,'Add text or up to 4 photos');
        const seen = new Set(); const media = [];
        for (const item of body.media) {
          if (!item || typeof item.path !== 'string' || !item.path.startsWith(user.id + '/') || !/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(item.path) || seen.has(item.path)) fail(400,'Use your own uploaded photos');
          seen.add(item.path);
          const upload = await backend.uploadRow(item.path);
          if (!upload || upload.user_id !== user.id || upload.attached_note_id) fail(400,'Use your own unused photos');
          media.push({path:item.path,alt:text(item.alt || '',300,false),width:upload.width,height:upload.height});
        }
        const id = 'community-' + uuid();
        const result = await backend.submit({p_id:id,p_user_id:user.id,p_title:title,p_text:value,p_date:noteDate,p_media:media});
        return reply(res,201,{...result,message:'Your field note is awaiting review.'});
      }
      if (!user.isAdmin) fail(403,'Editor access required');
      if (!['note','comment','membership'].includes(body.kind) || typeof body.approve !== 'boolean' || typeof body.id !== 'string' || !(body.kind === 'note' ? /^community-[a-f0-9-]{36}$/.test(body.id) : UUID.test(body.id))) fail(400,'Invalid moderation action');
      return reply(res,200,await backend.moderate(body.kind,body.id,body.approve,user.id));
    } catch (error) {
      return reply(res,error instanceof PublicError ? error.status : 503,{error:error instanceof PublicError ? error.message : 'Member features are temporarily unavailable. Please try again later.'});
    }
  };
}
module.exports = {createHandler,createBackend,configFrom,imageInfo,staticNoteIds,PublicError,ProviderError,MAX_IMAGE,MAX_BODY};
