export const logger = {
    info: (msg, data = {}) => {
        console.log(`%c[INFO] ${msg}`, 'color: #22d3ee', data);
        dispatch('info', msg, data);
    },
    warn: (msg, data = {}) => {
        console.warn(`[WARN] ${msg}`, data);
        dispatch('warn', msg, data);
    },
    error: (msg, err) => {
        console.error(`[ERROR] ${msg}`, err);
        dispatch('error', msg, err);
    }
};

function dispatch(type, msg, detail) {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now();
    const timestamp = Date.now();
    const time = new Date().toLocaleTimeString('cs-CZ');
    const content = detail ? (detail instanceof Error ? detail.message : JSON.stringify(detail)) : '';
    window.dispatchEvent(new CustomEvent('nevimto-log', { detail: { id, type, msg, time, timestamp, detail: content } }));
}