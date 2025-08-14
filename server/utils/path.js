import { CLIENT_ID } from '../config/env.js';

export const pathFor = (...segs) => ['clients', String(CLIENT_ID), ...segs].join('/');

export const safeFileName = (n) =>
    (n || 'model.glb')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');
