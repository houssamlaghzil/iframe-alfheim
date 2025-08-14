import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';

dotenv.config();

// Récupération de l'ID client depuis les variables d'environnement
const CLIENT_ID = process.env.CLIENT_ID;
if (!CLIENT_ID) {
    console.error("❌ CLIENT_ID manquant dans .env");
    process.exit(1);
}

// Helper pour générer un chemin Firestore avec préfixe client
function pathFor(...segments) {
    return ['clients', CLIENT_ID, ...segments].join('/');
}

/* Dossiers racine/uploads (chemins absolus) -------------------------------- */
const ROOT_DIR = path.resolve();
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
console.log('Static /files →', UPLOADS_DIR);

/* Firebase ----------------------------------------------------------------- */
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = getFirestore();

/* App ---------------------------------------------------------------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: '1024mb' }));
app.use(express.urlencoded({ limit: '1024mb', extended: true }));

/* Upload (.glb) sécurisé --------------------------------------------------- */
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}.glb`)
});
const fileFilter = (_req, file, cb) => {
    const isGlbExt = /\.glb$/i.test(file.originalname || '');
    const isGlbMime = file.mimetype === 'model/gltf-binary' || file.mimetype === 'application/octet-stream';
    if (isGlbExt && isGlbMime) return cb(null, true);
    cb(new Error('Invalid file type: GLB only'));
};
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 1024 * 1024 * 1024 } // 1 Go
});

/* ---------- POI ----------------------------------------------------------- */
app.get('/api/environments/:envId/pois', async (req, res) => {
    try {
        const snap = await db.collection(pathFor('environments', req.params.envId, 'pois')).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
        console.error("GET /pois", e);
        res.json([]);
    }
});

app.post('/api/environments/:envId/pois', async (req, res) => {
    try {
        const data = { ...req.body, updatedAt: Date.now() };
        const ref  = db.doc(pathFor('environments', req.params.envId, 'pois', data.id));
        await ref.set(data, { merge: true });
        console.log('🔥 POI upsert', CLIENT_ID, req.params.envId, data.id);
        res.status(201).json({ id: ref.id });
    } catch (e) {
        console.error('POST /pois', e);
        res.sendStatus(500);
    }
});

/* ---------- ENVIRONNEMENTS ------------------------------------------------ */
app.post('/api/environments', upload.single('file'), async (req, res) => {
    try {
        const { title, subtitle, description } = req.body;
        if (!title || !req.file) {
            return res.status(400).json({ error: 'Data missing or invalid file (GLB required)' });
        }

        const id = db.collection(pathFor('environments')).doc().id;
        const fileUrl = `/files/${req.file.filename}`;
        const doc = { title, subtitle, description, fileUrl, createdAt: Date.now() };

        await db.doc(pathFor('environments', id)).set(doc);
        res.status(201).json({ id, ...doc });
    } catch (e) {
        console.error('POST /api/environments', e);
        res.sendStatus(500);
    }
});

app.get('/api/environments', async (_req, res) => {
    try {
        const snap = await db.collection(pathFor('environments')).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
        console.error("GET /api/environments", e);
        res.json([]);
    }
});

app.get('/api/environments/:id', async (req, res) => {
    try {
        const doc = await db.doc(pathFor('environments', req.params.id)).get();
        doc.exists ? res.json({ id: doc.id, ...doc.data() }) : res.sendStatus(404);
    } catch (e) {
        console.error("GET /api/environments/:id", e);
        res.sendStatus(500);
    }
});

/* ---------- CHAT ---------------------------------------------------------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.post('/api/chat', async (req, res) => {
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-5-nano-2025-08-07',
            messages: req.body.messages
        });
        res.json(completion);
    } catch (e) {
        console.error('POST /chat', e);
        res.sendStatus(500);
    }
});

/* ---------- STATIC FILES (.glb) ------------------------------------------ */
app.use('/files', express.static(UPLOADS_DIR, {
    setHeaders(res, filePath) {
        if (filePath.toLowerCase().endsWith('.glb')) {
            res.setHeader('Content-Type', 'model/gltf-binary');
        }
    }
}));

/* -------------------------------------------------------------------------- */
app.listen(4000, () => console.log(`API (${CLIENT_ID}) → http://localhost:4000`));
