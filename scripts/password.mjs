import {randomBytes,scryptSync} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
const prompt=createInterface({input:process.stdin,output:process.stdout});
console.log('Genera el hash localmente; no compartas la contraseña ni lo guardes en Git.');
const password=await prompt.question('Contraseña (mínimo 12 caracteres; entrada visible): ');prompt.close();
if(password.length<12) throw new Error('Usa al menos 12 caracteres.');
const salt=randomBytes(16).toString('hex');console.log(salt+':'+scryptSync(password,salt,64).toString('hex'));
