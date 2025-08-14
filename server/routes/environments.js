// src/routes/environments.js
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
} from '../utils/urls.js';

const router = Router();

/**
 * POST /api/environments
 * - Reçoit title + file(.glb)
 * - Upload Storage (avec token Firebase pour debug/backup)
 * - Sauvegarde Firestore
 * - Réponse: **fileUrl = proxy** (CORS safe) et on "empoisonne" aussi fileUrlFirebase dans la réponse
 *   pour neutraliser un front qui lirait le mauvais champ.
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

        // ID doc + chemins
        const id = db.collection(pathFor('environments')).doc().id;
        const docPath = pathFor('environments', id);
        const alias = randomUUID();

        const original = req.file.originalname || 'model.glb';
        const name = safeFileName(original.endsWith('.glb') ? original : `${original}.glb`);
        const dstPath = `${docPath.replace(/\//g, '_')}-${name}`;

        // Upload Storage avec token Firebase (utile en debug/offline)
        const token = randomUUID();
        log(scope, `upload → ${bucket.name}/${dstPath}`, {
            rid: req._rid, size: req.file.size, mime: req.file.mimetype, alias, docPath,
        });
        await saveGlbWithToken(dstPath, req.file.buffer, token);

        // On calcule les 2 URLs mais on *expose* le proxy partout
        const fileUrlFirebaseRaw = firebaseMediaUrl(bucket.name, dstPath, token);
        const fileUrlProxy = buildProxyUrl(dstPath);

        // Contenu stocké en DB
        const doc = {
            title, subtitle, description,
            alias,
            storagePath: dstPath,
            createdAt: Date.now(),
            // On garde TOUT pour debug/audit:
            fileUrl: fileUrlProxy,              // URL principale (toujours proxy)
            fileUrlProxy,                       // duplicat explicite
            fileUrlFirebaseRaw,                 // l'URL Firebase "brute" de référence (ne pas utiliser en front)
        };

        // Écriture Firestore
        await db.doc(docPath).set(doc);
        log(scope, `write OK → ${docPath}`);

        // Relecture pour vérif
        const after = await db.doc(docPath).get();
        log(scope, `readback exists=${after.exists} id=${id}`);

        // ⚠️ RÉPONSE: on "empoisonne" aussi fileUrlFirebase pour neutraliser le front s'il se trompe de champ
        res.status(201).json({
            id,
            docPath,
            writeVerified: after.exists,
            ...doc,
            fileUrlFirebase: fileUrlProxy, // <- même valeur que fileUrl
        });
    } catch (e) {
        errlog('ENV_UP', 'upload failed', e);
        res.status(500).json({ error: e?.message || 'Erreur serveur', rid: req._rid });
    }
});

/**
 * GET /api/environments
 * - Liste des envs
 * - Forçage: fileUrl = proxy et on met aussi fileUrlFirebase = proxy
 */
router.get('/api/environments', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).get();
        const out = snap.docs.map(d => {
            const data = d.data();
            const fileUrlSafe = resolveFileUrlForFront(data); // => proxy
            return {
                id: d.id,
                ...data,
                fileUrl: fileUrlSafe,
                fileUrlFirebase: fileUrlSafe, // ← “empoisonné”
            };
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
 * - Debug brut (aucune réécriture)
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
 * - Détail d’un env (proxy forcé)
 */
router.get('/api/environments/:id', async (req, res) => {
    try {
        const ref = db.doc(pathFor('environments', req.params.id));
        const doc = await ref.get();
        if (!doc.exists) return res.sendStatus(404);
        const data = doc.data();
        const fileUrlSafe = resolveFileUrlForFront(data); // => proxy
        res.json({
            id: doc.id,
            ...data,
            fileUrl: fileUrlSafe,
            fileUrlFirebase: fileUrlSafe, // ← “empoisonné”
        });
    } catch (e) {
        errlog('ENV', 'get error', e);
        res.sendStatus(500);
    }
});

export default router;
