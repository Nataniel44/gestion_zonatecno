-- =============================================================
-- ZT Gestión — Esquema multiempresa (Supabase / Postgres)
--
-- ARCHIVO LEGADO / NO USADO POR LA APP ACTUAL.
-- La implementación activa usa PocketBase (ver ../pocketbase/collections.md).
-- No ejecutes este archivo en producción sin revisar sus políticas RLS.
-- =============================================================

-- 1. Negocios
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'base',
  active boolean not null default true,
  created_at timestamptz default now()
);

-- 2. Membresías (usuarios por negocio con rol)
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'vendedor' check (role in ('dueno','admin','vendedor')),
  created_at timestamptz default now(),
  unique(org_id, user_id)
);

-- 3. Productos por negocio
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  sku text,
  category text default 'general',
  price numeric not null default 0,
  cost numeric not null default 0,
  stock integer not null default 0,
  min_stock integer not null default 3,
  active boolean not null default true,
  updated_at timestamptz default now()
);
create index if not exists idx_products_org on products(org_id);

-- 4. Clientes por negocio
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  phone text,
  note text,
  created_at timestamptz default now()
);

-- 5. Ventas
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  total numeric not null default 0,
  pay_method text default 'efectivo',
  channel text default 'local',
  synced_from text default 'cloud',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
create index if not exists idx_sales_org_date on sales(org_id, created_at desc);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  qty integer not null default 1,
  price numeric not null default 0
);

-- 6. Movimientos de stock (auditoría)
create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  qty integer not null,
  reason text not null default 'venta',
  ref_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 7. Taller / tickets
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null,
  client_name text not null,
  phone text,
  device text not null,
  problem text,
  status text not null default 'recibido' check (status in ('recibido','revisado','reparando','listo','entregado')),
  price numeric default 0,
  created_at timestamptz default now(),
  unique(org_id, code)
);

-- 8. Caja diaria
create table if not exists cash_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  day date not null default current_date,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  open_amount numeric default 0,
  close_amount numeric,
  note text,
  unique(org_id, day)
);

-- ================= RLS =================
alter table orgs enable row level security;
alter table memberships enable row level security;
alter table products enable row level security;
alter table clients enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table stock_moves enable row level security;
alter table tickets enable row level security;
alter table cash_days enable row level security;

-- Helper: ¿pertenece el usuario a la org?
create or replace function is_member(o uuid)
returns boolean language sql stable as $$
  select exists (select 1 from memberships m where m.org_id = o and m.user_id = auth.uid());
$$;

-- Helper: rol del usuario en la org
create or replace function my_role(o uuid)
returns text language sql stable as $$
  select m.role from memberships m where m.org_id = o and m.user_id = auth.uid() limit 1;
$$;

-- Políticas: lectura/escritura solo para miembros. Ventas y productos: vendedor puede crear/leer, solo admin/dueno borra.
drop policy if exists p_orgs_member on orgs;
create policy p_orgs_member on orgs for all using (is_member(id));

drop policy if exists p_memb_read on memberships;
create policy p_memb_read on memberships for select using (is_member(org_id));
drop policy if exists p_memb_admin on memberships;
create policy p_memb_admin on memberships for all using (my_role(org_id) in ('dueno','admin')) with check (my_role(org_id) in ('dueno','admin'));

drop policy if exists p_products on products;
create policy p_products on products for all using (is_member(org_id)) with check (is_member(org_id));

drop policy if exists p_clients on clients;
create policy p_clients on clients for all using (is_member(org_id)) with check (is_member(org_id));

drop policy if exists p_sales on sales;
create policy p_sales on sales for all using (is_member(org_id)) with check (is_member(org_id));

drop policy if exists p_items on sale_items;
create policy p_items on sale_items for select using (
  exists (select 1 from sales s where s.id = sale_id and is_member(s.org_id))
);
drop policy if exists p_items_ins on sale_items;
create policy p_items_ins on sale_items for insert with check (
  exists (select 1 from sales s where s.id = sale_id and is_member(s.org_id))
);

drop policy if exists p_moves on stock_moves;
create policy p_moves on stock_moves for all using (is_member(org_id)) with check (is_member(org_id));

drop policy if exists p_tickets on tickets;
create policy p_tickets on tickets for all using (is_member(org_id)) with check (is_member(org_id));

drop policy if exists p_cash on cash_days;
create policy p_cash on cash_days for all using (is_member(org_id)) with check (is_member(org_id));
