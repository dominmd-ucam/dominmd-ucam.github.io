// Copia consistente de la base de datos (VACUUM INTO): npm run backup -- /ruta/destino.db
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const src = process.env.DB_FILE ?? './data/portfolio.db';
const dest = process.argv[2] ?? `./data/backup-${new Date().toISOString().slice(0, 10)}.db`;
if (!existsSync(src)) { console.error(`No existe ${src}`); process.exit(1); }
if (existsSync(dest)) { console.error(`${dest} ya existe`); process.exit(1); }
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
console.log(`Copia creada en ${dest}`);
