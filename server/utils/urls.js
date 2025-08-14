export const isGcsSigned = (url) =>
    typeof url === 'string' && url.startsWith('https://storage.googleapis.com/');

export const isFirebaseTokenUrl = (url) =>
    typeof url === 'string' && url.startsWith('https://firebasestorage.googleapis.com/v0/b/');

export const firebaseMediaUrl = (bucketName, storagePath, token) => {
    const encoded = encodeURIComponent(storagePath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
};

// Réécrit pour éviter CORS côté front
export const resolveFileUrlForFront = (doc) => {
    if (isFirebaseTokenUrl(doc.fileUrl)) return doc.fileUrl;
    if (doc.storagePath) {
        return `/api/proxy-model?path=${encodeURIComponent(doc.storagePath)}`;
    }
    return doc.fileUrl || null;
};
