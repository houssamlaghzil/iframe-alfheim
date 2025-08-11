/* -------------------------------------------------------------------------- */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';

dotenv.config();
const __dirname = path.resolve();

/* Firebase ----------------------------------------------------------------- */
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = getFirestore();

/* App ---------------------------------------------------------------------- */
const app = express();
app.use(cors());
app.use(express.json());

/* Upload (.glb) ------------------------------------------------------------ */
const upload = multer({ dest: 'uploads/' });

/* -------------------------------------------------------------------------- */
/*  ROUTES                                                                    */
/* -------------------------------------------------------------------------- */

/* ---------- POI (déclaré AVANT /:id) ------------------------------------- */
app.get('/api/environments/:envId/pois', async (req, res) => {
    try {
        const snap = await db.collection(`environments/${req.params.envId}/pois`).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
        res.json([]);                       // retourne tableau vide si env absente
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
        if (!title || !req.file) return res.status(400).json({ error: 'Data missing' });

        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

        const id   = db.collection('environments').doc().id;
        const file = `${id}-${req.file.originalname}`;
        fs.renameSync(req.file.path, path.join(uploadsDir, file));

        const doc = { title, subtitle, description, fileUrl: `/files/${file}`, createdAt: Date.now() };
        await db.doc(`environments/${id}`).set(doc);
        res.status(201).json({ id, ...doc });
    } catch (e) { console.error(e); res.sendStatus(500); }
});

app.get('/api/environments', async (_, res) => {
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
    } catch (e) { console.error('POST /chat', e); res.sendStatus(500); }
});

/* ---------- STATIC FILES (.glb) ------------------------------------------ */
app.use('/files', express.static(path.join(__dirname, 'uploads')));

/* -------------------------------------------------------------------------- */
app.listen(4000, () => console.log('API → http://localhost:4000'));
