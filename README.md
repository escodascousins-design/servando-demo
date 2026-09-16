# Servando — reserva opcional y agenda flexible

## Contexto revisado antes de modificar
- Prospección canónica: https://docs.google.com/document/d/1JcddatM-X1XI_ei5MRVdMNEwZSBE0TtppAOP0BLuvBc/edit
- Web y /panel inspeccionados en navegador el 16/09/2026.
- Repositorios escodascousins-design/escoda-project-com y escodascousins-design/servando-demo inspeccionados. El código de Servando está en el segundo.
- Instagram https://www.instagram.com/ser_estilista/ confirma identidad, Xixona/Jijona y 675701725. Se enlaza al perfil; no se descargan ni copian fotos porque no hay archivos originales ni autorización de reutilización verificada entre los recursos disponibles.
- Panel original: acceso simulado, citas ficticias en localStorage y WhatsApp simulado. No se importa esa información a la agenda real.

## Comportamiento
Se conserva el diseño público, WhatsApp, llamadas y pago presencial. El cliente puede solicitar una cita sin cuenta. Todas las solicitudes son pendientes: Servando confirma manualmente y contacta desde WhatsApp o teléfono. Los enlaces no envían mensajes automáticamente.

Panel con autenticación real y datos compartidos en D1: semana flexible y partida, fechas con horario especial o totalmente cerradas, bloqueos parciales, duración global de cada cita, margen mínimo y antelación máxima de 1–7 días naturales en Europe/Madrid (hoy más hasta siete días; no ventana móvil exacta de 168 horas). Horarios vacíos y reserva pausada de inicio: no se inventan horarios, servicios ni precios.

Las citas manuales pueden anotarse a cualquier hora futura, incluso fuera del horario publicado o de la antelación online. Consumen disponibilidad si coinciden con un hueco público. La duración global se guarda por cita y las citas antiguas conservan su duración al cambiar el ajuste. Cambiar disponibilidad nunca cancela citas automáticamente; el panel avisa de citas fuera del nuevo horario. Para mover una cita, hablar con el cliente, cancelar la anterior y anotar la nueva.

Los pendientes ocupan su intervalo hasta que Servando los confirma o cancela. Pausar impide nuevas solicitudes online pero conserva citas y permite anotar las de teléfono. No hay correos, pagos, recordatorios ni notificaciones automáticas: hay que entrar al panel y avisar al cliente.

## Desarrollo y comprobación
Requiere Node 22 o superior. Herramienta oficial Cloudflare Wrangler; scripts en package.json.

```sh
npm ci
npm test
npm run check
npx wrangler d1 migrations apply DB --local
npm run dev
```

Para pruebas locales, crear .dev.vars (ignorado por Git) con ADMIN_PASSWORD_HASH, PUBLIC_BOOKING_ENABLED y PRIVACY_NOTICE. Nunca usar datos reales en la vista local de prueba. Con PUBLIC_BOOKING_ENABLED=false o sin aviso de privacidad, el formulario público permanece cerrado. Sin contraseña configurada la API falla cerrada y la web conserva los contactos.

La compilación copia solo cinco archivos públicos a dist. Código del servidor, pruebas, migraciones, configuraciones y secretos quedan fuera de los recursos públicos. No se usa localStorage para datos de clientes.

## Puesta en marcha en el Cloudflare existente
No crear otro sitio ni cambiar dominio/hosting. Antes de integrar en main, comprobar si esa rama despliega automáticamente; la reserva requiere preparar D1 y los secretos primero.

1. Crear una base D1 `servando-reservas` en la cuenta Cloudflare que actualmente aloja la demo. Sustituir el UUID provisional de wrangler.jsonc por el ID real.
2. Aplicar la migración remota:
   `npx wrangler d1 migrations apply DB --remote`
3. Generar localmente el hash de una contraseña fuerte con `npm run password` y cargar **solo el hash** mediante `npx wrangler secret put ADMIN_PASSWORD_HASH`. La contraseña no va al repositorio ni a mensajes. Guardarla por un canal adecuado con Servando. Los hashes y credenciales tampoco deben guardarse en Git.
4. Preparar el aviso de privacidad real con identidad/contacto del responsable, finalidad de gestionar citas, base aplicable, proveedor/alojamiento, plazo de conservación y vía para ejercer derechos. No se ha inventado esa identidad ni un aviso legal. Cargar el texto aprobado mediante `npx wrangler secret put PRIVACY_NOTICE`.
5. Desplegar inicialmente con PUBLIC_BOOKING_ENABLED=false. Verificar acceso real al panel, persistencia entre dispositivos, dominio y contactos. `npm run deploy` requiere autenticación del titular en Cloudflare.
6. Servando prepara sus horarios desde /panel. Solo cuando quiera, cambiar PUBLIC_BOOKING_ENABLED a "true", desplegar y activar las solicitudes en el panel. Son dos cierres independientes: publicación técnica y decisión de Servando.
7. Validar una solicitud de prueba, confirmación/cancelación y enlaces de contacto; retirar la prueba de la base antes de uso real. Verificar crons y copias de D1 según la operación de Escoda Project.

La tarea no se ha publicado. La conexión GitHub observada es E-Scout03, con lectura pública pero sin escritura en el repositorio de Escoda Project. En esta sesión no hay acceso Cloudflare confirmado. No hace falta compartir contraseñas ni claves por el chat.

## Seguridad y conservación
Sesión de doce horas con cookie Secure, HttpOnly, SameSite=Strict, token aleatorio cuyo hash se guarda en D1. Contraseña verificada con scrypt. Peticiones de escritura solo desde el mismo origen, validación en servidor, consultas preparadas y límites de cinco intentos de acceso o reserva por IP cada quince minutos. La disponibilidad pública expone solo horas, nunca nombres ni teléfonos. Inserciones y confirmaciones comprueban solapamientos de intervalos y revisión de horario en una única consulta para evitar carreras.

Cron diario elimina sesiones/límites vencidos y citas con fecha anterior a 90 días. Este plazo es una decisión operativa inicial que debe acordarse y reflejarse en el aviso antes de activar. Las reservas nunca se abren por defecto. Los cambios de ajustes simultáneos se rechazan y solicitan actualizar el panel.

## Validación
Pruebas de reglas horarias (Madrid, cambios de hora, cierre, bloqueos, margen, duración, límite) y de API/D1 con el simulador oficial: autenticación, privacidad, peticiones simultáneas, pausa, citas manuales, cancelación, conflictos de horario, revisión simultánea, origen y límites de intentos. Recorrido completo comprobado en navegador local y formulario revisado a 390 px sin desbordamiento horizontal. La producción requiere además las comprobaciones indicadas arriba.
