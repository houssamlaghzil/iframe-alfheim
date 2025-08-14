import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import OpenAI from 'openai';

dotenv.config();

/* ----------------------- LOGGING ----------------------- */
const tstamp = () => new Date().toISOString();
const log = (s, m, x) => x !== undefined ? console.log(`[${tstamp()}] [${s}] ${m}`, x)
    : console.log(`[${tstamp()}] [${s}] ${m}`);
const warn = (s, m, x) => x !== undefined ? console.warn(`[${tstamp()}] [${s}] ⚠️ ${m}`, x)
    : console.warn(`[${tstamp()}] [${s}] ⚠️ ${m}`);
const errlog = (s, m, x) => x !== undefined ? console.error(`[${tstamp()}] [${s}] ❌ ${m}`, x)
    : console.error(`[${tstamp()}] [${s}] ❌ ${m}`);

/* ----------------------- ENV ----------------------- */
const CLIENT_ID = process.env.CLIENT_ID || '1';
if (!process.env.FIREBASE_SA) { errlog('BOOT', 'FIREBASE_SA manquant'); process.exit(1); }
let serviceAccount;
try { serviceAccount = JSON.parse(process.env.FIREBASE_SA); }
catch (e) { errlog('BOOT', 'FIREBASE_SA JSON invalide', e?.message); process.exit(1); }

const providedBucket = (process.env.FIREBASE_STORAGE_BUCKET || '').trim();
log('BOOT', `Project: ${serviceAccount.project_id}`);
if (providedBucket) log('BOOT', `Bucket .env: ${providedBucket}`);
else warn('BOOT', 'FIREBASE_STORAGE_BUCKET non fourni — tentative de détection');

/* ----------------------- FIREBASE ADMIN ----------------------- */
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const storage = getStorage();

/* ----------------------- BUCKET RESOLUTION ----------------------- */
const candidates = [
    providedBucket,
    `${serviceAccount.project_id}.firebasestorage.app`,
    `${serviceAccount.project_id}.appspot.com`,
].filter(Boolean);

let selectedBucket = null;
let bucketMeta = null;

async function checkBucket(name) {
    try {
        const b = storage.bucket(name);
        const [exists] = await b.exists();
        if (!exists) return { exists: false };
        const [meta] = await b.getMetadata();
        return { exists: true, meta, bucket: b };
    } catch (e) {
        return { exists: false, error: e?.message || String(e) };
    }
}
async function resolveBucket() {
    for (const name of candidates) {
        const r = await checkBucket(name);
        log('STORAGE', `probe ${name} → exists=${r.exists}`);
        if (r.exists) {
            selectedBucket = r.bucket;
            bucketMeta = r.meta;
            log('STORAGE', 'Bucket sélectionné', {
                name,
                location: r.meta?.location,
                storageClass: r.meta?.storageClass,
            });
            return;
        }
    }
    errlog('STORAGE', 'Aucun bucket valide détecté', candidates);
}

/* ----------------------- EXPRESS ----------------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: '64mb' }));
app.use(express.urlencoded({ limit: '64mb', extended: true }));

// trace id
app.use((req, _res, next) => {
    req._rid = randomUUID();
    log('REQ', `${req.method} ${req.url} rid=${req._rid}`);
    next();
});

// multer (mémoire)
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        const okExt = name.endsWith('.glb');
        const okMime =
            file.mimetype === 'model/gltf-binary' ||
            file.mimetype === 'application/octet-stream' ||
            file.mimetype === '';
        if (okExt || okMime) return cb(null, true);
        cb(new Error('Invalid file type: GLB only'));
    },
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 Go
});

const pathFor = (...segs) => ['clients', String(CLIENT_ID), ...segs].join('/');
const safeFileName = (n) =>
    (n || 'model.glb').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');

/* ----------------------- UTILS URL ----------------------- */
const isFirebaseTokenUrl = (url) =>
    typeof url === 'string' && url.startsWith('https://firebasestorage.googleapis.com/v0/b/');
function firebaseMediaUrl(bucketName, storagePath, token) {
    const encoded = encodeURIComponent(storagePath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}
function resolveFileUrlForFront(doc) {
    if (isFirebaseTokenUrl(doc.fileUrl)) return doc.fileUrl;
    if (doc.storagePath) {
        return `/api/proxy-model?path=${encodeURIComponent(doc.storagePath)}`;
    }
    return doc.fileUrl || null;
}

/* ----------------------- DEBUG ----------------------- */
app.get('/healthz', (_req, res) => {
    res.json({
        ok: true,
        projectId: serviceAccount.project_id,
        bucket: selectedBucket?.name || null,
        hasBucket: Boolean(selectedBucket),
    });
});
app.get('/debug/storage', async (_req, res) => {
    const results = [];
    for (const name of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const r = await checkBucket(name);
        results.push({ name, exists: r.exists, error: r.error || null, location: r.meta?.location || null });
    }
    res.json({
        candidates: results,
        selected: selectedBucket?.name || null,
        hint: !results.some(r => r.exists)
            ? 'Active Firebase Storage dans la console → Storage → Get started. Le nom exact apparaît sous gs://<nom>.'
            : 'OK',
    });
});

/* --- Vérif Firestore : compte/retour d’IDs dans la sous-collection ---------------- */
app.get('/debug/fs-check', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).orderBy('createdAt', 'desc').limit(10).get();
        const ids = snap.docs.map(d => d.id);
        res.json({
            clientId: CLIENT_ID,
            collectionPath: colPath,
            countLast10: snap.size,
            ids,
            note: 'Dans la console: Collection "clients" → Doc CLIENT_ID → Sous-collection "environments".',
        });
    } catch (e) {
        errlog('FS-CHECK', 'error', e);
        res.status(500).json({ error: e?.message || 'fs-check error' });
    }
});

/* ----------------------- POIs ----------------------- */
app.get('/api/environments/:envId/pois', async (req, res) => {
    try {
        const col = pathFor('environments', req.params.envId, 'pois');
        const snap = await db.collection(col).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
        errlog('POIS', 'GET error', e);
        res.json([]);
    }
});
app.post('/api/environments/:envId/pois', async (req, res) => {
    try {
        const data = { ...req.body, updatedAt: Date.now() };
        if (!data.id) data.id = randomUUID();
        await db.doc(pathFor('environments', req.params.envId, 'pois', data.id)).set(data, { merge: true });
        res.status(201).json({ id: data.id });
    } catch (e) {
        errlog('POIS', 'UPSERT error', e);
        res.sendStatus(500);
    }
});

/* ----------------------- UPLOAD (nouveaux fichiers = URL Firebase token) ----------------------- */
app.post('/api/environments', upload.single('file'), async (req, res) => {
    const scope = 'ENV_UP';
    try {
        if (!selectedBucket) {
            warn(scope, 'Aucun bucket sélectionné — upload impossible. Vérifie /debug/storage');
            return res.status(500).json({ error: 'Bucket introuvable.' });
        }

        const { title, subtitle = '', description = '' } = req.body || {};
        if (!title) return res.status(400).json({ error: 'title requis' });
        if (!req.file) return res.status(400).json({ error: 'Fichier GLB manquant' });

        const id = db.collection(pathFor('environments')).doc().id;
        const docPath = pathFor('environments', id); // <-- chemin exact du doc
        const alias = randomUUID();
        const original = req.file.originalname || 'model.glb';
        const name = safeFileName(original.endsWith('.glb') ? original : `${original}.glb`);
        const dstPath = `${CLIENT_ID}/models/${Date.now()}-${name}`;
        const token = randomUUID(); // token Firebase

        log(scope, `upload → ${selectedBucket.name}/${dstPath}`, {
            size: req.file.size, mime: req.file.mimetype, alias, docPath,
        });

        const gcsFile = selectedBucket.file(dstPath);
        await gcsFile.save(req.file.buffer, {
            contentType: 'model/gltf-binary',
            resumable: false,
            metadata: {
                cacheControl: 'public, max-age=31536000, immutable',
                metadata: { firebaseStorageDownloadTokens: token },
            },
        });

        const firebaseUrl = firebaseMediaUrl(selectedBucket.name, dstPath, token);

        const doc = {
            title, subtitle, description,
            alias,
            fileUrl: firebaseUrl,   // CORS OK pour le front
            storagePath: dstPath,
            createdAt: Date.now(),
        };

        // ÉCRITURE
        await db.doc(docPath).set(doc);
        log(scope, `write OK → ${docPath}`);

        // RELECTURE IMMÉDIATE
        const after = await db.doc(docPath).get();
        log(scope, `readback exists=${after.exists} id=${id}`);

        res.status(201).json({ id, docPath, writeVerified: after.exists, ...doc });
    } catch (e) {
        errlog('ENV_UP', 'upload failed', e);
        res.status(500).json({ error: e?.message || 'Erreur serveur', rid: req._rid, bucket: selectedBucket?.name || null });
    }
});

/* ----------------------- LIST/GET (réécrit fileUrl pour éviter CORS) ----------------------- */
app.get('/api/environments', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).get();
        const out = snap.docs.map(d => {
            const data = d.data();
            const safeUrl = resolveFileUrlForFront(data);
            return { id: d.id, ...data, fileUrl: safeUrl };
        });
        log('ENV', `list (${colPath}) count=${out.length}`);
        res.json(out);
    } catch (e) {
        errlog('ENV', 'list error', e);
        res.json([]);
    }
});

// RAW: utile pour controler ce qui est en DB (sans réécriture d’URL)
app.get('/api/environments/raw', async (_req, res) => {
    try {
        const colPath = pathFor('environments');
        const snap = await db.collection(colPath).get();
        const out = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        log('ENV', `raw list (${colPath}) count=${out.length}`);
        res.json(out);
    } catch (e) {
        errlog('ENV', 'raw list error', e);
        res.json([]);
    }
});

app.get('/api/environments/:id', async (req, res) => {
    try {
        const ref = db.doc(pathFor('environments', req.params.id));
        const doc = await ref.get();
        if (!doc.exists) return res.sendStatus(404);
        const data = doc.data();
        const safeUrl = resolveFileUrlForFront(data);
        res.json({ id: doc.id, ...data, fileUrl: safeUrl });
    } catch (e) {
        errlog('ENV', 'get error', e);
        res.sendStatus(500);
    }
});

/* ----------------------- LEGACY /files/:alias(.glb)? ----------------------- */
app.get('/files/:alias', async (req, res) => {
    try {
        if (!selectedBucket) return res.status(500).send('Bucket non sélectionné');
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

        selectedBucket.file(storagePath)
            .createReadStream({ validation: false })
            .on('error', (e) => { errlog('FILES', 'stream error', e); res.destroy(e); })
            .pipe(res);
    } catch (e) {
        errlog('FILES', 'failed', e);
        res.status(500).send('files error');
    }
});

/* ----------------------- PROXY DIRECT ----------------------- */
app.get('/api/proxy-model', async (req, res) => {
    try {
        if (!selectedBucket) return res.status(500).send('Bucket non sélectionné');
        const path = String(req.query.path || '');
        if (!path || path.includes('..')) return res.status(400).send('path invalide');

        const file = selectedBucket.file(path);
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

/* ----------------------- ADMIN: MIGRATION VERS URL FIREBASE ----------------------- */
app.post('/admin/migrate-urls', async (_req, res) => {
    try {
        if (!selectedBucket) return res.status(500).json({ error: 'Bucket non sélectionné' });

        const col = db.collection(pathFor('environments'));
        const snap = await col.get();
        let updated = 0;
        for (const doc of snap.docs) {
            const data = doc.data();
            if (isFirebaseTokenUrl(data.fileUrl)) continue;
            if (!data.storagePath) continue;

            const gcsFile = selectedBucket.file(data.storagePath);
            const [exists] = await gcsFile.exists();
            if (!exists) { warn('MIGRATE', `manquant: ${data.storagePath}`); continue; }

            const [meta] = await gcsFile.getMetadata();
            let token = meta.metadata?.firebaseStorageDownloadTokens;
            if (!token) {
                token = randomUUID();
                await gcsFile.setMetadata({
                    metadata: { firebaseStorageDownloadTokens: token },
                    cacheControl: 'public, max-age=31536000, immutable',
                    contentType: 'model/gltf-binary',
                });
            }
            const newUrl = firebaseMediaUrl(selectedBucket.name, data.storagePath, token);
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

/* ----------------------- CHAT (optionnel) ----------------------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.post('/api/chat', async (req, res) => {
    try {
        const r = await openai.chat.completions.create({
            model: 'gpt-5-nano-2025-08-07',
            messages: req.body.messages,
        });
        res.json(r);
    } catch (e) {
        errlog('CHAT', 'error', e);
        res.sendStatus(500);
    }
});

/* ----------------------- START ----------------------- */
const PORT = 4000;
app.listen(PORT, async () => {
    log('BOOT', `API (${CLIENT_ID}) → http://localhost:${PORT}`);
    await resolveBucket();
    if (!selectedBucket) {
        errlog('BOOT', 'Aucun bucket valide détecté. Active Storage et/ou corrige FIREBASE_STORAGE_BUCKET.');
    }
});
