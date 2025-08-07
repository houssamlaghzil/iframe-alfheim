/* -------------------------------------------------------------------------- */
/*  API Express (ESM)                                                         */
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

/* ---------- Firebase ------------------------------------------------------ */
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = getFirestore();

/* ---------- App & middleware --------------------------------------------- */
const app = express();
app.use(cors());
app.use(express.json());

/* ---------- Upload util (.glb) ------------------------------------------- */
const upload = multer({ dest: 'uploads/' });

/* -------------------------------------------------------------------------- */
/*  ROUTES                                                                    */
/* -------------------------------------------------------------------------- */

/* Environnements ----------------------------------------------------------- */
app.post('/api/environments', upload.single('file'), async (req, res) => {
    try {
        const { title, subtitle, description } = req.body;
        if (!title || !req.file) return res.status(400).json({ error: 'Data missing' });

        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

        const id = db.collection('environments').doc().id;
        const fileName = `${id}-${req.file.originalname}`;
        fs.renameSync(req.file.path, path.join(uploadsDir, fileName));

        const doc = {
            title, subtitle, description,
            fileUrl: `/files/${fileName}`,
            createdAt: Date.now()
        };
        await db.doc(`environments/${id}`).set(doc);
        res.status(201).json({ id, ...doc });
    } catch (e) { console.error('POST /environments', e); res.sendStatus(500); }
});

app.get('/api/environments', async (_, res) => {
    const snap = await db.collection('environments').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

app.get('/api/environments/:id', async (req, res) => {
    const d = await db.doc(`environments/${req.params.id}`).get();
    res.json({ id: d.id, ...d.data() });
});

/* POI --------------------------------------------------------------------- */
app.get('/api/environments/:id/pois', async (req, res) => {
    const snap = await db.collection(`environments/${req.params.id}/pois`).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

app.post('/api/environments/:id/pois', async (req, res) => {
    try {
        const ref = db.doc(`environments/${req.params.id}/pois/${req.body.id}`);
        await ref.set(req.body, { merge: true });
        res.status(201).json({ id: ref.id });
    } catch (e) { console.error('POST /pois', e); res.sendStatus(500); }
});

/* Chat (proxy OpenAI) ------------------------------------------------------ */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.post('/api/chat', async (req, res) => {
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: req.body.messages
        });
        res.json(completion);
    } catch (e) { console.error('POST /chat', e); res.sendStatus(500); }
});

/* Static files (.glb) ------------------------------------------------------ */
app.use('/files', express.static(path.join(__dirname, 'uploads')));

app.listen(4000, () => console.log('API → http://localhost:4000'));
