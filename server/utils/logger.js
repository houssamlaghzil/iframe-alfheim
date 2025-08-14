const tstamp = () => new Date().toISOString();

export const log = (s, m, x) =>
    x !== undefined ? console.log(`[${tstamp()}] [${s}] ${m}`, x)
        : console.log(`[${tstamp()}] [${s}] ${m}`);

export const warn = (s, m, x) =>
    x !== undefined ? console.warn(`[${tstamp()}] [${s}] ⚠️ ${m}`, x)
        : console.warn(`[${tstamp()}] [${s}] ⚠️ ${m}`);

export const errlog = (s, m, x) =>
    x !== undefined ? console.error(`[${tstamp()}] [${s}] ❌ ${m}`, x)
        : console.error(`[${tstamp()}] [${s}] ❌ ${m}`);
