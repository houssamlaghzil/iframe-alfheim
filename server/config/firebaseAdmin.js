import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { SERVICE_ACCOUNT } from './env.js';

const app = initializeApp({ credential: cert(SERVICE_ACCOUNT) });

export const db = getFirestore(app);
export const storage = getStorage(app);
