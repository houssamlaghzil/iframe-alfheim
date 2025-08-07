/* -------------------------------------------------------------------------- */
/*  API Express  (ESM)                                                        */
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

/* ---------- Upload util (fichiers .glb) ----------------------------------- */
const upload = multer({ dest: 'uploads/' });

/* -------------------------------------------------------------------------- */
/*  ROUTES  (modèles historiques + ENV 3D)                                    */
/* -------------------------------------------------------------------------- */

/* ENVIRONNEMENTS 3D --------------------------------------------------------- */
app.post('/api/environments', upload.single('file'), async (req, res) => {
    try {
        const { title, subtitle, description } = req.body;
        if (!title || !req.file) return res.status(400).json({ error: 'données manquantes' });

        const id = db.collection('environments').doc().id;
        const fileName = `${id}-${req.file.originalname}`;
        fs.renameSync(req.file.path, path.join('uploads', fileName));

        const doc = {
            title,
            subtitle,
            description,
            fileUrl: `/files/${fileName}`,
            createdAt: Date.now()
        };
        await db.doc(`environments/${id}`).set(doc);
        res.status(201).json({ id, ...doc });
        console.log('[API] environnement créé →', id);
    } catch (e) {
        console.error('[API] POST /environments KO', e);
        res.sendStatus(500);
    }
});

app.get('/api/environments', async (_, res) => {
    const s = await db.collection('environments').get();
    res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

app.get('/api/environments/:id', async (r, res) => {
    const d = await db.doc(`environments/${r.params.id}`).get();
    res.json({ id: d.id, ...d.data() });
});

/* POI liés à un environnement --------------------------------------------- */
app.get('/api/environments/:id/pois', async (r, res) => {
    const snap = await db.collection(`environments/${r.params.id}/pois`).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});
app.post('/api/environments/:id/pois', async (r, res) => {
    const ref = db.collection(`environments/${r.params.id}/pois`).doc();
    await ref.set(r.body);
    res.status(201).json({ id: ref.id });
});

/* CHAT RELAY --------------------------------------------------------------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.post('/api/chat', async (req, res) => {
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: req.body.messages
    });
    res.json(completion);
});

/* FICHIERS STATIQUES ------------------------------------------------------- */
app.use('/files', express.static(path.join(__dirname, 'uploads')));

/* -------------------------------------------------------------------------- */
app.listen(4000, () => console.log('API OK sur http://localhost:4000'));
