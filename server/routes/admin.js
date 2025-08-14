import { Router } from 'express';
import { randomUUID } from 'crypto';

import { db } from '../config/firebaseAdmin.js';
import { getSelectedBucket, getFileAndMeta } from '../services/storage.js';
import { pathFor } from '../utils/path.js';
import { firebaseMediaUrl } from '../utils/urls.js';
import { log, warn, errlog } from '../utils/logger.js';

const router = Router();

/**
 * POST /admin/migrate-urls
 * - Convertit les anciens docs (signed URL GCS) vers des URLs Firebase + token
 */
router.post('/admin/migrate-urls', async (_req, res) => {
    try {
        const bucket = getSelectedBucket();
        if (!bucket) return res.status(500).json({ error: 'Bucket non sélectionné' });

        const col = db.collection(pathFor('environments'));
        const snap = await col.get();
        let updated = 0;

        for (const doc of snap.docs) {
            const data = doc.data();
            if (!data.storagePath) continue;

            const r = await getFileAndMeta(data.storagePath);
            if (!r.exists) { warn('MIGRATE', `manquant: ${data.storagePath}`); continue; }

            let token = r.meta.metadata?.firebaseStorageDownloadTokens;
            if (!token) {
                token = randomUUID();
                await r.file.setMetadata({
                    metadata: { firebaseStorageDownloadTokens: token },
                    cacheControl: 'public, max-age=31536000, immutable',
                    contentType: 'model/gltf-binary',
                });
            }
            const newUrl = firebaseMediaUrl(bucket.name, data.storagePath, token);
            await doc.ref.set({ fileUrl: newUrl }, { merge: true });
            updated++;
            log('MIGRATE', `doc ${doc.id} → Firebase URL`);
        }

        res.json({ ok: true, updated, total: snap.size });
    } catch (e) {
        errlog('MIGRATE', 'failed', e);
        res.status(500).json({ error: e?.message || 'migration error' });
    }
});

export default router;
