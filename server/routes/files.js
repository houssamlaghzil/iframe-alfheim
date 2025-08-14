import { Router } from 'express';
import { db } from '../config/firebaseAdmin.js';
import { getSelectedBucket } from '../services/storage.js';
import { pathFor } from '../utils/path.js';
import { warn, errlog } from '../utils/logger.js';

const router = Router();

// Legacy: /files/:alias(.glb)?
router.get('/files/:alias', async (req, res) => {
    try {
        const bucket = getSelectedBucket();
        if (!bucket) return res.status(500).send('Bucket non sélectionné');

        let alias = String(req.params.alias || '');
        if (alias.toLowerCase().endsWith('.glb')) alias = alias.slice(0, -4);

        const q = await db.collection(pathFor('environments'))
            .where('alias', '==', alias).limit(1).get();

        if (q.empty) { warn('FILES', `alias introuvable: ${alias}`); return res.status(404).send('Not found'); }

        const { storagePath } = q.docs[0].data();
        if (!storagePath) return res.status(404).send('Not found');

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        bucket.file(storagePath)
            .createReadStream({ validation: false })
            .on('error', (e) => { errlog('FILES', 'stream error', e); res.destroy(e); })
            .pipe(res);
    } catch (e) {
        errlog('FILES', 'failed', e);
        res.status(500).send('files error');
    }
});

// Proxy direct: /api/proxy-model?path=clients/<CLIENT_ID>/models/xxx.glb
router.get('/api/proxy-model', async (req, res) => {
    try {
        const bucket = getSelectedBucket();
        if (!bucket) return res.status(500).send('Bucket non sélectionné');
        const path = String(req.query.path || '');
        if (!path || path.includes('..')) return res.status(400).send('path invalide');

        const file = bucket.file(path);
        const [exists] = await file.exists();
        if (!exists) return res.status(404).send('Not found');

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        file.createReadStream({ validation: false })
            .on('error', (e) => { errlog('PROXY', 'stream error', e); res.destroy(e); })
            .pipe(res);
    } catch (e) {
        errlog('PROXY', 'failed', e);
        res.status(500).send('proxy error');
    }
});

export default router;
