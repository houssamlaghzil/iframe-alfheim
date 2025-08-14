import { Router } from 'express';
import { db } from '../config/firebaseAdmin.js';
import { getSelectedBucket, getFileAndMeta } from '../services/storage.js';
import { pathFor } from '../utils/path.js';
import { warn, errlog, log } from '../utils/logger.js';

const router = Router();

/** Helpers Range */
function parseRange(rangeHeader, size) {
    // "bytes=start-end"
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
    if (!match) return null;
    let start = match[1] === '' ? 0 : parseInt(match[1], 10);
    let end = match[2] === '' ? size - 1 : parseInt(match[2], 10);
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end) return null;
    return { start, end };
}

/** Envoie un fichier Storage en supportant Range (206) et CORS */
async function streamStorageFile(res, storagePath, rangeHeader) {
    const r = await getFileAndMeta(storagePath);
    if (!r.exists) return res.status(404).send('Not found');

    const size = Number(r.meta.size || 0);
    const type = r.meta.contentType || 'model/gltf-binary';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', type);

    if (rangeHeader && size > 0) {
        const range = parseRange(rangeHeader, size);
        if (range) {
            const chunkSize = range.end - range.start + 1;
            res.status(206);
            res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
            res.setHeader('Content-Length', String(chunkSize));
            return r.file
                .createReadStream({ start: range.start, end: range.end, validation: false })
                .on('error', (e) => { errlog('STREAM', 'range stream error', e); res.destroy(e); })
                .pipe(res);
        }
    }

    if (size > 0) res.setHeader('Content-Length', String(size));
    return r.file
        .createReadStream({ validation: false })
        .on('error', (e) => { errlog('STREAM', 'full stream error', e); res.destroy(e); })
        .pipe(res);
}

/** Legacy: /files/:alias(.glb)?  → resolve storagePath via Firestore */
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

        log('FILES', `stream by alias ${alias} → ${storagePath}`, { range: req.headers.range ?? null });
        return streamStorageFile(res, storagePath, req.headers.range);
    } catch (e) {
        errlog('FILES', 'failed', e);
        res.status(500).send('files error');
    }
});

/** Proxy direct: /api/proxy-model?path=clients/<CLIENT_ID>/... */
router.get('/api/proxy-model', async (req, res) => {
    try {
        const bucket = getSelectedBucket();
        if (!bucket) return res.status(500).send('Bucket non sélectionné');

        const storagePath = String(req.query.path || '');
        if (!storagePath || storagePath.includes('..')) return res.status(400).send('path invalide');

        log('PROXY', `stream ${storagePath}`, { range: req.headers.range ?? null });
        return streamStorageFile(res, storagePath, req.headers.range);
    } catch (e) {
        errlog('PROXY', 'failed', e);
        res.status(500).send('proxy error');
    }
});

export default router;
