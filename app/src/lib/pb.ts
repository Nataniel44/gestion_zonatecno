import PocketBase from 'pocketbase';

const url = (import.meta.env.VITE_PB_URL as string | undefined)?.trim();

if (!url) {
  console.warn('[ZT] Falta VITE_PB_URL. Copia app/.env.example a app/.env con https://app.zonatecno.uno');
}

export const pb = new PocketBase(url || 'http://127.0.0.1:8090');
pb.autoCancellation(false);

export const pbUrl = () => url || 'http://127.0.0.1:8090';

export const isCloudConfigured = () => !!url && url.startsWith('http');
export const currentUser = () => pb.authStore.model;
export const isLoggedIn = () => pb.authStore.isValid;
