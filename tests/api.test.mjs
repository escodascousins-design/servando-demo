import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scryptSync} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {DEFAULT_SETTINGS,madrid,addDays} from '../src/availability.mjs';
const origin='https://servando.example',password='Test-only-strong-password',salt='0123456789abcdef0123456789abcdef';
const encoded=salt+':'+scryptSync(password,salt,64).toString('hex');
async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'src/worker.mjs',contents:await readFile(new URL('../src/worker.mjs',import.meta.url),'utf8')},{type:'ESModule',path:'src/availability.mjs',contents:await readFile(new URL('../src/availability.mjs',import.meta.url),'utf8')}],compatibilityDate:'2026-05-03',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'tests'},bindings:{ADMIN_PASSWORD_HASH:encoded,PUBLIC_BOOKING_ENABLED:'true',PRIVACY_NOTICE:'Test fixture only; no real data'}}));
 const db=await mf.getD1Database('DB');await db.exec((await readFile(new URL('../migrations/0001_reservas.sql',import.meta.url),'utf8')).replace(/\n/g,' '));
 const s={...structuredClone(DEFAULT_SETTINGS),enabled:true,noticeHours:0,weekly:Array.from({length:7},()=>[['09:00','19:00']])};await db.prepare('UPDATE settings SET value=?').bind(JSON.stringify(s)).run();
 const call=async(path,method='GET',data,cookie,ip='192.0.2.1')=>mf.dispatchFetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip,...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const date=addDays(madrid().slice(0,10),1);return {mf,db,call,date};
}
test('Public API redacts customers; race prevents double booking; pending holds slot',async()=>{const f=await fixture();try{
 const before=await (await f.call('availability')).json();assert.equal(before.enabled,true);assert.equal(JSON.stringify(before).includes('telefono'),false);
 const data={nombre:'Cliente de prueba',telefono:'600000000',fecha:f.date,hora:'10:00',notas:'',privacyAccepted:true};
 const results=await Promise.all([f.call('appointments','POST',data),f.call('appointments','POST',data)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const after=await (await f.call('availability')).json();assert.ok(!after.days.find(d=>d.date===f.date).times.includes('10:00'));
 assert.equal((await f.call('panel')).status,401);
 }finally{await f.mf.dispose();}});
test('Real auth, CSRF, expiry, pause, cancellation and manual appointments',async()=>{const f=await fixture();try{
 assert.equal((await f.call('login','POST',{password:'wrong'})).status,401);
 const login=await f.call('login','POST',{password});assert.equal(login.status,200);const header=login.headers.get('Set-Cookie');assert.match(header,/HttpOnly/);assert.match(header,/Secure/);const cookie=header.split(';')[0];
 const panel=await (await f.call('panel','GET',undefined,cookie)).json();
 const settings={...panel.settings,enabled:false};assert.equal((await f.call('settings','PUT',{settings,revision:panel.revision},cookie)).status,200);
 assert.equal((await f.call('settings','PUT',{settings,revision:panel.revision},cookie)).status,409);
 const data={nombre:'Cliente de prueba',telefono:'600000000',fecha:f.date,hora:'10:00',notas:'',privacyAccepted:true};assert.equal((await f.call('appointments','POST',data)).status,409);
 const manual=await f.call('manual','POST',{...data,hora:'20:00'},cookie);assert.equal(manual.status,201);const ref=(await manual.json()).ref;
 assert.equal((await f.call('manual','POST',{...data,hora:'20:15'},cookie)).status,409);
 assert.equal((await f.call('appointments/'+ref,'PATCH',{estado:'cancelada'},cookie)).status,200);
 assert.equal((await f.call('manual','POST',{...data,hora:'20:00'},cookie)).status,201);
 const csrf=await f.mf.dispatchFetch(origin+'/api/logout',{method:'POST',headers:{Origin:'https://evil.example',Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
 assert.equal((await f.call('logout','POST',{},cookie)).status,200);assert.equal((await f.call('panel','GET',undefined,cookie)).status,401);
 const renewed=await f.call('login','POST',{password});const expiredCookie=renewed.headers.get('Set-Cookie').split(';')[0];await f.db.prepare('UPDATE sessions SET expires=0').run();assert.equal((await f.call('panel','GET',undefined,expiredCookie)).status,401);
 }finally{await f.mf.dispose();}});
test('Malformed bookings, privacy acceptance, login rate limiting and blocked-day conflicts',async()=>{const f=await fixture();try{
 const data={nombre:'Cliente de prueba',telefono:'600000000',fecha:f.date,hora:'10:00',notas:'',privacyAccepted:false};assert.equal((await f.call('appointments','POST',data)).status,400);
 assert.equal((await f.call('appointments','POST',{...data,privacyAccepted:true,telefono:'not-a-phone'})).status,400);
 const created=await (await f.call('appointments','POST',{...data,privacyAccepted:true})).json();
 const login=await f.call('login','POST',{password});const cookie=login.headers.get('Set-Cookie').split(';')[0];const panel=await (await f.call('panel','GET',undefined,cookie)).json();
 const settings={...panel.settings,overrides:{[f.date]:[]}};const saved=await (await f.call('settings','PUT',{settings,revision:panel.revision},cookie)).json();assert.deepEqual(saved.conflicts,[created.ref]);
 assert.equal((await f.call('appointments/'+created.ref,'PATCH',{estado:'confirmada'},cookie)).status,409);
 for(let i=0;i<5;i++)assert.equal((await f.call('login','POST',{password:'wrong'},undefined,'192.0.2.2')).status,401);
 assert.equal((await f.call('login','POST',{password},undefined,'192.0.2.2')).status,429);
 }finally{await f.mf.dispose();}});


