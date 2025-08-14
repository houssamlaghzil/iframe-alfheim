import { Router } from 'express';
import { randomUUID } from 'crypto';

import upload from '../middlewares/upload.js';
import { log, warn, errlog } from '../utils/logger.js';
import { db } from '../config/firebaseAdmin.js';
import { getSelectedBucket, saveGlbWithToken } from '../services/storage.js';
import { pathFor, safeFileName } from '../utils/path.js';
import { firebaseMediaUrl, resolveFileUrlForFront, isFirebaseTokenUrl } from '../utils/urls.js';

const router = Router();

/**
 * POST /api/environments
 * form-data: title (string), subtitle?, description?, file (.glb)
 * -> crée doc Firestore sous clients/<CLIENT_ID>/environments/<id>
 * -> upload GLB vers Storage + URL Firebase (token)
 */
router.post('/api/environments', upload.single('file'), async (req, res) => {
    const scope = 'ENV_UP';
    try {
        const bucket = getSelectedBucket();
        if (!bucket) {
            warn(scope, 'Aucun bucket sélectionné — upload impossible.');
            return res.status(500).json({ error: 'Bucket introuvable.' });
        }

        const { title, subtitle = '', description = '' } = req.body || {};
        if (!title) return res.status(400).json({ error: 'title requis' });
        if (!req.file) return res.status(400).json({ error: 'Fichier GLB manquant' });

        const id = db.collection(pathFor('environments')).doc().id;
        const docPath = pathFor('environments', id);
        const alias = randomUUID();

        const original = req.file.originalname || 'model.glb';
        const name = safeFileName(original.endsWith('.glb') ? original : `${original}.glb`);
        const dstPath = `${docPath.replace(/\//g, '_')}-${name}`; // unique & lisible
        const token = randomUUID();

        log(scope, `upload → ${bucket.name}/${dstPath}`, {
            size: req.file.size, mime: req.file.mimetype, alias, docPath,
        });

        await saveGlbWithToken(dstPath, req.file.buffer, token);
        const firebaseUrl = firebaseMediaUrl(bucket.name, dstPath, token);

        const doc = {
            title, subtitle, description,
            alias,
            fileUrl: firebaseUrl,   // CORS OK
            storagePath: dstPath,
            createdAt: Date.now(),
        };

        await db.doc(docPath).set(doc);
        log(scope, `write OK → ${docPath}`);

        const after = await db.doc(docPath).get();
        log(scope, `readback exists=${after.exists} id=${id}`);

        res.status(201).json({ id, docPath, writeVerified: after.exists, ...doc });
    } catch (e) {
        errlog('ENV_UP', 'upload failed', e);
        res.status(500).json({ error: e?.message || 'Erreur serveur', rid: req._rid });
    }
});

/**
 * GET /api/environments
 * -> liste réécrite (fileUrl CORS-safe)
 */
router.get('/api/environments', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).get();
        const out = snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, ...data, fileUrl: resolveFileUrlForFront(data) };
        });
        log('ENV', `list (${colPath}) count=${out.length}`);
        res.json(out);
    } catch (e) {
        errlog('ENV', 'list error', e);
        res.json([]);
    }
});

/**
 * GET /api/environments/raw
 * -> debug brut, sans réécriture d’URL
 */
router.get('/api/environments/raw', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).get();
        const out = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        log('ENV', `raw (${colPath}) count=${out.length}`);
        res.json(out);
    } catch (e) {
        errlog('ENV', 'raw list error', e);
        res.json([]);
    }
});

/**
 * GET /api/environments/:id
 */
router.get('/api/environments/:id', async (req, res) => {
    try {
        const ref = db.doc(pathFor('environments', req.params.id));
        const doc = await ref.get();
        if (!doc.exists) return res.sendStatus(404);
        const data = doc.data();
        res.json({ id: doc.id, ...data, fileUrl: resolveFileUrlForFront(data) });
    } catch (e) {
        errlog('ENV', 'get error', e);
        res.sendStatus(500);
    }
});

export default router;
