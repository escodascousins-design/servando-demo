import {scryptSync,timingSafeEqual,createHash,randomBytes} from 'node:crypto';
import {addDays,madrid,minutes,slots,inSchedule,validateSettings,validDate,instant} from './availability.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function verifyPassword(password,encoded) {
  const [salt,hex]=String(encoded||'').split(':');
  if(!salt||!hex||!/^\w{32,}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hex)) return false;
  const actual=scryptSync(password,salt,64), expected=Buffer.from(hex,'hex');
  return timingSafeEqual(actual,expected);
}
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
function reply(data,status=200,headers={}) {return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
async function body(req) {
  if(!req.headers.get('content-type')?.includes('application/json')) throw new HttpError(415,'Formato de solicitud inválido.');
  const reader=req.body?.getReader(); let size=0,chunks=[];
  if(!reader) throw new HttpError(400,'Faltan datos.');
  while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new HttpError(413,'Demasiados datos.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new HttpError(400,'Datos inválidos.');}
}
async function limited(req,env,kind,max,seconds) {
  const now=Math.floor(Date.now()/1000), bucket=Math.floor(now/seconds);
  const key=hash(env.ADMIN_PASSWORD_HASH+'|'+(req.headers.get('CF-Connecting-IP')||'local')+'|'+kind+'|'+bucket);
  const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+seconds).first();
  if(row.count>max) throw new HttpError(429,'Demasiados intentos. Espera unos minutos.');
}
function sessionToken(req){return /(?:^|;\s*)servando_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('Cookie')||'')?.[1];}
async function auth(req,env) {
  const token=sessionToken(req);
  if(!token||!await env.DB.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').bind(hash(token),Date.now()).first()) throw new HttpError(401,'Entra al panel para continuar.');
}
async function settings(env) {const row=await env.DB.prepare('SELECT value,revision FROM settings WHERE id=1').first();if(!row)throw new Error('Missing migration');return {value:JSON.parse(row.value),revision:row.revision};}
async function citas(env) {return (await env.DB.prepare('SELECT * FROM appointments ORDER BY fecha,hora').all()).results;}
function publicReady(env){return env.PUBLIC_BOOKING_ENABLED==='true'&&!!env.PRIVACY_NOTICE;}
async function createAppointment(req,env,data,manual) {
  const {value:s,revision}=await settings(env);
  if(!manual&&!publicReady(env)) throw new HttpError(409,'Reserva online pausada. Contacta con Servando.');
  if(typeof data.nombre!=='string'||data.nombre.trim().length<2||data.nombre.trim().length>80) throw new HttpError(400,'Escribe tu nombre (2–80 caracteres).');
  const phone=String(data.telefono||'').replace(/[\s()-]/g,'');
  if(!/^(?:\+34)?[6789]\d{8}$/.test(phone)) throw new HttpError(400,'Introduce un teléfono español de nueve cifras.');
  if(typeof data.notas!=='string'||data.notas.length>300) throw new HttpError(400,'Máximo 300 caracteres en notas.');
  if(!manual&&data.privacyAccepted!==true) throw new HttpError(400,'Lee la información de privacidad antes de solicitar cita.');
  if(!validDate(data.fecha))throw new HttpError(400,'Fecha inválida.');
  try{minutes(data.hora);}catch{throw new HttpError(400,'Hora inválida.');}
  if(manual ? (!validDate(data.fecha)||!Number.isFinite(instant(data.fecha,data.hora))||instant(data.fecha,data.hora)<=Date.now()||minutes(data.hora)+s.duration>1440) : !slots(s,data.fecha,[],new Date()).includes(data.hora)) throw new HttpError(409,'Ese hueco ya no está disponible. Elige otro.');
  const start=minutes(data.hora),end=start+s.duration,ref='CIT-'+randomBytes(6).toString('hex').toUpperCase();
  // One serialized statement guards both overlap and concurrent availability edits.
  const result=await env.DB.prepare(`INSERT INTO appointments(ref,nombre,telefono,fecha,hora,inicio,fin,notas,estado,origen,creada)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM settings WHERE id=1 AND revision=?)
    AND NOT EXISTS(SELECT 1 FROM appointments WHERE fecha=? AND estado!='cancelada' AND inicio<? AND fin>?)`)
    .bind(ref,data.nombre.trim(),phone,data.fecha,data.hora,start,end,data.notas.trim(),manual?'confirmada':'pendiente',manual?'manual':'web',new Date().toISOString(),revision,data.fecha,end,start).run();
  if(!result.meta.changes) throw new HttpError(409,'La disponibilidad ha cambiado. Actualiza y elige otro hueco.');
  return reply({ref,estado:manual?'confirmada':'pendiente'},201);
}
export default {
  async fetch(req,env) {
    const url=new URL(req.url),path=url.pathname;
    if(!path.startsWith('/api/')) {
      // Only explicitly public assets are shipped by the build script.
      
      const asset=await env.ASSETS.fetch(new Request(url,req));
      const response=new Response(asset.body,asset);response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');response.headers.set('X-Frame-Options','DENY');
      response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      return response;
    }
    try {
      if(!env.DB||!env.ADMIN_PASSWORD_HASH) throw new HttpError(503,'La reserva online aún no está activada. Puedes usar WhatsApp o llamar.');
      if(req.method!=='GET'&&req.headers.get('Origin')!==url.origin) throw new HttpError(403,'Solicitud no permitida.');
      if(path==='/api/availability'&&req.method==='GET') {
        const {value:s}=await settings(env),now=new Date(),today=madrid(now).slice(0,10);
        const enabled=publicReady(env)&&s.enabled;
        const rows=(await env.DB.prepare("SELECT fecha,inicio,fin,estado FROM appointments WHERE fecha>=? AND fecha<=? AND estado!='cancelada'").bind(today,addDays(today,s.maxDays)).all()).results;
        const days=Array.from({length:s.maxDays+1},(_,i)=>{const date=addDays(today,i);return {date,times:slots({...s,enabled},date,rows,now)};});
        return reply({enabled,days,maxDays:s.maxDays,duration:s.duration,privacy:publicReady(env)?env.PRIVACY_NOTICE:null});
      }
      if(path==='/api/login'&&req.method==='POST') {
        await limited(req,env,'login',5,900);const data=await body(req);
        if(typeof data.password!=='string'||data.password.length>256||!verifyPassword(data.password,env.ADMIN_PASSWORD_HASH)) throw new HttpError(401,'Contraseña incorrecta.');
        const token=randomBytes(32).toString('hex');await env.DB.prepare('INSERT INTO sessions(token,expires) VALUES(?,?)').bind(hash(token),Date.now()+12*3600000).run();
        return reply({ok:true},200,{'Set-Cookie':`servando_session=${token}; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`});
      }
      if(path==='/api/appointments'&&req.method==='POST') {await limited(req,env,'booking',5,900);return await createAppointment(req,env,await body(req),false);}
      await auth(req,env);
      if(path==='/api/logout'&&req.method==='POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(hash(sessionToken(req))).run();
        return reply({ok:true},200,{'Set-Cookie':'servando_session=; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
      }
      if(path==='/api/panel'&&req.method==='GET') {
        const s=await settings(env);return reply({settings:s.value,revision:s.revision,appointments:await citas(env),publicReady:publicReady(env)});
      }
      if(path==='/api/settings'&&req.method==='PUT') {
        const data=await body(req);let s;try{s=validateSettings(data.settings);}catch(e){throw new HttpError(400,e.message);}
        const result=await env.DB.prepare('UPDATE settings SET value=?,revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(s),data.revision).run();
        if(!result.meta.changes) throw new HttpError(409,'Otro dispositivo ha cambiado el horario. Actualiza el panel.');
        const conflicts=(await citas(env)).filter(c=>c.estado!=='cancelada'&&c.fecha>=madrid().slice(0,10)&&!inSchedule(s,c.fecha,c.hora,c.fin-c.inicio)).map(c=>c.ref);
        return reply({ok:true,conflicts});
      }
      if(path==='/api/manual'&&req.method==='POST') return await createAppointment(req,env,await body(req),true);
      const match=/^\/api\/appointments\/(CIT-[A-F0-9]{12})$/.exec(path);
      if(match&&req.method==='PATCH') {
        const data=await body(req);if(!['confirmada','cancelada'].includes(data.estado)) throw new HttpError(400,'Estado inválido.');
        const row=await env.DB.prepare('SELECT * FROM appointments WHERE ref=?').bind(match[1]).first();if(!row)throw new HttpError(404,'Cita no encontrada.');
        if(data.estado==='confirmada') {
          const {value:s,revision}=await settings(env);
          if(instantPast(row)||!inSchedule(s,row.fecha,row.hora,row.fin-row.inicio)) throw new HttpError(409,'La cita queda fuera del horario actual o ya ha pasado. Habla con el cliente para cambiarla.');
          const result=await env.DB.prepare(`UPDATE appointments SET estado='confirmada' WHERE ref=? AND EXISTS(SELECT 1 FROM settings WHERE id=1 AND revision=?)
            AND NOT EXISTS(SELECT 1 FROM appointments WHERE ref!=? AND fecha=? AND estado!='cancelada' AND inicio<? AND fin>?)`).bind(row.ref,revision,row.ref,row.fecha,row.fin,row.inicio).run();
          if(!result.meta.changes)throw new HttpError(409,'Hay otra cita o ha cambiado el horario. Actualiza el panel.');
        } else await env.DB.prepare("UPDATE appointments SET estado='cancelada' WHERE ref=?").bind(row.ref).run();
        return reply({ok:true});
      }
      throw new HttpError(404,'Ruta no encontrada.');
    } catch(e) { return reply({error:e.status?e.message:'No se ha podido completar. Inténtalo de nuevo o contacta con Servando.'},e.status||500); }
  },
  async scheduled(_event,env) {
    const now=Date.now();await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(Math.floor(now/1000)),
      env.DB.prepare('DELETE FROM appointments WHERE fecha<?').bind(addDays(madrid().slice(0,10),-90))
    ]);
  }
};
function instantPast(row){return row.fecha+'T'+row.hora<=madrid();}

