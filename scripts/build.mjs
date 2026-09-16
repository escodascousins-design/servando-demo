import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['index.html','panel.html','booking.css','booking.js','panel.js']) await copyFile(file,'dist/'+file);
