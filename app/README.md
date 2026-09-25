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
