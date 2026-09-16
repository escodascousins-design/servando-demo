const $=id=>document.getElementById(id), feedback=$('feedback');
let state, settings, dirty=false;
const weekdays=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say=(message,error=false)=>{feedback.textContent=message;feedback.classList.toggle('error',error);};
async function api(path,method='GET',data){
  const response=await fetch('/api/'+path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json();if(!response.ok){if(response.status===401)showLogin();throw new Error(result.error||'No se ha podido completar.');}return result;
}
function showLogin(){$('dashboard').hidden=true;$('logout').hidden=true;$('login').hidden=false;state=null;settings=null;$('appointments').replaceChildren();}
function parseWindows(raw){if(!raw.trim())return [];return raw.split(',').map(part=>{const match=/^\s*([0-2]\d:[0-5]\d)\s*-\s*([0-2]\d:[0-5]\d)\s*$/.exec(part);if(!match||match[1]>=match[2]||match[1]>'23:59'||match[2]>'23:59')throw new Error('Usa franjas como 09:00-13:00, 17:00-19:00, con el final después del inicio.');return [match[1],match[2]];});}
const displayWindows=windows=>windows.map(w=>w.join('-')).join(', ');
function syncControls(){settings.enabled=$('enabled').checked;settings.maxDays=Number($('maxDays').value);settings.duration=Number($('duration').value);settings.noticeHours=Number($('noticeHours').value);settings.weekly=Array.from({length:7},(_,i)=>parseWindows($('week'+i).value));}
function renderSettings(){
  $('enabled').checked=settings.enabled;$('maxDays').value=settings.maxDays;$('duration').value=settings.duration;$('noticeHours').value=settings.noticeHours;
  $('activationNotice').textContent=state.publicReady?'Puedes abrir y pausar la reserva online cuando quieras.':'La reserva pública está pendiente de activación y de la información de privacidad. Puedes preparar tu agenda y anotar citas mientras tanto.';
  $('weekly').innerHTML=[1,2,3,4,5,6,0].map(i=>`<div class="schedule-row"><label for="week${i}">${weekdays[i]}</label><input id="week${i}" aria-label="Franjas del ${weekdays[i]}" value="${escape(displayWindows(settings.weekly[i]))}" placeholder="Cerrado"></div>`).join('');
  renderExceptions();
}
function renderExceptions(){
  $('overrides').innerHTML=Object.entries(settings.overrides).sort(([a],[b])=>a.localeCompare(b)).map(([date,windows])=>`<div class="saved-row"><span>${escape(date)} · ${escape(displayWindows(windows)||'Día cerrado')}</span><button type="button" class="secondary" data-remove-day="${escape(date)}">Volver al horario semanal</button></div>`).join('');
  $('blocks').innerHTML=settings.blocks.map((b,i)=>`<div class="saved-row"><span>${escape(b.date)} · ${escape(b.start)}–${escape(b.end)}</span><button type="button" class="secondary" data-remove-block="${i}">Quitar bloqueo</button></div>`).join('');
}
function outOfSchedule(c){
  const windows=Object.hasOwn(state.settings.overrides,c.fecha)?state.settings.overrides[c.fecha]:state.settings.weekly[new Date(c.fecha+'T12:00Z').getUTCDay()];
  const minute=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
  return !windows.some(([a,b])=>c.inicio>=minute(a)&&c.fin<=minute(b))||state.settings.blocks.some(b=>b.date===c.fecha&&c.inicio<minute(b.end)&&c.fin>minute(b.start));
}
function renderAppointments(){
  const query=$('search').value.toLowerCase(),filter=$('filter').value;
  const list=state.appointments.filter(c=>(filter==='todas'||(filter==='activas'?c.estado!=='cancelada':c.estado===filter))&&(c.nombre+' '+c.telefono+' '+c.ref).toLowerCase().includes(query));
  $('stats').textContent=`${state.appointments.filter(c=>c.estado==='pendiente').length} pendientes · ${state.appointments.filter(c=>c.estado==='confirmada').length} confirmadas`;
  $('appointments').innerHTML=list.length?list.map(c=>{
    const phone=c.telefono.replace(/\D/g,''),international=phone.length===9?'34'+phone:phone;
    const message=`Hola ${c.nombre}, soy Servando. Sobre tu cita del ${c.fecha} a las ${c.hora} (${c.ref}), ${c.estado==='confirmada'?'te confirmo que está reservada.':c.estado==='cancelada'?'necesitamos buscar otro momento.':'te escribo para concretarla.'}`;
    return `<article class="appointment"><h3>${escape(c.nombre)} <span class="state ${escape(c.estado)}">${escape(c.estado)}</span></h3><p>${escape(c.fecha)} · ${escape(c.hora)} · ${c.fin-c.inicio} minutos<br>${escape(c.telefono)} · ${c.origen==='web'?'Solicitud online':'WhatsApp / teléfono'}<br>${escape(c.ref)}${c.notas?'<br>'+escape(c.notas):''}</p>${c.estado!=='cancelada'&&outOfSchedule(c)?'<p class="conflict">Fuera del horario actual. Habla con el cliente para acordar otro momento.</p>':''}<div class="panel-actions">${c.estado==='pendiente'?`<button data-ref="${escape(c.ref)}" data-state="confirmada">Confirmar</button>`:''}${c.estado!=='cancelada'?`<button class="danger" data-ref="${escape(c.ref)}" data-state="cancelada">Cancelar</button>`:''}<a href="https://wa.me/${international}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">Hablar por WhatsApp ↗</a><a href="tel:+${international}">Llamar</a></div><p class="booking-help">Confirmar o cancelar cambia la agenda. Para avisar al cliente, abre WhatsApp o llámale.</p></article>`;
  }).join(''):'<p class="empty">No hay citas con este filtro.</p>';
}
async function load(){const result=await api('panel');state=result;settings=structuredClone(result.settings);dirty=false;renderSettings();renderAppointments();$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;}
// Keep unsaved availability while updating appointments.
async function reloadAppointments(){const result=await api('panel');if(dirty){state.appointments=result.appointments;renderAppointments();}else{state=result;settings=structuredClone(result.settings);renderSettings();renderAppointments();}}
async function busy(button,action){button.disabled=true;try{await action();}catch(error){say(error.message,true);}finally{button.disabled=false;}}
$('loginForm').addEventListener('submit',event=>{event.preventDefault();busy(event.submitter,async()=>{await api('login','POST',{password:event.target.elements.password.value});event.target.reset();await load();say('Tu agenda está lista.');});});
$('logout').addEventListener('click',event=>busy(event.target,async()=>{await api('logout','POST',{});showLogin();say('Has salido del panel.');}));
$('settingsForm').addEventListener('input',()=>{dirty=true;});
$('settingsForm').addEventListener('submit',event=>{event.preventDefault();busy(event.submitter,async()=>{syncControls();const result=await api('settings','PUT',{settings,revision:state.revision});await load();say(result.conflicts.length?`Horario guardado. ${result.conflicts.length} citas quedan fuera de este horario. Revísalas y habla con los clientes; siguen en la agenda.`:'Disponibilidad guardada. Los clientes verán tus nuevos huecos.',result.conflicts.length>0);});});
$('refresh').addEventListener('click',event=>busy(event.target,async()=>{await load();say('Agenda actualizada. Los cambios sin guardar se han descartado.');}));
$('addOverride').addEventListener('click',()=>{try{const date=$('overrideDate').value;if(!date)throw new Error('Elige una fecha para el día especial.');settings.overrides[date]=parseWindows($('overrideWindows').value);dirty=true;renderExceptions();say('Día preparado. Pulsa Guardar disponibilidad para aplicarlo.');}catch(e){say(e.message,true);}});
$('addBlock').addEventListener('click',()=>{const date=$('blockDate').value,start=$('blockStart').value,end=$('blockEnd').value;if(!date||!start||!end||start>=end){say('Elige fecha y una hora final posterior al inicio.',true);return;}settings.blocks.push({date,start,end});dirty=true;renderExceptions();say('Bloqueo preparado. Pulsa Guardar disponibilidad para aplicarlo.');});
$('settingsForm').addEventListener('click',event=>{const day=event.target.dataset.removeDay,index=event.target.dataset.removeBlock;if(day){delete settings.overrides[day];dirty=true;renderExceptions();}if(index!==undefined){settings.blocks.splice(Number(index),1);dirty=true;renderExceptions();}});
$('manualForm').addEventListener('submit',event=>{event.preventDefault();busy(event.submitter,async()=>{const result=await api('manual','POST',Object.fromEntries(new FormData(event.target)));event.target.reset();await reloadAppointments();say('Cita anotada: '+result.ref);});});
$('appointments').addEventListener('click',event=>{const button=event.target.closest('button[data-state]');if(!button)return;busy(button,async()=>{await api('appointments/'+button.dataset.ref,'PATCH',{estado:button.dataset.state});await reloadAppointments();say('Cita '+button.dataset.state+'. Recuerda avisar al cliente por WhatsApp o teléfono.');});});
$('search').addEventListener('input',()=>state&&renderAppointments());$('filter').addEventListener('change',()=>state&&renderAppointments());
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
api('panel').then(async result=>{state=result;settings=structuredClone(result.settings);renderSettings();renderAppointments();$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;}).catch(error=>{if(!error.message.includes('Entra al panel'))say(error.message,true);});
