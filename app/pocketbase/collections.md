# PocketBase — colecciones de ZT Gestión

> No copies esta archivo en la app web. La configuración se ejecuta una sola vez
> desde el servidor con `npm run setup:pocketbase`.

## Reglas de seguridad

El filtro por `org` que hace la app es solamente de interfaz. PocketBase debe
aplicar estas reglas en el servidor:

- `orgs`: dueño o miembro puede leer; solo el dueño modifica o elimina.
- `memberships`: cada usuario ve su membresía; solo el dueño administra el equipo.
- `products`, `clients`, `sales`, `stock_moves` y `tickets`: acceso únicamente
  a registros cuyo `org` tiene al usuario como dueño o miembro.
- `sale_items`: acceso únicamente si la venta pertenece a una organización permitida.
- Los vendedores pueden consultar stock y crear ventas.
- Solo dueños y administradores pueden crear, editar o eliminar productos.
- Para crear una organización, `owner` debe ser el usuario autenticado.

## 1. orgs (base)

- `name`: text, required
- `slug`: text
- `owner`: relation → `users`, single
- `members`: relation → `users`, multiple
- `admins`: relation → `users`, multiple
- `plan`: text
- `active`: bool

## 2. memberships (base)

- `org`: relation → `orgs`, required, cascade delete
- `user`: relation → `users`, required
- `role`: select → `dueno`, `admin`, `vendedor`
- `label_name`: text — nombre visible para el dueño
- `label_email`: text — email visible para el dueño

## 3. products (base)

- `org`: relation → `orgs`, required
- `name`: text, required
- `price`: number, default 0
- `stock`: number, default 0
- `min_stock`: number, default 3
- `category`: text, default `general`
- `active`: bool, default true
- `barcode`: text — código de barras para lector
- `local_id`: text — evita duplicar un producto creado offline

## 4. clients (base)

- `org`: relation → `orgs`, required
- `name`: text, required
- `phone`: text
- `note`: text

## 5. sales (base)

- `org`: relation → `orgs`, required
- `total`: number
- `pay_method`: text
- `channel`: text
- `created_by`: text
- `local_id`: text — clave idempotente de la venta offline
- `occurred_at`: text — fecha original de la venta

## 6. sale_items (base)

- `sale`: relation → `sales`, required, cascade delete
- `product`: relation → `products`, opcional
- `name`: text
- `qty`: number
- `price`: number
- `local_id`: text — evita duplicar líneas al reintentar

## 7. stock_moves (base)

- `org`: relation → `orgs`
- `product`: relation → `products`, opcional
- `qty`: number
- `reason`: text
- `ref`: text
- `local_id`: text — evita duplicar movimientos al reintentar

## 8. tickets (base)

- `org`: relation → `orgs`
- `code`, `client_name`, `phone`, `device`, `problem`: text
- `status`: select → `recibido`, `revisado`, `reparando`, `listo`, `entregado`
- `price`: number
- `local_id`: text — evita duplicar tickets

## 9. cash_days (base)

- `org`: relation → `orgs`, required
- `day`: text — día `YYYY-MM-DD`
- `open_amount`: number
- `opened_at`: text
- `closed_at`: text
- `close_amount`: number
- `expected_cash`: number
- `difference`: number
- `note`: text
- `local_id`: text

## users

- `name`: text
- `phone`: text
- En Options → desactiva `Require email verification` si querés permitir el
  registro inmediato.

## Importante

`products`, `sales` y `stock_moves` se consultan siempre con filtro de `org`,
pero ese filtro no reemplaza las API rules. Si las reglas quedan abiertas
(`@request.auth.id != ''`), cualquier usuario autenticado podría consultar datos
de otro negocio.
