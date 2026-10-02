import Dexie, { type Table } from 'dexie';

export interface LocalProduct {
  id: string;
  org_id: string;
  name: string;
  price: number;
  stock: number;
  min_stock: number;
  category: string;
  barcode?: string;
  dirty?: number; // 1 = pendiente de subir
  deleted?: number; // 1 = borrado lógicamente en la nube
  lastError?: string; // último error al intentar subir este producto
  updatedAt: number;
}

export interface OutboxSale {
  id: string; // id local/idempotencia
  org_id: string;
  total: number;
  pay_method: string;
  items: { product_id: string; name: string; qty: number; price: number }[];
  createdAt: number;
  synced?: number;
  lastError?: string;
  attempts?: number;
}

export interface LocalTicket {
  id: string;
  org_id: string;
  code: string;
  client_name: string;
  phone: string;
  device: string;
  problem: string;
  status: 'recibido' | 'revisado' | 'reparando' | 'listo' | 'entregado';
  price: number;
  local_id: string;
  dirty?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LocalCashDay {
  id: string;
  org_id: string;
  day: string;
  open_amount: number;
  opened_at: number;
  closed_at?: number;
  close_amount?: number;
  expected_cash?: number;
  difference?: number;
  note?: string;
  dirty?: number;
  lastError?: string;
  updatedAt: number;
}

export interface LocalPin {
  userId: string;
  email: string;
  org_id: string;
  pinHash: string;
  updatedAt: number;
}

export interface ReceiptItem {
  desc: string;
  qty: number;
  price: number;
}

export interface LocalReceipt {
  id: string;
  org_id: string;
  number: string; // ej: R-000023
  seq: number;
  title: string; // Recibo | Presupuesto | Orden de reparación | etc.
  createdAt: number;
  updatedAt: number;
  client_name: string;
  client_phone: string;
  client_doc: string;
  // Bloque opcional taller / cualquier rubro
  device: string;
  device_detail: string;
  problem: string;
  items: ReceiptItem[];
  discount: number;
  subtotal: number;
  total: number;
  pay_method: string;
  received: number;
  change: number;
  status: 'pagado' | 'seña' | 'pendiente';
  notes: string;
  warranty_text: string;
  seller: string;
  // Foto del negocio al momento de emitir (para imprimir aunque cambie después)
  biz_name: string;
  biz_address: string;
  biz_phone: string;
  biz_cuit: string;
  biz_footer: string;
  dirty?: number;
  lastError?: string;
  local_id: string;
}

export interface BusinessProfile {
  org_id: string;
  name: string;
  address: string;
  phone: string;
  cuit: string;
  footer: string;
  prefix: string;
  next_number: number;
  warranty_text: string;
  updatedAt: number;
  dirty?: number;
}

class ZTDB extends Dexie {
  products!: Table<LocalProduct, string>;
  outbox!: Table<OutboxSale, string>;
  tickets!: Table<LocalTicket, string>;
  cashDays!: Table<LocalCashDay, string>;
  meta!: Table<{ k: string; v: string }, string>;
  pins!: Table<LocalPin, string>;
  receipts!: Table<LocalReceipt, string>;
  profiles!: Table<BusinessProfile, string>;
  constructor() {
    super('zt_gestion');
    this.version(1).stores({
      products: 'id, org_id, updatedAt',
      outbox: 'id, org_id, createdAt',
      meta: 'k'
    });
    this.version(2).stores({
      products: 'id, org_id, updatedAt',
      outbox: 'id, org_id, createdAt',
      meta: 'k',
      pins: 'userId'
    });
    this.version(3).stores({
      products: 'id, org_id, updatedAt, barcode',
      outbox: 'id, org_id, createdAt',
      tickets: 'id, org_id, code, status, createdAt',
      cashDays: 'id, org_id, day',
      meta: 'k',
      pins: 'userId'
    });
    this.version(4).stores({
      products: 'id, org_id, updatedAt, barcode',
      outbox: 'id, org_id, createdAt',
      tickets: 'id, org_id, code, status, createdAt',
      cashDays: 'id, org_id, day',
      receipts: 'id, org_id, number, createdAt',
      profiles: 'org_id',
      meta: 'k',
      pins: 'userId'
    });
  }
}

export const db = new ZTDB();

export const uid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
