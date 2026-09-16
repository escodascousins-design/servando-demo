import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const id=config.d1_databases?.find(binding=>binding.binding==='DB')?.database_id;
if(!id||id==='00000000-0000-0000-0000-000000000000')throw new Error('Configura el ID real de D1 y aplica la migración antes de publicar. Ver README.md.');
