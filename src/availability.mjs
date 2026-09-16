export const DEFAULT_SETTINGS = {enabled:false, maxDays:7, noticeHours:2, duration:30,
  weekly:[[],[],[],[],[],[],[]], overrides:{}, blocks:[]};
const formatter = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function madrid(date=new Date()) { return formatter.format(date).replace(' ', 'T'); }
export function addDays(date, count) { return new Date(Date.parse(date+'T12:00:00Z')+count*86400000).toISOString().slice(0,10); }
export function validDate(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T12:00Z')) && addDays(s,0)===s; }
export function minutes(s) {
  if(typeof s!=='string'|| !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Error('Hora inválida.');
  return Number(s.slice(0,2))*60+Number(s.slice(3));
}
export function time(m) { return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
export function overlaps(a,b,c,d) { return a<d && c<b; }
// Resolve wall time in Madrid independently of the client's/Worker's timezone.
// Nonexistent spring DST times are rejected; autumn repeats share one wall slot.
export function instant(date,hour) {
  const wall=Date.parse(date+'T'+hour+':00Z'); let candidate=wall;
  for(let i=0;i<3;i++) candidate += wall-Date.parse(madrid(new Date(candidate))+':00Z');
  return madrid(new Date(candidate))===date+'T'+hour ? candidate : NaN;
}
export function validateSettings(value) {
  if(!value || typeof value.enabled!=='boolean' || !Number.isInteger(value.maxDays) || value.maxDays<1 || value.maxDays>7 ||
    !Number.isInteger(value.noticeHours)||value.noticeHours<0||value.noticeHours>168 || ![15,30,45,60,90,120].includes(value.duration)) throw new Error('Revisa la antelación y la duración.');
  function windows(arr) {
    if(!Array.isArray(arr)||arr.length>8) throw new Error('Máximo ocho franjas por día.');
    const rows=arr.map(r=> {if(!Array.isArray(r)||r.length!==2||minutes(r[0])>=minutes(r[1])) throw new Error('Cada franja debe terminar después de empezar.');return [r[0],r[1]];}).sort((a,b)=>a[0].localeCompare(b[0]));
    for(let i=1;i<rows.length;i++) if(rows[i][0]<rows[i-1][1]) throw new Error('Hay franjas que se solapan.');
    return rows;
  }
  if(!Array.isArray(value.weekly)||value.weekly.length!==7) throw new Error('Falta un día de la semana.');
  const weekly=value.weekly.map(windows), overrides={};
  if(!value.overrides || typeof value.overrides!=='object'||Array.isArray(value.overrides)||Object.keys(value.overrides).length>180) throw new Error('Revisa los días especiales.');
  for(const [date,rows] of Object.entries(value.overrides)) {if(!validDate(date)) throw new Error('Fecha inválida.');overrides[date]=windows(rows);}
  if(!Array.isArray(value.blocks)||value.blocks.length>180) throw new Error('Revisa los bloqueos.');
  const blocks=value.blocks.map(b=> {if(!validDate(b.date)||minutes(b.start)>=minutes(b.end)) throw new Error('Bloqueo inválido.');return {date:b.date,start:b.start,end:b.end};});
  return {enabled:value.enabled,maxDays:value.maxDays,noticeHours:value.noticeHours,duration:value.duration,weekly,overrides,blocks};
}
export function dayWindows(settings,date) { return Object.hasOwn(settings.overrides,date)?settings.overrides[date]:settings.weekly[new Date(date+'T12:00Z').getUTCDay()]; }
export function inSchedule(settings,date,hour,duration=settings.duration) {
  const start=minutes(hour), end=start+duration;
  return dayWindows(settings,date).some(([a,b])=>start>=minutes(a)&&end<=minutes(b)) &&
    !settings.blocks.some(b=>b.date===date&&overlaps(start,end,minutes(b.start),minutes(b.end)));
}
export function slots(settings,date,citas=[],now=new Date()) {
  const today=madrid(now).slice(0,10);
  if(!settings.enabled||!validDate(date)||date<today||date>addDays(today,settings.maxDays)) return [];
  const result=[];
  for(const [a,b] of dayWindows(settings,date)) {
    for(let start=minutes(a);start+settings.duration<=minutes(b);start+=settings.duration) {
      const hour=time(start), epoch=instant(date,hour);
      if(!Number.isFinite(epoch)||epoch<=now.getTime()||epoch<now.getTime()+settings.noticeHours*3600000) continue;
      if(!inSchedule(settings,date,hour)) continue;
      if(citas.some(c=>c.fecha===date&&c.estado!=='cancelada'&&overlaps(start,start+settings.duration,c.inicio,c.fin))) continue;
      result.push(hour);
    }
  }
  return [...new Set(result)];
}
