#!/usr/bin/env node
// Crea un backup (.zip) de PocketBase y poda los más viejos.
// Uso (PowerShell, credenciales solo en memoria del shell):
//   $env:PB_URL="https://app.zonatecno.uno"
//   $env:PB_ADMIN_EMAIL="TU_EMAIL_ADMIN"
//   $env:PB_ADMIN_PASSWORD="TU_PASSWORD_ADMIN"
//   $env:PB_BACKUP_KEEP="14"   # opcional, 0 = no podar
//   npm run backup:pocketbase
// Programalo con cron/systemd/dagster en el VPS. Probá restaurar en un
// entorno aparte antes de confiar en el backup.
import PocketBase from 'pocketbase';

const url = (process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const email = process.env.PB_ADMIN_EMAIL;
const password = process.env.PB_ADMIN_PASSWORD;
const keep = Number(process.env.PB_BACKUP_KEEP ?? 14);

if (!email || !password) {
  console.error('Faltan PB_ADMIN_EMAIL y PB_ADMIN_PASSWORD (variables del shell, nunca en archivos).');
  process.exit(1);
}

const pb = new PocketBase(url);
pb.autoCancellation(false);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const name = `zt-${stamp}.zip`;

try {
  await pb.collection('_superusers').authWithPassword(email, password);
  console.log(`[ZT backup] Creando ${name} en ${url}…`);
  await pb.backups.create(name);
  const list = await pb.backups.getList();
  console.log(`[ZT backup] OK. Backups en servidor: ${list.length}`);
  if (keep > 0 && list.length > keep) {
    const sorted = [...list].sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime());
    for (const old of sorted.slice(0, list.length - keep)) {
      await pb.backups.delete(old.key);
      console.log(`[ZT backup] Podado: ${old.key}`);
    }
  }
} catch (e) {
  console.error('[ZT backup] Error:', e?.response?.data?.message || e?.message || e);
  process.exitCode = 1;
}
