import { Router } from 'express';
import { CLIENT_ID, FORCE_PROXY_MODELS } from '../config/env.js';
import { getSelectedBucket, resolveBucket, setBucketCors } from '../services/storage.js';
import { pathFor } from '../utils/path.js';
import { db } from '../config/firebaseAdmin.js';
import { log, errlog } from '../utils/logger.js';

const router = Router();

router.get('/healthz', async (_req, res) => {
    res.json({
        ok: true,
        clientId: CLIENT_ID,
        bucket: getSelectedBucket()?.name || null,
        hasBucket: Boolean(getSelectedBucket()),
        FORCE_PROXY_MODELS,
    });
});

router.get('/debug/storage', async (_req, res) => {
    await resolveBucket();
    res.json({
        selected: getSelectedBucket()?.name || null,
        hint: getSelectedBucket() ? 'OK' : 'Active Storage et/ou corrige FIREBASE_STORAGE_BUCKET.',
    });
});

router.post('/debug/set-cors', async (_req, res) => {
    try {
        const cors = await setBucketCors([
            'https://alfheim.promete.tech',
            'http://localhost:5173',
            'http://localhost:3000',
        ]);
        log('CORS', 'CORS appliqué', cors);
        res.json({ ok: true, cors });
    } catch (e) {
        errlog('CORS', 'set-cors failed', e);
        res.status(500).json({ error: e?.message || 'CORS set failed' });
    }
});

router.get('/debug/fs-check', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).orderBy('createdAt', 'desc').limit(10).get();
        const ids = snap.docs.map(d => d.id);
        res.json({ clientId: CLIENT_ID, collectionPath: colPath, countLast10: snap.size, ids });
    } catch (e) {
        errlog('FS-CHECK', 'error', e);
        res.status(500).json({ error: e?.message || 'fs-check error' });
    }
});

export default router;
