const test = require('node:test');
const assert = require('node:assert/strict');
const {createHandler,createBackend,configFrom,imageInfo,ProviderError,MAX_IMAGE} = require('../server/community.cjs');
const userId = 'c610a731-c39e-433b-bdae-a4f4f4f68412';
const otherId = 'd610a731-c39e-433b-bdae-a4f4f4f68412';
const eventId = '36177464-cc72-4514-b163-2f1f456b39c4';
const noteId = '2025-08-tuas';
const origin = 'https://themarginsjournals.com';
const env = {COMMUNITY_ENABLED:'true',VERCEL_ENV:'production',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=';
function backend(overrides = {}) {
  const likes = new Set(), views = new Set(), uploads = new Map(), notes = [], comments = [], profiles = new Map(), avatars = new Map();
  return {
    ready:true,ping:async () => [], rate:async () => ({allowed:true}),
    getUser:async token => {if(token !== 'valid') throw new ProviderError(401); return {id:userId,email:'member@example.com',email_confirmed_at:'2026-01-01',user_metadata:{isAdmin:true,role:'admin'}};},
    profile:async id => profiles.get(id) || {user_id:id,name:'Member <img src=x onerror=alert(1)>'},
    isAdmin:async () => false,saveProfile:async (id,name) => {profiles.set(id,{...profiles.get(id),user_id:id,name});},syncOwner:async () => {},
    updateProfile:async (id,name,avatar,changeAvatar) => {
      const previous = profiles.get(id)?.avatar_path || null;
      const current = changeAvatar ? avatar : previous;
      profiles.set(id,{user_id:id,name,avatar_path:current});
      return {previous_avatar_path:previous,avatar_path:current};
    },
    uploadAvatar:async (p,info) => {avatars.set(p,info);},
    deleteAvatar:async p => {avatars.delete(p);},
    membership:async () => ({status:'approved'}),requestMembership:async () => ({status:'pending'}),membershipRequests:async () => [],
    requestCode:async () => {}, verify:async () => ({access_token:'valid',refresh_token:'refresh',expires_in:3600}),logout:async () => {},
    ensureStatic:async () => {}, target:async id => id === noteId ? {note_id:id,published:true} : null,
    noteState:async () => ({likes:likes.size,liked:likes.has(userId),views:views.size}),
    listNotes:async mode => notes.filter(n => mode === 'mine' || n.status === (mode === 'review' ? 'pending' : 'published')),
    listComments:async () => comments,
    uploadRow:async p => uploads.get(p),
    upload:async (p,id,info) => {uploads.set(p,{path:p,user_id:id,width:info.width,height:info.height,attached_note_id:null});},
    sign:async (p,bucket = 'community-media') => 'https://project.supabase.co/storage/v1/object/sign/' + bucket + '/' + p + '?token=short-lived',
    submit:async payload => {notes.push({...payload,id:payload.p_id,title:payload.p_title,text:payload.p_text,date:payload.p_date,media:payload.p_media,author_id:payload.p_user_id,status:'pending'}); return {id:payload.p_id,status:'pending'};},
    like:async (id,uid,liked) => {liked ? likes.add(uid) : likes.delete(uid); return {likes:likes.size,liked};},
    comment:async (id,uid,text) => {comments.push({id:eventId,note_id:id,author_id:uid,text,status:'pending'});},
    view:async (id,event) => {views.add(id + event); return {views:views.size};},
    moderate:async () => {throw Error('Must not be called');},
    ...overrides, _notes:notes,_comments:comments,_uploads:uploads,_profiles:profiles,_avatars:avatars
  };
}
function handler(db = backend(), options = {}) {return createHandler({env,backend:db,ids:new Set([noteId]),uuid:() => eventId,now:() => Date.parse('2026-09-28'),...options});}
async function call(fn, action, {method='GET',body,auth=false,headers={},query=''} = {}) {
  const req = {method,url:'/api/community?action=' + action + query,headers:{origin,'content-type':'application/json',...(auth ? {cookie:'__Host-margins-access=valid'} : {}),...headers},body};
  const response = {headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};
  await fn(req,response); return response;
}

test('disabled, preview and failed schema status fail closed without contacting auth', async () => {
  const db = backend({requestCode:async () => {throw Error('Do not send email');}});
  for (const settings of [{COMMUNITY_ENABLED:'false'}, {...env,VERCEL_ENV:'preview'}]) {
    const fn = handler(db,{env:settings});
    assert.deepEqual((await call(fn,'status')).body,{ready:false});
    assert.deepEqual((await call(fn,'session')).body,{ready:false,user:null});
    assert.deepEqual((await call(fn,'feed')).body,{ready:false,notes:[]});
    assert.equal((await call(fn,'request-code',{method:'POST',body:{email:'person@example.com'}})).statusCode,503);
  }
  assert.equal((await call(handler(backend({ping:async () => {throw Error('secret SQL');}})),'status')).body.ready,false);
  assert.equal(configFrom({COMMUNITY_ENABLED:'true',SUPABASE_URL:'http://unsafe',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s'}).ready,false);
});

test('mutations require same origin, JSON, real authenticated user and editor role', async () => {
  const fn=handler();
  assert.equal((await call(fn,'like',{method:'POST',body:{id:noteId,liked:true},headers:{origin:'https://evil.example'}})).statusCode,403);
  assert.equal((await call(fn,'like',{method:'POST',body:{id:noteId,liked:true},headers:{'content-type':'text/plain'}})).statusCode,415);
  assert.equal((await call(fn,'like',{method:'POST',body:{id:noteId,liked:true}})).statusCode,401);
  assert.equal((await call(fn,'review',{auth:true})).statusCode,403);
  assert.equal((await call(fn,'moderate',{method:'POST',auth:true,body:{kind:'comment',id:eventId,approve:true}})).statusCode,403);
  const session=await call(fn,'session',{auth:true});
  assert.equal(session.body.user.isAdmin,false); // forged user_metadata.role is ignored
  assert.equal(JSON.stringify(session.body).includes('member@example.com'),false);
  assert.equal(JSON.stringify(session.body).includes('valid'),false);
});

test('verify sets only secure HttpOnly cookies, validates provider identity, and never returns credentials', async () => {
  const db=backend();const fn=handler(db);
  const result=await call(fn,'verify',{method:'POST',body:{email:'member@example.com',token:'123456',name:'Reader'}});
  assert.equal(result.statusCode,200);
  assert.deepEqual(result.body,{user:{id:userId,name:'Reader',avatar:null,isAdmin:false,membership:'approved',isMember:true}});
  assert.equal(result.headers['Set-Cookie'].length,2);
  for(const cookie of result.headers['Set-Cookie']) assert.match(cookie,/^__Host-.*; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/);
  const bad=handler(backend({getUser:async () => ({id:userId,email:'member@example.com',email_confirmed_at:null})}));
  assert.equal((await call(bad,'verify',{method:'POST',body:{email:'member@example.com',token:'123456'}})).statusCode,401);
  const impersonator=handler(backend({isAdmin:async () => true}));
  assert.equal((await call(impersonator,'session',{auth:true})).body.user.isAdmin,false);
});

test('unknown notes and pending notes cannot receive public interactions or expose comments', async () => {
  const fn=handler();
  for(const action of ['like','comment','view']) {
    const result=await call(fn,action,{method:'POST',auth:true,body:{id:'community-' + eventId,liked:true,text:'hello',eventId}});
    assert.equal(result.statusCode,404);
  }
  assert.equal((await call(fn,'note',{query:'&id=missing'})).statusCode,404);
});

test('likes are desired-state operations and view retries use the same event ID', async () => {
  const fn=handler();
  for(let i=0;i<2;i++) assert.deepEqual((await call(fn,'like',{method:'POST',auth:true,body:{id:noteId,liked:true}})).body,{likes:1,liked:true});
  assert.deepEqual((await call(fn,'like',{method:'POST',auth:true,body:{id:noteId,liked:false}})).body,{likes:0,liked:false});
  for(let i=0;i<2;i++) assert.deepEqual((await call(fn,'view',{method:'POST',body:{id:noteId,eventId}})).body,{views:1});
});

test('comments keep HTML as data, await review, and hide pending comments from public responses', async () => {
  const db=backend();const fn=handler(db);const text='<img src=x onerror=alert(1)>';
  assert.equal((await call(fn,'comment',{method:'POST',auth:true,body:{id:noteId,text}})).body.status,'pending');
  assert.equal(db._comments[0].text,text);
  assert.deepEqual((await call(fn,'note',{query:'&id='+noteId})).body.comments,[]);
  db._comments[0].status='published';db._comments[0].created_at='2026-09-28T00:00:00Z';
  const result=await call(fn,'note',{query:'&id='+noteId});
  assert.equal(result.body.comments[0].text,text);
  assert.equal(result.headers['Content-Type'],'application/json; charset=utf-8');
  assert.equal(result.headers['X-Content-Type-Options'],'nosniff');
});

test('uploads validate image content, size and dimensions and submit only authenticated own unused paths', async () => {
  const db=backend();const fn=handler(db);
  const uploaded=await call(fn,'upload',{method:'POST',auth:true,body:{base64:png,mime:'image/png'}});
  assert.equal(uploaded.statusCode,201);
  assert.equal(uploaded.body.path,userId+'/'+eventId+'.png');
  assert.equal(db._uploads.get(uploaded.body.path).width,1);
  const body={title:'A place',text:'',date:'2026-09-27',media:[{path:uploaded.body.path,alt:'A photo'}],permission:true};
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body})).body.status,'pending');
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{...body,author:'jason'}})).statusCode,400);
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{...body,permission:false}})).statusCode,400);
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{...body,media:[{path:otherId+'/'+eventId+'.png'}]}})).statusCode,400);
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{...body,media:[{path:userId+'/../../secret.png'}]}})).statusCode,400);
  db._uploads.get(uploaded.body.path).attached_note_id='already-used';
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body})).statusCode,400);
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{...body,media:[],text:'A written observation'}})).statusCode,201);
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{...body,media:[]}})).statusCode,400);
  for(const invalid of [{base64:Buffer.from('<svg></svg>').toString('base64'),mime:'image/png'},{base64:png,mime:'image/jpeg'},{base64:'not base64',mime:'image/png'}]) assert.equal((await call(fn,'upload',{method:'POST',auth:true,body:invalid})).statusCode,400);
  assert.throws(() => imageInfo(Buffer.alloc(MAX_IMAGE+1).toString('base64'),'image/png'));
});

test('limits and backend failures cannot leak internal errors, secrets, or make changes', async () => {
  const fn=handler();
  assert.equal((await call(fn,'comment',{method:'POST',auth:true,body:{id:noteId,text:'x'.repeat(2001)}})).statusCode,400);
  assert.equal((await call(fn,'comment',{method:'POST',auth:true,body:'x'.repeat(32001)})).statusCode,413);
  assert.equal((await call(handler(backend({rate:async () => ({allowed:false})})),'request-code',{method:'POST',body:{email:'member@example.com'}})).statusCode,429);
  const down=await call(handler(backend({listNotes:async () => {throw Error('secret-service-role-key SQL');}})),'feed');
  assert.equal(down.statusCode,503);assert.doesNotMatch(JSON.stringify(down.body),/secret|SQL/);
});

test('only published photos receive public URLs; owners can see own pending submission', async () => {
  const db=backend(); db._notes.push({id:'community-'+eventId,author_id:userId,title:'<script>alert(1)</script>',text:'Words',date:'2026-09-27',status:'pending',media:[{path:userId+'/'+eventId+'.png',alt:'test',width:1,height:1}]});
  const fn=handler(db);
  assert.deepEqual((await call(fn,'feed')).body.notes,[]);
  const mine=await call(fn,'mine',{auth:true});assert.equal(mine.body.notes[0].status,'pending');assert.match(mine.body.notes[0].media[0].src,/object\/sign/);
  assert.equal((await call(fn,'mine')).statusCode,401);
});

test('REST adapter uses service-only atomic RPCs and never trusts client URLs', async () => {
  const calls=[];
  const db=createBackend({env:{...env,SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'},fetchImpl:async (url,opts) => {calls.push([url,opts]);return {ok:true,status:200,headers:{get:() => null},text:async () => JSON.stringify({likes:1,liked:true,views:1})};}});
  await db.like(noteId,userId,true);await db.view(noteId,eventId);
  assert.match(calls[0][0],/rpc\/community_set_like$/);assert.match(calls[1][0],/rpc\/community_record_view$/);
  assert.equal(calls[0][1].headers.Authorization,'Bearer service');
  assert.deepEqual(JSON.parse(calls[0][1].body),{p_target_id:noteId,p_user_id:userId,p_liked:true});
  assert.equal(calls[0][1].redirect,'error');
});

test('profile updates require a verified identity and cannot choose another account, role, or photo URL', async () => {
  const db = backend({membership:async () => null}); const fn = handler(db);
  assert.equal((await call(fn,'profile',{method:'POST',body:{name:'Reader'}})).statusCode,401);
  const unverified = handler(backend({getUser:async () => ({id:userId,email_confirmed_at:null})}));
  assert.equal((await call(unverified,'profile',{method:'POST',auth:true,body:{name:'Reader'}})).statusCode,401);
  for (const extra of [{user_id:otherId},{isAdmin:true},{membership:'approved'},{avatar_path:otherId+'/'+eventId+'.png'},{avatar:'https://example.com/photo.jpg'}]) {
    assert.equal((await call(fn,'profile',{method:'POST',auth:true,body:{name:'Reader',...extra}})).statusCode,400);
  }
  assert.equal(db._profiles.size,0);
  assert.equal(db._avatars.size,0);
  assert.equal((await call(fn,'profile',{method:'POST',auth:true,body:{name:' '}})).statusCode,400);
  assert.equal((await call(fn,'profile',{method:'POST',auth:true,body:{name:'Reader',avatar:{base64:png,mime:'image/jpeg'}}})).statusCode,400);
  const saved = await call(fn,'profile',{method:'POST',auth:true,body:{name:'<svg>Reader</svg>',avatar:{base64:png,mime:'image/png'}}});
  assert.equal(saved.statusCode,200);
  assert.equal(saved.body.user.name,'<svg>Reader</svg>');
  assert.equal(saved.body.user.isMember,true);
  assert.match(saved.body.user.avatar,/object\/sign\/community-avatars\//);
  assert.equal(db._uploads.size,0,'An avatar is not a reusable note-upload receipt');
  assert.equal(db._avatars.size,1);
  assert.equal(db._profiles.get(userId).avatar_path,userId+'/'+eventId+'.png');
  assert.equal(JSON.stringify(saved.body).includes('avatar_path'),false);
  assert.equal((await call(fn,'session',{auth:true})).body.user.avatar,saved.body.user.avatar);
  const renamed = await call(fn,'profile',{method:'POST',auth:true,body:{name:'New name'}});
  assert.equal(renamed.body.user.avatar,saved.body.user.avatar,'Editing a name preserves its photo');
  const signin = await call(fn,'verify',{method:'POST',body:{email:'member@example.com',token:'123456'}});
  assert.equal(signin.body.user.name,'New name');
  assert.equal(signin.body.user.avatar,saved.body.user.avatar,'Signing in again preserves the profile');
  const removed = await call(fn,'profile',{method:'POST',auth:true,body:{name:'New name',avatar:null}});
  assert.equal(removed.body.user.avatar,null);
  assert.equal(db._avatars.size,0);
});

test('profile replacement cleans up only its own previous photo and tolerates cleanup failure', async () => {
  const previous = userId+'/'+otherId+'.png';
  const db = backend({deleteAvatar:async p => {assert.equal(p,previous);throw Error('temporary storage failure');}});
  db._profiles.set(userId,{user_id:userId,name:'Reader',avatar_path:previous});
  const result = await call(handler(db),'profile',{method:'POST',auth:true,body:{name:'Reader',avatar:{base64:png,mime:'image/png'}}});
  assert.equal(result.statusCode,200);
  assert.match(result.body.user.avatar,new RegExp(eventId));
  const bad = backend({updateProfile:async () => ({previous_avatar_path:otherId+'/'+eventId+'.png',avatar_path:null}),deleteAvatar:async () => {assert.fail('Cannot delete another account photo');}});
  assert.equal((await call(handler(bad),'profile',{method:'POST',auth:true,body:{name:'Reader',avatar:null}})).statusCode,200);
});

test('modern Supabase keys use apikey while authenticated calls keep the user JWT', async () => {
  const calls = [];
  const db = createBackend({env:{...env,SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'},fetchImpl:async (url,opts) => {
    calls.push([url,opts]); return {ok:true,status:200,headers:{get:() => null},text:async () => '{}'};
  }});
  await db.requestCode('reader@example.com');
  await db.updateProfile(userId,'Reader',null,false);
  await db.getUser('user-session-jwt');
  assert.equal(calls[0][1].headers.apikey,'sb_publishable_test');
  assert.equal(calls[0][1].headers.Authorization,undefined);
  assert.equal(calls[1][1].headers.apikey,'sb_secret_test');
  assert.equal(calls[1][1].headers.Authorization,undefined);
  assert.equal(calls[2][1].headers.Authorization,'Bearer user-session-jwt');
});

test('every verified account is a member who can submit pending notes without an application', async () => {
  const db=backend({membership:async () => null,profile:async id => ({user_id:id,name:'JSON'})});
  const fn=handler(db);
  const session=(await call(fn,'session',{auth:true})).body.user;
  assert.equal(session.membership,'approved'); assert.equal(session.isMember,true);
  const verified=await call(fn,'verify',{method:'POST',body:{email:'member@example.com',token:'123456',name:'JSON'}});
  assert.equal(verified.body.user.membership,'approved');assert.equal(verified.body.user.isMember,true);
  assert.equal((await call(fn,'upload',{method:'POST',auth:true,body:{base64:png,mime:'image/png'}})).statusCode,201);
  assert.equal(db._uploads.size,1);
  const submitted = await call(fn,'submit',{method:'POST',auth:true,body:{title:'A note',text:'Observation',date:'2026-09-27',media:[],permission:true}});
  assert.equal(submitted.statusCode,201);
  assert.equal(submitted.body.status,'pending');
  assert.equal(db._notes.length,1);
  assert.deepEqual((await call(fn,'feed')).body.notes,[]);
  assert.equal((await call(fn,'session',{auth:true})).body.user.isMember,true);
  assert.equal((await call(fn,'moderate',{method:'POST',auth:true,body:{kind:'note',id:submitted.body.id,approve:true}})).statusCode,403);
  assert.equal((await call(fn,'like',{method:'POST',auth:true,body:{id:noteId,liked:true}})).statusCode,200);
  assert.equal((await call(fn,'comment',{method:'POST',auth:true,body:{id:noteId,text:'A reader comment'}})).statusCode,201);
});

test('member signup does not grant editor access and the old application endpoints are retired', async () => {
  let moderated = false;
  const db=backend({
    getUser:async token => ({id:token==='owner' ? otherId : userId,email:token==='owner' ? 'xingtong.themargins@gmail.com' : 'member@example.com',email_confirmed_at:'2026-01-01'}),
    isAdmin:async id => id===otherId,
    membership:async () => {throw Error('Legacy membership status must not gate accounts');},
    membershipRequests:async () => {throw Error('No separate membership queue');},
    moderate:async () => {moderated=true;return {};}
  });
  const fn=handler(db);const owner={cookie:'__Host-margins-access=owner'};
  const member=(await call(fn,'session',{auth:true})).body.user;
  assert.equal(member.isMember,true);assert.equal(member.isAdmin,false);
  assert.equal((await call(fn,'review',{auth:true})).statusCode,403);
  assert.equal((await call(fn,'request-membership',{method:'POST',auth:true,body:{}})).statusCode,404);
  assert.equal((await call(fn,'moderate',{method:'POST',auth:true,body:{kind:'note',id:'community-'+eventId,approve:true}})).statusCode,403);
  assert.equal((await call(fn,'moderate',{method:'POST',headers:owner,body:{kind:'membership',id:userId,approve:true}})).statusCode,400);
  assert.equal(moderated,false);
  assert.deepEqual((await call(fn,'review',{headers:owner})).body,{notes:[],comments:[]});
  const editor=(await call(fn,'session',{headers:owner})).body.user;
  assert.equal(editor.isAdmin,true);assert.equal(editor.isMember,true);
});

test('email throttling is reported as a retry error instead of implying a code was sent', async () => {
  const throttled=handler(backend({requestCode:async () => {throw new ProviderError(429);}}));
  const result=await call(throttled,'request-code',{method:'POST',body:{email:'reader@example.com'}});
  assert.equal(result.statusCode,429);
  assert.match(result.body.error,/wait before requesting another code/);
  for (const status of [400,422]) {
    const fn=handler(backend({requestCode:async () => {throw new ProviderError(status);}}));
    const response=await call(fn,'request-code',{method:'POST',body:{email:'reader@example.com'}});
    assert.equal(response.statusCode,200);
    assert.doesNotMatch(JSON.stringify(response.body),/already exists|not found/);
  }
});
