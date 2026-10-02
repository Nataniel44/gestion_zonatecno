#!/usr/bin/env node
import PocketBase from 'pocketbase';

const url = (process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const email = process.env.PB_ADMIN_EMAIL;
const password = process.env.PB_ADMIN_PASSWORD;
const ORG = 'org.owner = @request.auth.id || org.members.id ?= @request.auth.id';
const ADMIN = 'org.owner = @request.auth.id || org.admins.id ?= @request.auth.id';
const SALE = 'sale.org.owner = @request.auth.id || sale.org.members.id ?= @request.auth.id';
const SALE_ADMIN = 'sale.org.owner = @request.auth.id || sale.org.admins.id ?= @request.auth.id';
const R = {
  orgs: {
    listRule: 'owner = @request.auth.id || members.id ?= @request.auth.id',
    viewRule: 'owner = @request.auth.id || members.id ?= @request.auth.id',
    createRule: '@request.body.owner = @request.auth.id',
    updateRule: 'owner = @request.auth.id',
    deleteRule: 'owner = @request.auth.id',
  },
  memberships: {
    listRule: 'user = @request.auth.id || org.owner = @request.auth.id || org.admins.id ?= @request.auth.id',
    viewRule: 'user = @request.auth.id || org.owner = @request.auth.id || org.admins.id ?= @request.auth.id',
    createRule: 'org.owner = @request.auth.id',
    updateRule: 'org.owner = @request.auth.id',
    deleteRule: 'org.owner = @request.auth.id',
  },
  products: { listRule: ORG, viewRule: ORG, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN },
  clients: { listRule: ORG, viewRule: ORG, createRule: ORG, updateRule: ORG, deleteRule: ADMIN },
  sales: { listRule: ORG, viewRule: ORG, createRule: ORG, updateRule: ADMIN, deleteRule: ADMIN },
  sale_items: { listRule: SALE, viewRule: SALE, createRule: SALE, updateRule: SALE_ADMIN, deleteRule: SALE_ADMIN },
  stock_moves: { listRule: ORG, viewRule: ORG, createRule: ORG, updateRule: ADMIN, deleteRule: ADMIN },
  tickets: { listRule: ORG, viewRule: ORG, createRule: ORG, updateRule: ORG, deleteRule: ADMIN },
  cash_days: { listRule: ORG, viewRule: ORG, createRule: ORG, updateRule: ADMIN, deleteRule: ADMIN },
  business_profiles: { listRule: ORG, viewRule: ORG, createRule: ORG, updateRule: ORG, deleteRule: ADMIN },
  receipts: { listRule: ORG, viewRule: ORG, createRule: ORG, updateRule: ORG, deleteRule: ADMIN },
};
// Índices únicos: impiden duplicados cuando se reintenta una subida offline.
// Se aplican como "no fatal": si hay duplicados viejos, el script avisa y sigue.
const IDX = {
  memberships: ['CREATE UNIQUE INDEX idx_memberships_org_user ON memberships (org, user)'],
  products: ['CREATE UNIQUE INDEX idx_products_org_local ON products (org, local_id)'],
  sales: ['CREATE UNIQUE INDEX idx_sales_org_local ON sales (org, local_id)'],
  sale_items: ['CREATE UNIQUE INDEX idx_sale_items_sale_local ON sale_items (sale, local_id)'],
  stock_moves: ['CREATE UNIQUE INDEX idx_stock_moves_org_local ON stock_moves (org, local_id)'],
  tickets: ['CREATE UNIQUE INDEX idx_tickets_org_local ON tickets (org, local_id)'],
  cash_days: [
    'CREATE UNIQUE INDEX idx_cash_days_org_day ON cash_days (org, day)',
    'CREATE UNIQUE INDEX idx_cash_days_org_local ON cash_days (org, local_id)',
  ],
  business_profiles: ['CREATE UNIQUE INDEX idx_profiles_org ON business_profiles (org)'],
  receipts: [
    'CREATE UNIQUE INDEX idx_receipts_org_number ON receipts (org, number)',
    'CREATE UNIQUE INDEX idx_receipts_org_local ON receipts (org, local_id)',
  ],
};
const T = (name, required = false) => ({ name, type: 'text', required });
const N = (name) => ({ name, type: 'number' });const B = (name) => ({ name, type: 'bool' });
const S = (name, values) => ({ name, type: 'select', values, maxSelect: 1 });
const J = (name) => ({ name, type: 'json' });
const Rel = (name, collectionId, required = false, extra = {}) => ({ name, type: 'relation', collectionId, required, ...extra });

if (!email || !password) {
  console.error('Faltan PB_ADMIN_EMAIL y PB_ADMIN_PASSWORD.');
  console.error('Uso PowerShell:');
  console.error('  $env:PB_URL="https://app.zonatecno.uno"');
  console.error('  $env:PB_ADMIN_EMAIL="TU_EMAIL_ADMIN"');
  console.error('  $env:PB_ADMIN_PASSWORD="TU_PASSWORD_ADMIN"');
  console.error('  npm run setup:pocketbase');
  process.exit(1);
}

const pb = new PocketBase(url);
pb.autoCancellation(false);
const log = (m) => console.log(`[ZT setup] ${m}`);

function* defs(ids) {
  // Las relaciones se generan en orden para que una instalación limpia pueda
  // resolver el ID de cada colección antes de crear la siguiente.
  yield { name: 'orgs', type: 'base', fields: [T('name', true), T('slug'), Rel('owner', ids.users, false, { maxSelect: 1 }), Rel('members', ids.users), Rel('admins', ids.users), T('plan'), B('active')] };
  yield { name: 'memberships', type: 'base', fields: [Rel('org', ids.orgs, true, { maxSelect: 1, cascadeDelete: true }), Rel('user', ids.users, true, { maxSelect: 1 }), S('role', ['dueno', 'admin', 'vendedor']), T('label_name'), T('label_email')] };
  yield { name: 'products', type: 'base', fields: [Rel('org', ids.orgs, true, { maxSelect: 1 }), T('name', true), N('price'), N('stock'), N('min_stock'), T('category'), T('barcode'), B('active'), T('local_id')] };
  yield { name: 'clients', type: 'base', fields: [Rel('org', ids.orgs, true, { maxSelect: 1 }), T('name', true), T('phone'), T('note')] };
  yield { name: 'sales', type: 'base', fields: [Rel('org', ids.orgs, true, { maxSelect: 1 }), N('total'), T('pay_method'), T('channel'), T('created_by'), T('local_id'), T('occurred_at')] };
  yield { name: 'sale_items', type: 'base', fields: [Rel('sale', ids.sales, true, { maxSelect: 1, cascadeDelete: true }), Rel('product', ids.products, false, { maxSelect: 1 }), T('name'), N('qty'), N('price'), T('local_id')] };
  yield { name: 'stock_moves', type: 'base', fields: [Rel('org', ids.orgs, false, { maxSelect: 1 }), Rel('product', ids.products, false, { maxSelect: 1 }), N('qty'), T('reason'), T('ref'), T('local_id')] };
  yield { name: 'tickets', type: 'base', fields: [Rel('org', ids.orgs, false, { maxSelect: 1 }), T('code'), T('client_name'), T('phone'), T('device'), T('problem'), S('status', ['recibido', 'revisado', 'reparando', 'listo', 'entregado']), N('price'), T('local_id')] };
  yield { name: 'cash_days', type: 'base', fields: [Rel('org', ids.orgs, true, { maxSelect: 1, cascadeDelete: true }), T('day'), N('open_amount'), T('opened_at'), T('closed_at'), N('close_amount'), N('expected_cash'), N('difference'), T('note'), T('local_id')] };
  yield { name: 'business_profiles', type: 'base', fields: [Rel('org', ids.orgs, true, { maxSelect: 1, cascadeDelete: true }), T('name'), T('address'), T('phone'), T('cuit'), T('footer'), T('prefix'), N('next_number'), T('warranty_text')] };
  yield { name: 'receipts', type: 'base', fields: [Rel('org', ids.orgs, true, { maxSelect: 1, cascadeDelete: true }), T('number'), N('seq'), T('title'), T('issued_at'), T('client_name'), T('client_phone'), T('client_doc'), T('device'), T('device_detail'), T('problem'), J('items'), T('items_json'), N('discount'), N('subtotal'), N('total'), T('pay_method'), N('received'), N('change'), T('status'), T('notes'), T('warranty_text'), T('seller'), T('biz_name'), T('biz_address'), T('biz_phone'), T('biz_cuit'), T('biz_footer'), T('local_id')] };
}

try {
  log(`Conectando a ${url}…`);
  await pb.collection('_superusers').authWithPassword(email, password);
  const existing = await pb.collections.getFullList();
  const ids = Object.fromEntries(existing.map((c) => [c.name, c.id]));
  if (!ids.users) throw new Error('No existe la colección auth users.');

  const users = await pb.collections.getOne(ids.users);
  if (!(users.fields || []).some((f) => f.name === 'phone')) {
    log('Agregando phone a users…');
    await pb.collections.update(ids.users, { fields: [...(users.fields || []), { name: 'phone', type: 'text' }] });
  }

  for (const def of defs(ids)) {
    const rules = R[def.name];
    if (ids[def.name]) {
      log(`Reparando ${def.name}…`);
      await pb.collections.update(ids[def.name], rules);
      const current = await pb.collections.getOne(ids[def.name]);
      const names = new Set((current.fields || []).map((f) => f.name));
      const missing = def.fields.filter((f) => !names.has(f.name));
      if (missing.length) await pb.collections.update(ids[def.name], { fields: [...(current.fields || []), ...missing] });
    } else {
      log(`Creando ${def.name}…`);
      const created = await pb.collections.create({ ...def, ...rules });
      ids[def.name] = created.id;
    }
    // Índices únicos (no fatal: avisa si hay duplicados viejos que limpiar).
    const wantIdx = IDX[def.name] ?? [];
    if (wantIdx.length) {
      try {
        const col = await pb.collections.getOne(ids[def.name]);
        const missingIdx = wantIdx.filter((i) => !(col.indexes ?? []).includes(i));
        if (missingIdx.length) {
          await pb.collections.update(ids[def.name], { indexes: [...(col.indexes ?? []), ...missingIdx] });
          log(`Índices de ${def.name}: ${missingIdx.length} agregados.`);
        }
      } catch (e) {
        log(`Índices de ${def.name} NO aplicados: ${e?.response?.data?.message || e?.message}. Limpiá duplicados y reintentá.`);
      }
    }
  }
  log('Listo. Las reglas y campos de ZT Gestión quedaron protegidos.');
} catch (e) {
  console.error('[ZT setup] Error:', e?.response?.data?.message || e?.message || e);
  process.exitCode = 1;
}
