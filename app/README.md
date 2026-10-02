# ZT Gestión —subsistema multiempresa híbrido (PocketBase + offline)

Gestión de ventas, stock, organizaciones y equipo. Funciona sin internet y
sincroniza con PocketBase cuando vuelve la conexión.

## 1. Preparar PocketBase (una sola vez)

No cargues la contraseña del administrador en la app web. Prepará las colecciones
desde una terminal con:

```sh
cd app
$env:PB_URL="https://app.zonatecno.uno"
$env:PB_ADMIN_EMAIL="TU_EMAIL_ADMIN"
$env:PB_ADMIN_PASSWORD="TU_PASSWORD_ADMIN"
npm.cmd run setup:pocketbase
```

El script aplica reglas para aislar los datos de cada organización y agrega los
campos de sincronización idempotente (`local_id`). Las reglas también están
documentadas en `pocketbase/collections.md`.

## 2. App local

```sh
cd app
copy .env.example .env
npm.cmd install
npm.cmd run dev
```

Abrí `http://localhost:5174`.

## Uso por negocio

1. El dueño crea su cuenta desde `Crear cuenta`.
2. Crea un negocio desde `Equipo`.
3. El empleado crea su cuenta y el dueño lo agrega usando su ID de PocketBase.
4. Cargan stock, venden y revisan las ventas pendientes desde el panel.

## Offline

- Productos y ventas se guardan en IndexedDB mediante Dexie.
- Las ventas pendientes viven en `outbox`.
- Los productos modificados se marcan con `dirty=1`.
- Los borrados se sincronizan como `active=false`.
- La sincronización primero sube cambios y después descarga productos.
- Cada venta, línea y movimiento usa `local_id` para evitar duplicados al reintentar.
- El PIN local permite abrir la caja sin internet después de haber iniciado
  sesión una vez. Al volver la red se solicitará iniciar sesión para subir la cola.

## Desarrollo

```sh
npm.cmd run build
```

El build ejecuta `tsc --noEmit` y genera la PWA en `dist/`.
Cada push a `main` que toque `app/` compila la app en GitHub Actions
(`.github/workflows/app.yml`).

## 3. Servir en producción

```sh
cd app
npm.cmd run build
npm.cmd run start   # escucha en $PORT (default 3000)
```

El servidor (`scripts/serve.mjs`) tiene fallback SPA solo para navegaciones,
cache inmutable para `/assets/*`, headers de seguridad y `/healthz` para el
monitor de uptime. Apuntá tu uptime monitor a `https://tu-app/healthz` y a
`https://app.zonatecno.uno/api/health`.

## 4. Seguridad: credenciales del superusuario

La clave del superusuario **nunca** va en archivos (ni en `app/.env`, que está
ignorado por git). Si alguna vez quedó guardada en disco, rotala en el panel
de PocketBase (`_/ → Settings → Superusers`) y usá solo variables temporales:

```sh
cd app
$env:PB_URL="https://app.zonatecno.uno"
$env:PB_ADMIN_EMAIL="TU_EMAIL_ADMIN"
$env:PB_ADMIN_PASSWORD="TU_PASSWORD_ADMIN"
npm.cmd run setup:pocketbase
```

## 5. Backups (programar en el VPS)

```sh
cd app
$env:PB_URL="https://app.zonatecno.uno"
$env:PB_ADMIN_EMAIL="TU_EMAIL_ADMIN"
$env:PB_ADMIN_PASSWORD="TU_PASSWORD_ADMIN"
$env:PB_BACKUP_KEEP="14"
npm.cmd run backup:pocketbase
```

Crea un `.zip` en el servidor y poda los más viejos (default: conserva 14,
`0` = no podar). Programalo diario con cron/systemd y probá restaurar en un
entorno aparte antes de confiar en el backup.

## 6. Notas de sincronización

- Los reintentos son idempotentes por `local_id` + índices únicos en servidor
  (ver `pocketbase/collections.md`). Si el setup avisa de un índice no
  aplicado, hay duplicados viejos que limpiar a mano.
- Los números de recibo (`R-000023`) son correlativos por negocio: si dos
  equipos emiten a la vez, el segundo renumera solo al sincronizar.
- La sesión se renueva sola cada 10 minutos; si vence (401), la app pide
  volver a entrar en vez de acumular errores. Las ventas pendientes nunca se
  pierden: quedan en el equipo hasta el próximo login.
