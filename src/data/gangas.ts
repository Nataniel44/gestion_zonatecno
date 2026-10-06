import raw from '../../public/gangas.json';

export interface Ganga {
  slug: string;
  titulo: string;
  precio: number;
  precioRef?: number;
  condicion: string;
  detalle: string;
  fuente: string;
  fuenteUrl?: string;
  estado: 'disponible' | 'reservada' | 'vendida';
  fecha: string;
}

export const GANGAS: Ganga[] = raw as Ganga[];

export const fmtG = (n: number) => '$' + n.toLocaleString('es-AR');
export const WA_NUMBER = '5493755538503';
