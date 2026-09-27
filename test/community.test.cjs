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
  const likes = new Set(), views = new Set(), uploads = new Map(), notes = [], comments = [];
  return {
    ready:true,ping:async () => [], rate:async () => ({allowed:true}),
    getUser:async token => {if(token !== 'valid') throw new ProviderError(401); return {id:userId,email:'member@example.com',email_confirmed_at:'2026-01-01',user_metadata:{isAdmin:true,role:'admin'}};},
    profile:async id => ({user_id:id,name:'Member <img src=x onerror=alert(1)>'}),
    isAdmin:async () => false,saveProfile:async () => {},syncOwner:async () => {},
    membership:async () => ({status:'approved'}),requestMembership:async () => ({status:'pending'}),membershipRequests:async () => [],
    requestCode:async () => {}, verify:async () => ({access_token:'valid',refresh_token:'refresh',expires_in:3600}),logout:async () => {},
    ensureStatic:async () => {}, target:async id => id === noteId ? {note_id:id,published:true} : null,
    noteState:async () => ({likes:likes.size,liked:likes.has(userId),views:views.size}),
    listNotes:async mode => notes.filter(n => mode === 'mine' || n.status === (mode === 'review' ? 'pending' : 'published')),
    listComments:async () => comments,
    uploadRow:async p => uploads.get(p),
    upload:async (p,id,info) => {uploads.set(p,{path:p,user_id:id,width:info.width,height:info.height,attached_note_id:null});},
    sign:async p => 'https://project.supabase.co/storage/v1/object/sign/community-media/' + p + '?token=short-lived',
    submit:async payload => {notes.push({...payload,id:payload.p_id,title:payload.p_title,text:payload.p_text,date:payload.p_date,media:payload.p_media,author_id:payload.p_user_id,status:'pending'}); return {id:payload.p_id,status:'pending'};},
    like:async (id,uid,liked) => {liked ? likes.add(uid) : likes.delete(uid); return {likes:likes.size,liked};},
    comment:async (id,uid,text) => {comments.push({id:eventId,note_id:id,author_id:uid,text,status:'pending'});},
    view:async (id,event) => {views.add(id + event); return {views:views.size};},
    moderate:async () => {throw Error('Must not be called');},
    ...overrides, _notes:notes,_comments:comments,_uploads:uploads
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
  assert.deepEqual(result.body,{user:{id:userId,name:'Reader',isAdmin:false,membership:'approved',isMember:true}});
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

test('ordinary verified accounts can interact but cannot upload or post before membership approval', async () => {
  const db=backend({membership:async () => null,profile:async id => ({user_id:id,name:'JSON'})});
  const fn=handler(db);
  const session=(await call(fn,'session',{auth:true})).body.user;
  assert.equal(session.membership,'none'); assert.equal(session.isMember,false);
  const verified=await call(fn,'verify',{method:'POST',body:{email:'member@example.com',token:'123456',name:'JSON'}});
  assert.equal(verified.body.user.membership,'none');assert.equal(verified.body.user.isMember,false);
  assert.equal((await call(fn,'upload',{method:'POST',auth:true,body:{base64:png,mime:'image/png'}})).statusCode,403);
  assert.equal(db._uploads.size,0);
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{title:'A note',text:'Observation',date:'2026-09-27',media:[],permission:true}})).statusCode,403);
  assert.equal(db._notes.length,0);
  assert.equal((await call(fn,'like',{method:'POST',auth:true,body:{id:noteId,liked:true}})).statusCode,200);
  assert.equal((await call(fn,'comment',{method:'POST',auth:true,body:{id:noteId,text:'A reader comment'}})).statusCode,201);
});

test('membership requests stay pending until owner approval and rejected applicants can reapply', async () => {
  let state=null;let message='';let moderateCalls=0;
  const db=backend({
    getUser:async token => ({id:token==='owner' ? otherId : userId,email:token==='owner' ? 'xingtong.themargins@gmail.com' : 'member@example.com',email_confirmed_at:'2026-01-01'}),
    membership:async id => id===userId && state ? {status:state} : null,
    isAdmin:async id => id===otherId,
    requestMembership:async (id,text) => {assert.equal(id,userId);message=text;if(state!=='approved')state='pending';return {status:state};},
    membershipRequests:async () => state==='pending' ? [{user_id:userId,message,created_at:'2026-09-28T00:00:00Z'}] : [],
    moderate:async (kind,id,approve,adminId) => {moderateCalls++;assert.equal(kind,'membership');assert.equal(id,userId);assert.equal(adminId,otherId);state=approve ? 'approved' : 'rejected';return {id,kind,status:state};}
  });
  const fn=handler(db);const owner={cookie:'__Host-margins-access=owner'};
  assert.equal((await call(fn,'request-membership',{method:'POST',body:{message:'hello'}})).statusCode,401);
  assert.equal((await call(fn,'request-membership',{method:'POST',auth:true,body:{message:'hello',status:'approved'}})).statusCode,400);
  assert.equal((await call(fn,'request-membership',{method:'POST',auth:true,body:{message:'x'.repeat(1001)}})).statusCode,400);
  const requested=await call(fn,'request-membership',{method:'POST',auth:true,body:{message:'I would like to share photos.'}});
  assert.equal(requested.body.membership,'pending');assert.equal(requested.body.isMember,false);
  assert.equal((await call(fn,'session',{auth:true})).body.user.membership,'pending');
  assert.equal((await call(fn,'review',{auth:true})).statusCode,403);
  const queue=await call(fn,'review',{headers:owner});
  assert.deepEqual(queue.body.requests,[{id:userId,name:'Member <img src=x onerror=alert(1)>',message:'I would like to share photos.',createdAt:'2026-09-28T00:00:00Z'}]);
  assert.equal((await call(fn,'moderate',{method:'POST',auth:true,body:{kind:'membership',id:userId,approve:true}})).statusCode,403);
  assert.equal(moderateCalls,0);
  await call(fn,'moderate',{method:'POST',headers:owner,body:{kind:'membership',id:userId,approve:false}});
  assert.equal((await call(fn,'session',{auth:true})).body.user.membership,'rejected');
  await call(fn,'request-membership',{method:'POST',auth:true,body:{message:'A new request.'}});
  assert.equal(state,'pending');
  await call(fn,'moderate',{method:'POST',headers:owner,body:{kind:'membership',id:userId,approve:true}});
  assert.equal((await call(fn,'session',{auth:true})).body.user.isMember,true);
  assert.equal((await call(fn,'upload',{method:'POST',auth:true,body:{base64:png,mime:'image/png'}})).statusCode,201);
  assert.equal((await call(fn,'submit',{method:'POST',auth:true,body:{title:'A note',text:'Observation',date:'2026-09-27',media:[],permission:true}})).statusCode,201);
  const repeated=await call(fn,'request-membership',{method:'POST',auth:true,body:{message:'Still a member'}});
  assert.equal(repeated.body.membership,'approved');
  const ownerSession=(await call(fn,'session',{headers:owner})).body.user;
  assert.equal(ownerSession.isAdmin,true);assert.equal(ownerSession.isMember,true);assert.equal(ownerSession.membership,'approved');
});
