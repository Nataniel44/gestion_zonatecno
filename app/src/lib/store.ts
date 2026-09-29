import { pb, isCloudConfigured } from './pb';
import { db, uid, type LocalProduct, type OutboxSale, type LocalTicket, type LocalCashDay } from './localdb';

export interface Org { id: string; name: string; slug: string; }
export interface Membership { org_id: string; role: string; orgs: Org; }
export interface SyncResult { synced: number; pending: number; }

const isNotFound = (e: any) =>
  e?.status === 404 || e?.response?.status === 404 || e?.data?.code === 404;

const errorText = (e: any, context = ''): string => {
  const body = e?.response?.data ?? e?.data;
  const details = body?.data;
  if (details && typeof details === 'object') {
    const fields = Object.entries(details)
      .map(([field, value]: [string, any]) => `${field}: ${value?.message ?? value?.code ?? 'valor inválido'}`)
      .join(' · ');
    if (fields) return `${context ? context + ': ' : ''}${fields}`;
  }
  return `${context ? context + ': ' : ''}${body?.message ?? e?.message ?? String(e)}`;
};

// ---- Auth (PocketBase colección users) ----
export async function signIn(email: string, password: string) {
  await pb.collection('users').authWithPassword(email, password);
}
export async function signUp(email: string, password: string, phone = '') {
  const base = { email, password, passwordConfirm: password, name: email.split('@')[0] };
  try {
    if (phone) await pb.collection('users').create({ ...base, phone });
    else await pb.collection('users').create(base);
  } catch (e: any) {
    // Si la colección users aún no tiene el campo phone, reintento sin él.
    const msg = JSON.stringify(e?.response?.data ?? e?.data ?? '');
    if (phone && /phone/i.test(msg)) await pb.collection('users').create(base);
    else throw e;
  }
  await pb.collection('users').authWithPassword(email, password);
}
export async function verifyAccountPassword(email: string, password: string) {
  if (!isCloudConfigured() || !navigator.onLine) return true;
  try {
    await pb.collection('users').authWithPassword(email, password);
    return true;
  } catch { return false; }
}

export async function signOut() { pb.authStore.clear(); }
export async function getUser() {
  if (!isCloudConfigured() || !pb.authStore.isValid) return null;
  return pb.authStore.model;
}

// Renueva la sesión al volver internet para no desloguear a la gente.
export async function refreshSession(): Promise<boolean> {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) return pb.authStore.isValid;
  try {
    await pb.collection('users').authRefresh();
    return true;
  } catch {
    return pb.authStore.isValid;
  }
}

// ---- Orgs ----
export async function myOrgs(): Promise<Membership[]> {
  const me = pb.authStore.model;
  if (!me) return [];
  const ms = await pb.collection('memberships').getFullList({ filter: `user="${me.id}"` });
  const out: Membership[] = [];
  for (const m of ms as any[]) {
    let name: string = m.org;
    try {
      const o: any = await pb.collection('orgs').getOne(m.org);
      name = o.name ?? m.org;
    } catch { /* sin permiso o borrada: uso el id */ }
    out.push({ org_id: m.org, role: m.role, orgs: { id: m.org, name, slug: '' } });
  }
  return out;
}

export interface OrgMember { id: string; name: string; email: string; role: string; }

export async function listMembers(org_id: string): Promise<OrgMember[]> {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) return [];
  const rows = await pb.collection('memberships').getFullList({
    filter: `org="${org_id}"`,
    expand: 'user',
    sort: 'created'
  });
  return (rows as any[]).map((m) => {
    const user = m.expand?.user ?? {};
    return {
      id: m.user,
      name: m.label_name || user.name || user.email || 'Usuario del equipo',
      email: m.label_email || (user.email ?? ''),
      role: m.role ?? 'vendedor'
    };
  });
}

export async function createOrg(name: string) {
  const me = pb.authStore.model;
  if (!me) throw new Error('Sin sesión');
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Date.now().toString(36);
  const org = await pb.collection('orgs').create({ name, slug, owner: me.id, members: [me.id], admins: [me.id], active: true });
  try {
    await pb.collection('memberships').create({ org: org.id, user: me.id, role: 'dueno' });
  } catch (e) {
    // No dejamos una organización huérfana si falla la membresía inicial.
    await pb.collection('orgs').delete(org.id).catch(() => undefined);
    throw new Error(`No pude terminar de crear el negocio: ${errorText(e)}`);
  }
  return org;
}

export async function addMemberById(org_id: string, user_id: string, role: string, email = '', name = '') {
  const org = await pb.collection('orgs').getOne(org_id);
  const members: string[] = (org as any).members ?? [];
  const admins: string[] = (org as any).admins ?? [];
  const nextMembers = members.includes(user_id) ? members : [...members, user_id];
  const nextAdmins = role === 'admin' && !admins.includes(user_id) ? [...admins, user_id] : admins;
  if (nextMembers.length !== members.length || nextAdmins.length !== admins.length) {
    await pb.collection('orgs').update(org_id, { members: nextMembers, admins: nextAdmins });
  }
  const details = { role, label_email: email.trim(), label_name: name.trim() };
  try {
    const membership = await pb.collection('memberships').getFirstListItem(`org="${org_id}" && user="${user_id}"`);
    await pb.collection('memberships').update(membership.id, details);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    await pb.collection('memberships').create({ org: org_id, user: user_id, ...details });
  }
}

// ---- Productos: local-first ----
const productFromCloud = (p: any, org_id: string, now: number): LocalProduct => ({
  id: p.id,
  org_id,
  name: p.name,
  price: Number(p.price),
  stock: Number(p.stock),
  min_stock: Number(p.min_stock ?? 3),
  category: p.category ?? 'general',
  barcode: p.barcode ?? '',
  updatedAt: now
});

export async function pullProducts(org_id: string) {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) {
    return db.products.where('org_id').equals(org_id).filter((p) => !p.deleted).toArray();
  }

  const rows = await pb.collection('products').getFullList({ filter: `org="${org_id}" && active=true`, sort: 'name' });
  const now = Date.now();
  return db.transaction('rw', db.products, async () => {
    // Releemos dentro de la transacción: una edición local que ocurrió durante
    // la descarga no puede quedar sobreescrita por una versión cloud vieja.
    const localRows = await db.products.where('org_id').equals(org_id).toArray();
    if (!rows.length && localRows.length) {
      // Una respuesta vacía puede ser una regla de permisos o un fallo
      // momentáneo. Nunca purguemos el stock local por eso.
      return localRows.filter((p) => !p.deleted);
    }
    const localById = new Map(localRows.map((p) => [p.id, p]));
    const remoteIds = new Set(rows.map((p: any) => p.id));
    const merged: LocalProduct[] = rows.map((p: any) => {
      const local = localById.get(p.id);
      return local?.dirty ? local : productFromCloud(p, org_id, now);
    });

    const localOnlyDirty = localRows.filter((p) => p.dirty && !remoteIds.has(p.id));
    const staleClean = localRows.filter((p) => !p.dirty && !remoteIds.has(p.id));
    // Borrado lógico: queda recuperable y no se pierde por una descarga vacía.
    if (staleClean.length) await db.products.bulkPut(staleClean.map((p) => ({ ...p, deleted: 1 })));
    const all = [...merged, ...localOnlyDirty];
    if (all.length) await db.products.bulkPut(all);
    return all.filter((p) => !p.deleted);
  });
}

async function ensureProductRemote(local: LocalProduct): Promise<string | null> {
  // Si el producto fue borrado lógicamente, mantenemos la referencia remota
  // para las ventas históricas y desactivamos el producto en PocketBase.
  if (local.deleted) {
    try {
      await pb.collection('products').update(local.id, { active: false });
      return local.id;
    } catch (e) {
      if (!isNotFound(e)) throw e;
      await db.products.delete(local.id);
      return null;
    }
  }

  // Los IDs locales son UUID; los de PocketBase son cortos. Así evitamos que
  // un 400 por "id inválido" deje un producto nuevo sin poder crear.
  if (/^[a-z0-9]{15}$/i.test(local.id)) {
    try {
      await pb.collection('products').update(local.id, {
        org: local.org_id, name: local.name, price: local.price, stock: local.stock,
        min_stock: local.min_stock, category: local.category, barcode: local.barcode ?? '', active: true,
        local_id: local.id
      });
      return local.id;
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  // Si se perdió la respuesta de un create anterior, este filtro recupera
  // el producto remoto en vez de crear otro.
  let created: any = null;
  try {
    created = await pb.collection('products').getFirstListItem(`org="${local.org_id}" && local_id="${local.id}"`);
  } catch (existingError) {
    if (!isNotFound(existingError)) throw existingError;
    created = await pb.collection('products').create({
      org: local.org_id, name: local.name || '(sin nombre)', price: local.price, stock: local.stock,
      min_stock: local.min_stock, category: local.category, barcode: local.barcode ?? '', active: true, local_id: local.id
    });
  }

  // Reconciliamos el ID local con el ID de PocketBase sin perder una edición
  // que haya ocurrido mientras esperábamos la respuesta del servidor.
  await db.transaction('rw', db.products, async () => {
    const latest = await db.products.get(local.id);
    await db.products.delete(local.id);
    if (latest) {
      const changedWhileUploading = latest.updatedAt > local.updatedAt;
      await db.products.put({
        ...latest,
        id: created.id,
        dirty: changedWhileUploading ? 1 : 0,
        lastError: changedWhileUploading ? latest.lastError : '',
        updatedAt: Date.now()
      });
    }
  });
  return created.id;
}

const productSyncLocks = new Map<string, Promise<Map<string, string>>>();

/** Sube productos locales y devuelve el mapa idLocal -> idPocketBase. */
export async function pushDirtyProducts(org_id: string): Promise<Map<string, string>> {
  const previous = productSyncLocks.get(org_id) ?? Promise.resolve(new Map<string, string>());
  const current = previous.catch(() => new Map<string, string>()).then(() => pushDirtyProductsNow(org_id));
  productSyncLocks.set(org_id, current);
  try {
    return await current;
  } finally {
    if (productSyncLocks.get(org_id) === current) productSyncLocks.delete(org_id);
  }
}

async function pushDirtyProductsNow(org_id: string): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) return idMap;
  const dirties = await db.products.where('org_id').equals(org_id).filter((x) => x.dirty === 1).toArray();
  for (const candidate of dirties) {
    const local = await db.products.get(candidate.id);
    if (!local || local.dirty !== 1) continue;
    const remoteId = await ensureProductRemote(local);
    if (remoteId) idMap.set(local.id, remoteId);
    const after = await db.products.get(local.id);
    if (remoteId === local.id && after?.dirty === 1 && after.updatedAt === local.updatedAt) {
      await db.products.update(local.id, { dirty: 0, lastError: '' });
    }
  }
  return idMap;
}

export async function saveProductLocal(p: LocalProduct) {
  p.dirty = 1; p.deleted = 0; p.updatedAt = Date.now();
  await db.products.put(p);
  // Si hay red, intentamos subir; si falla, queda dirty y se reintenta después.
  if (navigator.onLine && isCloudConfigured() && pb.authStore.isValid) {
    try {
      await pushDirtyProducts(p.org_id);
    } catch (e) {
      const current = await db.products.get(p.id);
      if (current) await db.products.update(p.id, { lastError: errorText(e) });
    }
  }
}

export async function deleteProductLocal(id: string) {
  const p = await db.products.get(id);
  if (!p) return;
  p.deleted = 1;
  p.dirty = 1;
  p.updatedAt = Date.now();
  await db.products.put(p);
  if (navigator.onLine && isCloudConfigured() && pb.authStore.isValid) {
    try {
      await pushDirtyProducts(p.org_id);
    } catch (e) {
      const current = await db.products.get(id);
      if (current) await db.products.update(id, { lastError: errorText(e) });
    }
  }
}

export function newLocalProduct(org_id: string): LocalProduct {
  return { id: uid(), org_id, name: '', price: 0, stock: 0, min_stock: 3, category: 'general', dirty: 1, deleted: 0, updatedAt: Date.now() };
}

// ---- Ventas offline ----
export async function createSaleOffline(org_id: string, items: OutboxSale['items'], pay_method: string) {
  const normalized = new Map<string, OutboxSale['items'][number]>();
  for (const item of items) {
    if (!Number.isInteger(item.qty) || item.qty <= 0) throw new Error('Cantidad inválida');
    const previous = normalized.get(item.product_id);
    normalized.set(item.product_id, previous
      ? { ...previous, qty: previous.qty + item.qty }
      : { ...item });
  }
  const lines = [...normalized.values()];
  const total = lines.reduce((a, i) => a + i.price * i.qty, 0);
  const sale: OutboxSale = { id: uid(), org_id, total, pay_method, items: lines, createdAt: Date.now() };

  await db.transaction('rw', db.products, db.outbox, async () => {
    // Validamos todo antes de descontar para no dejar una venta a medias.
    for (const item of lines) {
      const p = await db.products.get(item.product_id);
      if (!p) throw new Error('Producto no encontrado');
      if (p.stock < item.qty) throw new Error(`Stock insuficiente de ${p.name}`);
    }
    for (const item of lines) {
      const p = await db.products.get(item.product_id);
      if (!p) throw new Error('Producto no encontrado');
      await db.products.update(p.id, { stock: p.stock - item.qty, dirty: 1, updatedAt: Date.now() });
    }
    await db.outbox.add(sale);
  });

  void syncOutbox(org_id).catch(() => undefined);
  return sale;
}

const syncLocks = new Map<string, Promise<SyncResult>>();

export async function syncOutbox(org_id: string): Promise<SyncResult> {
  const previous = syncLocks.get(org_id) ?? Promise.resolve({ synced: 0, pending: 0 });
  const current = previous
    .catch(() => ({ synced: 0, pending: 0 }))
    .then(() => syncOutboxNow(org_id));
  syncLocks.set(org_id, current);
  try {
    return await current;
  } finally {
    if (syncLocks.get(org_id) === current) syncLocks.delete(org_id);
  }
}

async function syncOutboxNow(org_id: string): Promise<SyncResult> {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) {
    return { synced: 0, pending: await db.outbox.where('org_id').equals(org_id).count() };
  }

  // Primero subimos productos: así los IDs locales quedan reconciliados antes
  // de crear los sale_items que los referencian.
  let productMap: Map<string, string>;
  try {
    productMap = await pushDirtyProducts(org_id);
  } catch (e: any) {
    const rawError = errorText(e);
    const pending = await db.outbox.where('org_id').equals(org_id).toArray();
    for (const sale of pending) {
      sale.lastError = rawError;
      await db.outbox.put(sale);
    }
    return { synced: 0, pending: pending.length };
  }
  const pend = await db.outbox.where('org_id').equals(org_id).sortBy('createdAt');
  const me = pb.authStore.model;
  let ok = 0;

  for (const s of pend) {
    let stage = 'venta';
    try {
      // Actualiza referencias de productos que recién fueron creados en cloud.
      for (const item of s.items) {
        const remoteId = productMap.get(item.product_id);
        if (remoteId) {
          item.product_id = remoteId;
          await db.outbox.put(s);
        } else {
          const local = await db.products.get(item.product_id);
          if (local && !local.deleted) {
            try {
              const ensured = await ensureProductRemote(local);
              if (ensured) { item.product_id = ensured; await db.outbox.put(s); }
            } catch {
              // Un producto problemático no debe bloquear la venta entera.
              item.product_id = '';
              await db.outbox.put(s);
            }
          }
        }
      }

      stage = 'venta';
      let sale: any = null;
      try {
        sale = await pb.collection('sales').getFirstListItem(`org="${org_id}" && local_id="${s.id}"`);
      } catch (e) {
        if (!isNotFound(e)) throw e;
        sale = await pb.collection('sales').create({
          org: org_id, total: s.total, pay_method: s.pay_method, channel: 'local',
          created_by: me?.id ?? '', local_id: s.id,
          occurred_at: new Date(s.createdAt).toISOString()
        });
      }

      for (let index = 0; index < s.items.length; index++) {
        stage = 'línea de venta';
        const item = s.items[index];
        const itemLocalId = `${s.id}:${index}`;
        let existingItem: any = null;
        try {
          existingItem = await pb.collection('sale_items').getFirstListItem(`sale="${sale.id}" && local_id="${itemLocalId}"`);
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
        if (!existingItem) {
          await pb.collection('sale_items').create({
            sale: sale.id, product: item.product_id || null, name: item.name,
            qty: item.qty, price: item.price, local_id: itemLocalId
          });
        }

        stage = 'movimiento de stock';
        let existingMove: any = null;
        try {
          existingMove = await pb.collection('stock_moves').getFirstListItem(`org="${org_id}" && local_id="${itemLocalId}"`);
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
        if (!existingMove) {
          await pb.collection('stock_moves').create({
            org: org_id, product: item.product_id || null, qty: -item.qty,
            reason: 'venta', ref: sale.id, local_id: itemLocalId
          });
        }
      }

      await db.outbox.delete(s.id);
      ok++;
    } catch (e: any) {
      s.attempts = (s.attempts ?? 0) + 1;
      const rawError = errorText(e, stage);
      s.lastError = /local_id|occurred_at|unknown field|field.*not found/i.test(String(rawError))
        ? `${rawError}. El servidor necesita el esquema nuevo: ejecutá setup:pocketbase en el VPS.`
        : String(rawError);
      await db.outbox.put(s);
    }
  }
  await pushTickets(org_id);
  await pushCashDays(org_id);
  return { synced: ok, pending: await db.outbox.where('org_id').equals(org_id).count() };
}

export async function salesHistoryCloud(org_id: string, limit = 50) {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) return [];
  try {
    const rows = await pb.collection('sales').getList(1, limit, { filter: `org="${org_id}"`, sort: '-created' });
    return rows.items.map((h: any) => ({
      id: h.id, total: h.total, pay_method: h.pay_method,
      created_at: h.occurred_at ?? h.created ?? h.updated ?? h.id
    }));
  } catch { return []; }
}

// ---- Tickets de taller ----
export const TICKET_STATUSES: LocalTicket['status'][] = ['recibido', 'revisado', 'reparando', 'listo', 'entregado'];

export async function pullTickets(org_id: string) {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) {
    return db.tickets.where('org_id').equals(org_id).reverse().sortBy('createdAt');
  }
  try {
    const rows = await pb.collection('tickets').getFullList({ filter: `org="${org_id}"`, sort: '-created' });
    const local = rows.map((t: any) => ({
      id: t.id, org_id, code: t.code, client_name: t.client_name ?? '', phone: t.phone ?? '',
      device: t.device ?? '', problem: t.problem ?? '', status: (t.status ?? 'recibido') as LocalTicket['status'],
      price: Number(t.price ?? 0), local_id: t.local_id ?? t.id, dirty: 0, createdAt: new Date(t.created ?? Date.now()).getTime(), updatedAt: Date.now()
    }));
    await db.tickets.bulkPut(local);
    return db.tickets.where('org_id').equals(org_id).reverse().sortBy('createdAt');
  } catch { return db.tickets.where('org_id').equals(org_id).reverse().sortBy('createdAt'); }
}

export async function createTicket(org_id: string, data: Omit<LocalTicket, 'id' | 'org_id' | 'code' | 'local_id' | 'createdAt' | 'updatedAt'>) {
  const ticket: LocalTicket = { ...data, id: uid(), org_id, code: `ZT-${Date.now().toString(36).toUpperCase().slice(-5)}`, local_id: uid(), createdAt: Date.now(), updatedAt: Date.now(), dirty: 1 };
  await db.tickets.add(ticket);
  void pushTickets(org_id).catch(() => undefined);
  return ticket;
}

export async function updateTicketStatus(org_id: string, id: string, status: LocalTicket['status']) {
  const ticket = await db.tickets.get(id);
  if (!ticket) return;
  await db.tickets.update(id, { status, dirty: 1, updatedAt: Date.now() });
  void pushTickets(org_id).catch(() => undefined);
}

export async function pushTickets(org_id: string) {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) return;
  const rows = await db.tickets.where('org_id').equals(org_id).filter((t) => t.dirty === 1).toArray();
  for (const t of rows) {
    try {
      let remote: any = null;
      try { remote = await pb.collection('tickets').getFirstListItem(`org="${org_id}" && local_id="${t.local_id}"`); }
      catch (e) { if (!isNotFound(e)) throw e; }
      const payload = { org: org_id, code: t.code, client_name: t.client_name, phone: t.phone, device: t.device, problem: t.problem, status: t.status, price: t.price, local_id: t.local_id };
      if (remote) await pb.collection('tickets').update(remote.id, payload);
      else await pb.collection('tickets').create(payload);
      await db.tickets.update(t.id, { dirty: 0, lastError: '' });
    } catch (e) { await db.tickets.update(t.id, { lastError: errorText(e, 'ticket') }); }
  }
}

// ---- Caja diaria ----
export async function getCashDay(org_id: string, day = new Date().toISOString().slice(0, 10)) {
  return db.cashDays.where('org_id').equals(org_id).and((c) => c.day === day).first();
}
export async function openCashDay(org_id: string, open_amount: number) {
  const day = new Date().toISOString().slice(0, 10);
  const existing = await getCashDay(org_id, day);
  if (existing && !existing.closed_at) return existing;
  const cash: LocalCashDay = { id: uid(), org_id, day, open_amount, opened_at: Date.now(), updatedAt: Date.now(), dirty: 1 };
  await db.cashDays.put(cash);
  void pushCashDays(org_id).catch(() => undefined);
  return cash;
}
export async function closeCashDay(org_id: string, id: string, close_amount: number, expected_cash: number, note = '') {
  await db.cashDays.update(id, { closed_at: Date.now(), close_amount, expected_cash, difference: close_amount - expected_cash, note, dirty: 1, updatedAt: Date.now() });
  void pushCashDays(org_id).catch(() => undefined);
}
export async function pushCashDays(org_id: string) {
  if (!isCloudConfigured() || !navigator.onLine || !pb.authStore.isValid) return;
  const rows = await db.cashDays.where('org_id').equals(org_id).filter((c) => c.dirty === 1).toArray();
  for (const c of rows) {
    try {
      const payload = { org: org_id, day: c.day, open_amount: c.open_amount, opened_at: new Date(c.opened_at).toISOString(), closed_at: c.closed_at ? new Date(c.closed_at).toISOString() : '', close_amount: c.close_amount ?? 0, expected_cash: c.expected_cash ?? 0, difference: c.difference ?? 0, note: c.note ?? '', local_id: c.id };
      let remote: any = null;
      try { remote = await pb.collection('cash_days').getFirstListItem(`org="${org_id}" && day="${c.day}"`); }
      catch (e) { if (!isNotFound(e)) throw e; }
      if (remote) await pb.collection('cash_days').update(remote.id, payload);
      else await pb.collection('cash_days').create(payload);
      await db.cashDays.update(c.id, { dirty: 0, lastError: '' });
    } catch (e) { await db.cashDays.update(c.id, { lastError: errorText(e, 'caja') }); }
  }
}

// ---- PIN offline (caja sin internet) ----
export async function hashPin(email: string, pin: string) {
  const data = new TextEncoder().encode('zt-pin|' + email.toLowerCase().trim() + '|' + pin.trim());
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface LocalSession { uid: string; email: string; org: string; }

export function setLocalSession(s: LocalSession | null) {
  if (!s) localStorage.removeItem('zt_session');
  else localStorage.setItem('zt_session', JSON.stringify(s));
}

export function getLocalSession(): LocalSession | null {
  try { return JSON.parse(localStorage.getItem('zt_session') || 'null'); } catch { return null; }
}
