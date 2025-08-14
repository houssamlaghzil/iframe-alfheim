import { randomUUID } from 'crypto';
import { log } from '../utils/logger.js';

export default function requestId(req, _res, next) {
    req._rid = randomUUID();
    log('REQ', `${req.method} ${req.url} rid=${req._rid}`);
    next();
}
