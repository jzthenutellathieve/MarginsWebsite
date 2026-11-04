// Deployable HTML and actual API handler; only the external Auth/database/storage service is simulated.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {JSDOM,CookieJar}=require('jsdom');
const {createHandler,ProviderError}=require('../../server/community.cjs');
const origin='https://themarginsjournals.com', root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const users=['c610a731-c39e-433b-bdae-a4f4f4f68412','d610a731-c39e-433b-bdae-a4f4f4f68412'];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=','base64');
const tick=()=>new Promise(r=>setTimeout(r,3));
async function until(fn){for(let i=0;i<400;i++){if(fn())return; await tick();}assert.ok(fn(),'Expected UI state did not appear');}
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('member journey: stable first paint, inline login, durable draft and profile, renewal and logout',async t=>{
  let jar=new CookieJar(), serial=0, renewals=0;
  const profiles=new Map(), tokens=new Map(), refreshes=new Map(), uploads=new Map(), images=new Map(), notes=[];
  const storageMap=new Map(), pages=[], requests=[], mail=[];
  const tokenSet=id=>{const access_token='mock-access-'+(++serial),refresh_token='mock-refresh-'+serial;tokens.set(access_token,id);refreshes.set(refresh_token,id);return {access_token,refresh_token,expires_in:3600};};
  const emails=['member@example.test','another@example.test'];
  const backend={ready:true,rate:async()=>({allowed:true}),requestCode:async email=>{mail.push(email);},
    verify:async(email,code)=>{if(code!=='12345678'||!mail.includes(email))throw new ProviderError(400);return tokenSet(users[emails.indexOf(email)]);},
    getUser:async token=>{const id=tokens.get(token);if(!id)throw new ProviderError(403);return {id,email:emails[users.indexOf(id)],email_confirmed_at:'2026-10-01'};},
    refresh:async token=>{const id=refreshes.get(token);if(!id)throw new ProviderError(400);refreshes.delete(token);renewals++;return tokenSet(id);},
    logout:async token=>{const id=tokens.get(token);for(const map of [tokens,refreshes])for(const [k,v] of map)if(id===v)map.delete(k);},
    profile:async id=>profiles.get(id)||null,saveProfile:async(id,name)=>profiles.set(id,{...profiles.get(id),user_id:id,name}),isAdmin:async()=>false,
    updateProfile:async(id,name,avatar,change)=>{const p=profiles.get(id), old=p.avatar_path||null;p.name=name;if(change)p.avatar_path=avatar;return {previous_avatar_path:old,avatar_path:p.avatar_path||null};},
    updateAppearance:async(id,bio,color,cover,change)=>{const p=profiles.get(id), old=p.background_path||null;Object.assign(p,{bio,background_color:color});if(change)p.background_path=cover;return {previous_path:old,background_path:p.background_path||null};},
    uploadAvatar:async(key,image)=>images.set(key,image),deleteAvatar:async key=>images.delete(key),sign:async(key,bucket)=>'https://images.example.test/'+bucket+'/'+key,
    upload:async(key,uid,info)=>uploads.set(key,{user_id:uid,width:info.width,height:info.height}),uploadRow:async key=>uploads.get(key),
    submit:async p=>{notes.push({id:p.p_id,author_id:p.p_user_id,title:p.p_title,text:p.p_text,date:p.p_date,media:p.p_media,status:'pending'});return {id:p.p_id,status:'pending'};},
    listNotes:async(mode,uid)=>mode==='mine'?notes.filter(n=>n.author_id===uid):[],listComments:async()=>[],
    target:async()=>({published:true}),ensureStatic:async()=>{},noteState:async()=>({likes:0,liked:false,views:0}),view:async()=>({views:0})};
  const handler=createHandler({env:{COMMUNITY_ENABLED:'true',VERCEL_ENV:'production',SUPABASE_SERVICE_ROLE_KEY:'fixture'},backend,ids:new Set()});
  t.after(()=>pages.forEach(p=>p.window.close()));
  function open(route,gate){
    const url=new URL(route,origin), d=new JSDOM(read('dist'+url.pathname+'index.html'),{url:url.href,runScripts:'outside-only',cookieJar:jar,pretendToBeVisual:true});pages.push(d);
    const w=d.window, doc=w.document;Object.defineProperty(w,'localStorage',{value:{getItem:k=>storageMap.get(k)??null,setItem:(k,v)=>storageMap.set(k,String(v)),removeItem:k=>storageMap.delete(k)}});
    w.IntersectionObserver=class{observe(){}};w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.fetch=async(relative,opts)=>{
      const url=new URL(relative,origin);assert.equal(url.origin,origin);const action=url.searchParams.get('action');requests.push(action);
      if(action==='session'&&gate)await gate.promise;
      const req={url:url.pathname+url.search,method:opts.method,headers:{origin,'content-type':'application/json',cookie:jar.getCookieStringSync(origin)},body:opts.body};
      const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
      await handler(req,res);for(const c of res.headers['Set-Cookie']||[])jar.setCookieSync(c,origin);
      return new Response(res.body,{status:res.statusCode,headers:{'Content-Type':'application/json'}});
    };
    const style=doc.createElement('style');style.textContent=read('public/community.css');doc.head.append(style);
    w.eval([...doc.head.querySelectorAll('script')].find(s=>s.textContent.includes('dataset.viewer')).textContent);
    w.eval(read('public/community.js'));return {w,doc};
  }
  const set=(input,v)=>{input.value=v;input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));};
  const send=form=>form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit',{bubbles:true,cancelable:true}));
  const attach=(input,name)=>{const w=input.ownerDocument.defaultView;Object.defineProperty(input,'files',{configurable:true,value:[new w.File([png],name,{type:'image/png'})]});input.dispatchEvent(new w.Event('change',{bubbles:true}));};
  async function join(doc,email){
    await until(()=>doc.querySelector('input[type="email"][maxlength="254"]'));
    const emailInput=doc.querySelector('input[type="email"][maxlength="254"]');set(emailInput,email);send(emailInput.form);
    const code=doc.querySelector('[autocomplete="one-time-code"]');await until(()=>!code.form.hidden);set(code,'12345678');send(code.form);
    await until(()=>doc.documentElement.dataset.viewer==='member'&&doc.querySelector('.community-editor'));
  }
  function visibleMember(page){assert.equal(page.doc.documentElement.dataset.viewer,'member');
    assert.equal(page.w.getComputedStyle(page.doc.querySelector('[data-account-label="guest"]')).visibility,'hidden');
    assert.equal(page.w.getComputedStyle(page.doc.querySelector('[data-account-label="member"]')).visibility,'visible');}
  let page=open('/field-notes/#share-a-note');await join(page.doc,emails[0]);visibleMember(page);
  assert.match(page.doc.cookie,/__Host-margins-ui=member/);assert.doesNotMatch(page.doc.cookie,/mock-access|mock-refresh/);
  let form=page.doc.querySelector('[data-note-composer] .community-editor form');assert.ok(form);
  set(form.querySelector('input[type="text"]'),'A test observation');set(form.querySelector('textarea'),'A draft written directly in Notes.');set(form.querySelector('input[type="date"]'),'2026-10-01');
  attach(form.querySelector('[type="file"]'),'test-photo.png');await until(()=>form.querySelector('.community-upload .community-status')?.textContent==='Uploaded');
  set(form.querySelector('.community-upload input'),'A test photograph');
  const gate=defer();page=open('/articles/',gate);visibleMember(page);assert.equal(requests.includes('status'),false);gate.resolve();await tick();
  // Reopen, including persistent Secure cookies as serialized by a browser cookie jar.
  jar=CookieJar.deserializeSync(jar.serializeSync());const slow=defer(); page=open('/field-notes/#share-a-note',slow);visibleMember(page);
  form=page.doc.querySelector('[data-note-composer] form');assert.ok(form,'Editor opens before the session response');assert.equal(form.querySelector('[type="submit"]').disabled,true);
  slow.resolve();await until(()=>!form.querySelector('[type="submit"]').disabled);
  assert.equal(form.querySelector('textarea').value,'A draft written directly in Notes.');assert.equal(form.querySelector('.community-upload input').value,'A test photograph');
  assert.equal(form.querySelector('[type="checkbox"]').checked,false);form.querySelector('[type="checkbox"]').checked=true;send(form);await until(()=>notes.length===1);
  assert.equal(notes[0].status,'pending');assert.equal(notes[0].author_id,users[0]);assert.equal(notes[0].media.length,1);await until(()=>!storageMap.has('margins.note-draft.v1:'+users[0]));
  page=open('/account/');await until(()=>page.doc.querySelector('.community-appearance'));assert.equal(page.doc.querySelector('.community-review'),null);
  const profile=page.doc.querySelector('.community-profile form');set(profile.querySelector('input[type="text"]'),'Member One');attach(profile.querySelector('[type="file"]'),'avatar.png');send(profile);await until(()=>profile.textContent.includes('Profile saved.'));
  const appearance=page.doc.querySelector('.community-appearance');set(appearance.querySelector('textarea'),'A short bio');set(appearance.querySelector('[type="color"]'),'#446655');attach(appearance.querySelector('[type="file"]'),'cover.png');send(appearance);await until(()=>appearance.textContent.includes('Appearance saved.'));
  const renewed=defer();tokens.clear();page=open('/articles/',renewed);visibleMember(page);renewed.resolve();await until(()=>renewals===1);
  page=open('/account/');await until(()=>page.doc.querySelector('.community-profile-bio'));assert.equal(page.doc.querySelector('.community-profile-bio').textContent,'A short bio');
  assert.equal(page.doc.querySelector('.community-profile-banner').style.getPropertyValue('--profile-color'),'#446655');assert.ok(page.doc.querySelector('.community-profile-banner img'));assert.ok(page.doc.querySelector('.community-avatar img'));assert.match(page.doc.querySelector('.community-mine').textContent,/A test observation/);
  form=page.doc.querySelector('.community-editor form');set(form.querySelector('textarea'),'Private unsubmitted draft from member one');
  [...page.doc.querySelectorAll('button')].find(b=>b.textContent==='Sign out').click();await until(()=>page.doc.documentElement.dataset.viewer==='guest');
  assert.doesNotMatch(jar.getCookieStringSync(origin),/__Host-margins-access|__Host-margins-refresh/);
  page=open('/field-notes/#share-a-note');await join(page.doc,emails[1]);assert.equal(page.doc.querySelector('.community-editor textarea').value,'');assert.equal(page.doc.querySelector('.community-review'),null);
});
