import { FORCE_PROXY_MODELS } from '../config/env.js';

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
 * Retourne une URL **safe** pour le front.
 * - Si FORCE_PROXY_MODELS=true → toujours le proxy (notre domaine).
 * - Sinon → garde l’URL Firebase + token si dispo, sinon proxy si storagePath dispo.
 */
export const resolveFileUrlForFront = (doc) => {
    if (FORCE_PROXY_MODELS && doc.storagePath) {
        return buildProxyUrl(doc.storagePath);
    }
    if (isFirebaseTokenUrl(doc.fileUrl)) return doc.fileUrl;
    if (doc.storagePath) return buildProxyUrl(doc.storagePath);
    return doc.fileUrl || null;
};
