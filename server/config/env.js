import dotenv from 'dotenv';
import { errlog, warn, log } from '../utils/logger.js';

dotenv.config();

export const CLIENT_ID = process.env.CLIENT_ID || '1';

if (!process.env.FIREBASE_SA) {
    errlog('ENV', 'FIREBASE_SA manquant dans .env');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SA);
} catch (e) {
    errlog('ENV', 'FIREBASE_SA JSON invalide', e?.message);
    process.exit(1);
}
export const SERVICE_ACCOUNT = serviceAccount;

const providedBucket = (process.env.FIREBASE_STORAGE_BUCKET || '').trim();
log('ENV', `Project: ${serviceAccount.project_id}`);
if (providedBucket) log('ENV', `Bucket .env: ${providedBucket}`);
else warn('ENV', 'FIREBASE_STORAGE_BUCKET non fourni — tentative de détection');

export const BUCKET_CANDIDATES = [
    providedBucket,
    `${serviceAccount.project_id}.firebasestorage.app`, // nouveau format
    `${serviceAccount.project_id}.appspot.com`,        // ancien format
].filter(Boolean);
