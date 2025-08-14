// src/utils/urls.js
// Rôle: utilitaires d'URL. En frontal, on impose *systématiquement* le proxy
// pour éviter tout CORS (même si l'URL Firebase serait "théoriquement" valable).

export const isGcsSigned = (url) =>
    typeof url === 'string' && url.startsWith('https://storage.googleapis.com/');

export const isFirebaseTokenUrl = (url) =>
    typeof url === 'string' && url.startsWith('https://firebasestorage.googleapis.com/v0/b/');

export const firebaseMediaUrl = (bucketName, storagePath, token) => {
    const encoded = encodeURIComponent(storagePath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
};

export const buildProxyUrl = (storagePath) =>
    `/api/proxy-model?path=${encodeURIComponent(storagePath)}`;

/**
 * Retourne l'URL à utiliser côté front:
 * - si storagePath dispo → **toujours** le proxy (notre domaine) => CORS OK
 * - sinon on tente fileUrl (best effort)
 */
export const resolveFileUrlForFront = (doc) => {
    if (doc?.storagePath) return buildProxyUrl(doc.storagePath);
    return doc?.fileUrl || null;
};
