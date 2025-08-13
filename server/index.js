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

// Autoriser jusqu'à 1 Go pour les JSON et les formulaires
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

/* -------------------------------------------------------------------------- */
/*  ROUTES                                                                    */
/* -------------------------------------------------------------------------- */

/* ---------- POI (déclaré AVANT /:id) ------------------------------------- */
app.get('/api/environments/:envId/pois', async (req, res) => {
    try {
        const snap = await db.collection(`environments/${req.params.envId}/pois`).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
        res.json([]);
    }
});

app.post('/api/environments/:envId/pois', async (req, res) => {
    try {
        const data = { ...req.body, updatedAt: Date.now() };
        const ref  = db.doc(`environments/${req.params.envId}/pois/${data.id}`);
        await ref.set(data, { merge: true });
        console.log('🔥 POI upsert', req.params.envId, data.id);
        res.status(201).json({ id: ref.id });
    } catch (e) {
        console.error('POST /pois', e);
        res.sendStatus(500);
    }
});

/* ---------- ENVIRONNEMENTS ----------------------------------------------- */
app.post('/api/environments', upload.single('file'), async (req, res) => {
    try {
        const { title, subtitle, description } = req.body;
        if (!title || !req.file) return res.status(400).json({ error: 'Data missing or invalid file (GLB required)' });

        // Le fichier est déjà écrit dans UPLOADS_DIR avec un nom UUID.glb par multer
        const id = db.collection('environments').doc().id;
        const fileUrl = `/files/${req.file.filename}`;

        const doc = { title, subtitle, description, fileUrl, createdAt: Date.now() };
        await db.doc(`environments/${id}`).set(doc);
        res.status(201).json({ id, ...doc });
    } catch (e) {
        console.error('POST /api/environments', e);
        res.sendStatus(500);
    }
});

app.get('/api/environments', async (_req, res) => {
    const snap = await db.collection('environments').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

app.get('/api/environments/:id', async (req, res) => {
    const doc = await db.doc(`environments/${req.params.id}`).get();
    doc.exists ? res.json({ id: doc.id, ...doc.data() }) : res.sendStatus(404);
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
app.listen(4000, () => console.log('API → http://localhost:4000'));
