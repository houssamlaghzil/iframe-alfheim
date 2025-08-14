import { Router } from 'express';
import OpenAI from 'openai';
import { errlog } from '../utils/logger.js';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/api/chat', async (req, res) => {
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

export default router;
