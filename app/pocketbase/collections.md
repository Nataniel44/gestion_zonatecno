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

## 10. business_profiles (base) — datos del local para el recibo

- `org`: relation → `orgs`, required, cascade delete
- `name`: text — nombre del local (se imprime grande)
- `address`, `phone`, `cuit`: text
- `footer`: text — mensaje al pie (gracias, horarios, etc.)
- `prefix`: text — ej `R`
- `next_number`: number — próximo número correlativo
- `warranty_text`: text — garantía por defecto

## 11. receipts (base) — recibos universales de cualquier rubro

- `org`: relation → `orgs`, required, cascade delete
- `number`: text — ej `R-000023` · `seq`: number
- `title`: text — Recibo / Presupuesto / Orden de reparación / Nota de venta / Seña
- `issued_at`: text — fecha de emisión
- `client_name`, `client_phone`, `client_doc`: text
- `device`, `device_detail` (IMEI/serie/color), `problem`: text — opcional taller/celulares
- `items`: json + `items_json`: text — conceptos `[{desc, qty, price}]`
- `discount`, `subtotal`, `total`, `received`, `change`: number
- `pay_method`: text · `status`: text (`pagado`/`seña`/`pendiente`)
- `notes`, `warranty_text`, `seller`: text
- `biz_name`, `biz_address`, `biz_phone`, `biz_cuit`, `biz_footer`: text — foto del negocio al emitir
- `local_id`: text — idempotencia offline

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

## Índices únicos (idempotencia)

El script `setup:pocketbase` crea estos índices además de las reglas:

- `memberships`: único `(org, user)` — una membresía por persona y negocio.
- `products`, `sales`, `stock_moves`, `tickets`: único `(org, local_id)`.
- `sale_items`: único `(sale, local_id)`.
- `cash_days`: único `(org, day)` y `(org, local_id)`.
- `business_profiles`: único `(org)`.
- `receipts`: único `(org, number)` y `(org, local_id)`.

Si el script avisa que un índice no se aplicó, hay duplicados viejos que limpiar
a mano antes de reintentar. Nunca borres un índice en producción sin reemplazo:
los reintentos offline volverían a duplicar ventas o recibos.
