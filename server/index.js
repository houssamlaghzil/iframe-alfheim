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

/* ----------------------- LOGGING UTILS ----------------------- */
const tstamp = () => new Date().toISOString();
const log = (s, m, x) => x !== undefined ? console.log(`[${tstamp()}] [${s}] ${m}`, x)
    : console.log(`[${tstamp()}] [${s}] ${m}`);
const warn = (s, m, x) => x !== undefined ? console.warn(`[${tstamp()}] [${s}] ⚠️ ${m}`, x)
    : console.warn(`[${tstamp()}] [${s}] ⚠️ ${m}`);
const errlog = (s, m, x) => x !== undefined ? console.error(`[${tstamp()}] [${s}] ❌ ${m}`, x)
    : console.error(`[${tstamp()}] [${s}] ❌ ${m}`);

/* ----------------------- ENV ----------------------- */
const CLIENT_ID = process.env.CLIENT_ID || '1';
if (!process.env.FIREBASE_SA) {
    errlog('BOOT', 'FIREBASE_SA manquant dans .env');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SA);
} catch (e) {
    errlog('BOOT', 'FIREBASE_SA JSON invalide', e?.message);
    process.exit(1);
}

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

// multer: mémoire uniquement (pas d’écritures disque)
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
            ? 'Active Firebase Storage dans la console → Storage → Get started. Le nom exact apparaît sous la forme gs://<nom>.'
            : 'OK',
    });
});

/* ----------------------- (Optionnel) SET CORS SUR BUCKET -----------------------
   Utile si tu veux conserver les signed URLs GCS (storage.googleapis.com).
   S’il te faut cette option A), appelle POST /debug/set-cors une fois. */
app.post('/debug/set-cors', async (req, res) => {
    try {
        if (!selectedBucket) return res.status(500).json({ error: 'Bucket non sélectionné' });
        const origins = [
            'https://alfheim.promete.tech',
            'http://localhost:5173',
            'http://localhost:3000',
        ];
        await selectedBucket.setCors([{
            origin: origins,
            method: ['GET', 'HEAD', 'OPTIONS'],
            responseHeader: ['Content-Type'],
            maxAgeSeconds: 3600,
        }]);
        const [meta] = await selectedBucket.getMetadata();
        log('CORS', 'CORS appliqué', meta.cors || []);
        res.json({ ok: true, cors: meta.cors || [] });
    } catch (e) {
        errlog('CORS', 'set-cors failed', e);
        res.status(500).json({ error: e?.message || 'CORS set failed' });
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

/* ----------------------- ENVIRONMENTS + UPLOAD -----------------------
   FIX CORS : on génère un token Firebase et on renvoie l’URL:
   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<token>
   => CORS OK pour fetch() et useGLTF() */
app.post('/api/environments', upload.single('file'), async (req, res) => {
    const scope = 'ENV_UP';
    try {
        if (!selectedBucket) {
            warn(scope, 'Aucun bucket sélectionné — upload impossible. Vérifie /debug/storage');
            return res.status(500).json({
                error: 'Bucket introuvable. Active Firebase Storage et/ou corrige FIREBASE_STORAGE_BUCKET.',
            });
        }

        const { title, subtitle = '', description = '' } = req.body || {};
        if (!title) return res.status(400).json({ error: 'title requis' });
        if (!req.file) return res.status(400).json({ error: 'Fichier GLB manquant' });

        const id = db.collection(pathFor('environments')).doc().id;
        const original = req.file.originalname || 'model.glb';
        const name = safeFileName(original.endsWith('.glb') ? original : `${original}.glb`);
        const dstPath = `${CLIENT_ID}/models/${Date.now()}-${name}`;

        const token = randomUUID(); // token de téléchargement Firebase
        log(scope, `upload → ${selectedBucket.name}/${dstPath}`, {
            size: req.file.size,
            mime: req.file.mimetype,
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

        // URL Firebase (CORS OK)
        const encodedPath = encodeURIComponent(dstPath);
        const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${selectedBucket.name}/o/${encodedPath}?alt=media&token=${token}`;

        // (optionnel) aussi une signed URL GCS si tu en as besoin ailleurs (mais CORS à configurer si fetch côté client)
        // const [signedUrl] = await gcsFile.getSignedUrl({
        //   action: 'read',
        //   expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
        // });

        const doc = {
            title, subtitle, description,
            fileUrl: firebaseUrl,     // <= utilise ça côté front/useGLTF
            // signedUrl,             // <= décommente si tu veux aussi la version GCS
            storagePath: dstPath,
            createdAt: Date.now(),
        };
        await db.doc(pathFor('environments', id)).set(doc);

        log(scope, `done id=${id} urlLen=${firebaseUrl.length}`);
        res.status(201).json({ id, ...doc });
    } catch (e) {
        errlog('ENV_UP', 'upload failed', e);
        res.status(500).json({ error: e?.message || 'Erreur serveur', rid: req._rid, bucket: selectedBucket?.name || null });
    }
});

/* ----------------------- LECTURE LIST/GET ----------------------- */
app.get('/api/environments', async (_req, res) => {
    try {
        const snap = await db.collection(pathFor('environments')).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
        errlog('ENV', 'list error', e);
        res.json([]);
    }
});

app.get('/api/environments/:id', async (req, res) => {
    try {
        const doc = await db.doc(pathFor('environments', req.params.id)).get();
        if (!doc.exists) return res.sendStatus(404);
        res.json({ id: doc.id, ...doc.data() });
    } catch (e) {
        errlog('ENV', 'get error', e);
        res.sendStatus(500);
    }
});

/* ----------------------- (Optionnel) PROXY DE SECOURS -----------------------
   Si vraiment nécessaire, tu peux charger le GLB via ton domaine :
   /api/proxy-model?path=clients/<CLIENT_ID>/models/xxx.glb
   → ajoute CORS: * (mais attention au coût bande passante serveur) */
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
            .on('error', (e) => {
                errlog('PROXY', 'stream error', e);
                res.destroy(e);
            })
            .pipe(res);
    } catch (e) {
        errlog('PROXY', 'failed', e);
        res.status(500).send('proxy error');
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
        errlog('BOOT', 'Aucun bucket valide détecté.');
        errlog('BOOT', '👉 Vérifie le nom exact dans la console (gs://...) et/ou active Storage.');
    }
});
