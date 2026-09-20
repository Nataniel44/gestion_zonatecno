export interface Product {
  id: string;
  name: string;
  cat: 'celulares' | 'computacion' | 'audio' | 'accesorios' | 'impresoras';
  catLabel: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  badge?: string;
  stock: number;
  cuotas: string;
  specs: string[];
  tint: string;
  icon: 'phone' | 'laptop' | 'audio' | 'watch' | 'pc' | 'charger' | 'printer';
}

export const PRODUCTS: Product[] = [
  { id: 'kit-salvavidas', name: 'Kit Salvavidas · Funda + Vidrio + Cargador bueno', cat: 'accesorios', catLabel: 'Kit Salvavidas', price: 25000, oldPrice: 32000, rating: 5.0, reviews: 214, badge: 'El que más se llevan', stock: 25, cuotas: 'Efectivo o transferencia', specs: ['Funda reforzada a medida', 'Vidrio templado colocado gratis', 'Cargador seguro, no daña batería'], tint: '#123a2a', icon: 'charger' },
  { id: 'a14', name: 'Samsung Galaxy A14 · 128GB Liberado', cat: 'celulares', catLabel: 'Celulares', price: 329999, oldPrice: 379999, rating: 4.8, reviews: 96, badge: 'Ideal para todos', stock: 6, cuotas: 'Lo dejamos configurado gratis', specs: ['Pantalla 6.6" grande, se ve bien', 'Batería dura todo el día', 'Te pasamos tus fotos y WhatsApp'], tint: '#123a2a', icon: 'phone' },
  { id: 'moto-g24', name: 'Motorola Moto G24 · 128GB', cat: 'celulares', catLabel: 'Celulares', price: 289999, oldPrice: 329999, rating: 4.7, reviews: 71, stock: 5, cuotas: 'Sellado con garantía 12 meses', specs: ['Simple de usar para cualquiera', 'Cámara buena para su precio', 'Liberado para todas las empresas'], tint: '#16293d', icon: 'phone' },
  { id: 'tinta-epson', name: 'Tinta alternativa Epson x4 colores · Calidad premium', cat: 'impresoras', catLabel: 'Impresoras', price: 34999, oldPrice: 42999, rating: 4.9, reviews: 183, badge: 'No tapa cabezales', stock: 18, cuotas: 'Para L3150 / L3250 / L3210', specs: ['No mancha, no tapa el sistema', 'Rinde igual que la original', 'Te enseñamos a cargarla'], tint: '#1b2f3a', icon: 'printer' },
  { id: 'cable-impresora', name: 'Cable impresora USB 1.8m reforzado', cat: 'impresoras', catLabel: 'Impresoras', price: 8999, rating: 4.8, reviews: 122, stock: 30, cuotas: 'Llevátelo hoy mismo', specs: ['Largo ideal para oficina', 'No se corta, ficha firme', 'Probado antes de entregar'], tint: '#0f2c22', icon: 'printer' },
  { id: 'mantenimiento-epson', name: 'Mantenimiento impresora Epson con sistema continuo', cat: 'impresoras', catLabel: 'Servicio', price: 35000, rating: 5.0, reviews: 89, badge: 'A domicilio también', stock: 99, cuotas: 'En el día · con garantía', specs: ['Limpieza de cabezales y almohadillas', 'Reseteo + prueba impresa', 'Vamos a tu casa u oficina'], tint: '#13293b', icon: 'printer' },
  { id: 'pin-carga', name: 'Cambio pin de carga · Samsung / Motorola / Xiaomi', cat: 'celulares', catLabel: 'Taller', price: 28000, rating: 5.0, reviews: 167, badge: 'En 2 a 6 horas', stock: 99, cuotas: 'Con garantía 90 días', specs: ['Si no carga o carga falso', 'Repuesto de calidad', 'Te avisamos por WhatsApp'], tint: '#182d40', icon: 'phone' },
  { id: 'pantalla-a12', name: 'Pantalla Samsung A12 / A13 / A14 colocada', cat: 'celulares', catLabel: 'Taller', price: 55000, oldPrice: 65000, rating: 4.9, reviews: 94, stock: 8, cuotas: 'Con vidrio de regalo', specs: ['Queda como nueva', 'Táctil original, no falla', 'Entrega en el día'], tint: '#123132', icon: 'phone' },
  { id: 'zapatilla-usb', name: 'Zapatilla 4 USB + protección contra cortes de luz', cat: 'accesorios', catLabel: 'Hogar', price: 22999, oldPrice: 27999, rating: 4.8, reviews: 77, stock: 12, cuotas: 'Cuida tu compu e impresora', specs: ['Corta sola si hay tormenta', '4 tomas + 2 USB carga rápida', 'Cable grueso de 1.5m'], tint: '#1a2f28', icon: 'charger' },
  { id: 'gan65', name: 'Cargador bueno GaN 25W + cable tipo C', cat: 'accesorios', catLabel: 'Accesorios', price: 18999, oldPrice: 24999, rating: 4.7, reviews: 203, badge: 'No quema la batería', stock: 30, cuotas: 'Carga rápida segura', specs: ['No como los baratos que explotan', 'Para Samsung, Moto, Xiaomi', 'Garantía 6 meses'], tint: '#1d2a24', icon: 'charger' },
  { id: 'hdmi-adapt', name: 'Adaptador HDMI + prolongación con protección', cat: 'accesorios', catLabel: 'Accesorios', price: 14999, rating: 4.7, reviews: 52, stock: 15, cuotas: 'Para TV, compu y proyector', specs: ['Conectá celu o noti a la tele', 'Ideal escuelas y oficinas', 'Probado en el local'], tint: '#152b38', icon: 'pc' },
  { id: 'pc-lenta', name: 'Puesta a punto PC lenta · SSD + limpieza', cat: 'computacion', catLabel: 'Taller', price: 60000, rating: 4.9, reviews: 48, badge: 'Vuela de nuevo', stock: 99, cuotas: 'Presupuesto antes, sin sorpresas', specs: ['Tu compu lenta queda rápida', 'No perdés fotos ni archivos', 'Test 24hs antes de entregar'], tint: '#202d3a', icon: 'laptop' },
];

export const FREE_SHIPPING_FROM = 150000;

export const fmt = (n: number) =>
  '$' + n.toLocaleString('es-AR');
