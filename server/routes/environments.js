import { Router } from 'express';
import { randomUUID } from 'crypto';

import upload from '../middlewares/upload.js';
import { log, warn, errlog } from '../utils/logger.js';
import { db } from '../config/firebaseAdmin.js';
import { getSelectedBucket, saveGlbWithToken } from '../services/storage.js';
import { pathFor, safeFileName } from '../utils/path.js';
import {
    firebaseMediaUrl,
    resolveFileUrlForFront,
    buildProxyUrl,
    isFirebaseTokenUrl,
} from '../utils/urls.js';
import { FORCE_PROXY_MODELS } from '../config/env.js';

const router = Router();

/** POST /api/environments  (title + file .glb en multipart)
 *  - Upload GLB → Storage (token Firebase)
 *  - Stocke en DB : fileUrlFirebase, fileUrlProxy, fileUrl (exposée)
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
        // Chemin fichier (stabilisé pour logs/support)
        const dstPath = `${docPath.replace(/\//g, '_')}-${name}`;

        const token = randomUUID();
        log(scope, `upload → ${bucket.name}/${dstPath}`, {
            rid: req._rid, size: req.file.size, mime: req.file.mimetype, alias, docPath, FORCE_PROXY_MODELS,
        });

        await saveGlbWithToken(dstPath, req.file.buffer, token);

        const fileUrlFirebase = firebaseMediaUrl(bucket.name, dstPath, token);
        const fileUrlProxy = buildProxyUrl(dstPath);
        const fileUrl = FORCE_PROXY_MODELS ? fileUrlProxy : fileUrlFirebase;

        const doc = {
            title, subtitle, description,
            alias,
            // on garde les 2 pour debug, mais on expose `fileUrl` dans les GET
            fileUrl,
            fileUrlFirebase,
            fileUrlProxy,
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

/** GET /api/environments  (expose une URL safe pour le front) */
router.get('/api/environments', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).get();
        const out = snap.docs.map(d => {
            const data = d.data();
            const safeUrl = resolveFileUrlForFront(data);
            return {
                id: d.id,
                ...data,
                fileUrl: safeUrl,
            };
        });
        log('ENV', `list (${colPath}) count=${out.length}`);
        res.json(out);
    } catch (e) {
        errlog('ENV', 'list error', e);
        res.json([]);
    }
});

/** GET /api/environments/raw  (sans réécriture d’URL, debug) */
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

/** GET /api/environments/:id  (expose URL safe) */
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
