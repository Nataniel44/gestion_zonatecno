import Dexie, { type Table } from 'dexie';

export interface LocalProduct {
  id: string;
  org_id: string;
  name: string;
  price: number;
  stock: number;
  min_stock: number;
  category: string;
  dirty?: number; // 1 = pendiente de subir
  deleted?: number; // 1 = borrado lógicamente en la nube
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

export interface LocalPin {
  userId: string;
  email: string;
  org_id: string;
  pinHash: string;
  updatedAt: number;
}

class ZTDB extends Dexie {
  products!: Table<LocalProduct, string>;
  outbox!: Table<OutboxSale, string>;
  meta!: Table<{ k: string; v: string }, string>;
  pins!: Table<LocalPin, string>;
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
  }
}

export const db = new ZTDB();

export const uid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
