const form=document.querySelector('#bookingForm'),status=document.querySelector('#bookingStatus');
const dateSelect=document.querySelector('#bookingDate'),timeSelect=document.querySelector('#bookingTime');
let availability,loading=false;
const say=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error);};
const formatDate=date=>new Date(date+'T12:00:00Z').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Madrid'});
function renderTimes(){timeSelect.replaceChildren(new Option('Elige una hora',''));for(const hour of availability.days.find(d=>d.date===dateSelect.value)?.times||[])timeSelect.add(new Option(hour,hour));}
async function load(){
  try{
    const response=await fetch('/api/availability',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);
    availability=data;dateSelect.replaceChildren(new Option('Elige un día',''));
    for(const day of data.days.filter(d=>d.times.length))dateSelect.add(new Option(formatDate(day.date),day.date));
    const open=data.enabled&&data.days.some(d=>d.times.length);
    form.hidden=!open;document.querySelector('#bookingPrivacy').textContent=data.privacy||'';
    document.querySelector('#bookingInfo').textContent=open?`Puedes solicitar un hueco hasta ${data.maxDays} días antes. Horas de Xixona. Servando confirmará contigo la cita; enviarla no es una confirmación.`:data.enabled?'Ahora no hay huecos publicados. Puedes escribirle o llamar para consultar.':'La reserva online está pausada. Servando sigue atendiendo por WhatsApp y teléfono.';
    renderTimes();
  }catch(e){form.hidden=true;document.querySelector('#bookingInfo').textContent='No se ha podido consultar la disponibilidad. Puedes escribir a Servando por WhatsApp o llamar.';}
}
dateSelect.addEventListener('change',renderTimes);
form.addEventListener('submit',async event=>{
  event.preventDefault();if(loading)return;loading=true;const button=form.querySelector('button[type=submit]');button.disabled=true;say('Enviando solicitud…');
  const data=Object.fromEntries(new FormData(form));data.privacyAccepted=form.elements.privacyAccepted.checked;
  try{
    const response=await fetch('/api/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok){const error=new Error(result.error);error.status=response.status;throw error;}
    say(`Solicitud enviada · ${result.ref}. Pendiente de confirmación: Servando se pondrá en contacto contigo. No necesitas enviar otra solicitud.`,false);
    form.reset();form.hidden=true;document.querySelector('#bookingInfo').textContent=`Has solicitado el ${formatDate(data.fecha)} a las ${data.hora}. Para cambiarla, habla con Servando.`;
    status.setAttribute('tabindex','-1');status.focus();
  }catch(error){say(error.message||'No se ha podido enviar. Si la conexión se ha cortado, consulta con Servando antes de volver a enviarla.',true);if(error.status===409)await load();}
  finally{loading=false;button.disabled=false;}
});
load();
