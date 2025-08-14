import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../config/firebaseAdmin.js';
import { pathFor } from '../utils/path.js';
import { log, errlog } from '../utils/logger.js';

const router = Router();

router.get('/api/environments/:envId/pois', async (req, res) => {
    try {
        const col = pathFor('environments', req.params.envId, 'pois');
        const snap = await db.collection(col).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
        errlog('POIS', 'GET error', e);
        res.json([]);
    }
});

router.post('/api/environments/:envId/pois', async (req, res) => {
    try {
        const data = { ...req.body, updatedAt: Date.now() };
        if (!data.id) data.id = randomUUID();
        const docPath = pathFor('environments', req.params.envId, 'pois', data.id);
        await db.doc(docPath).set(data, { merge: true });
        log('POIS', `UPSERT ${docPath}`);
        res.status(201).json({ id: data.id });
    } catch (e) {
        errlog('POIS', 'UPSERT error', e);
        res.sendStatus(500);
    }
});

export default router;
