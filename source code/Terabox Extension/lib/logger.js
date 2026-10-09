// Bounded, serialised log kept in storage so it survives service-worker restarts.

export const LOG_LIMIT = 100;

export function createLogger(store, { limit = LOG_LIMIT, now = () => new Date(), onAppend = () => {} } = {}) {
    let queue = Promise.resolve();

    function append(message) {
        queue = queue.then(async () => {
            const logs = (await store.get('logs')) || [];
            logs.push(`[${now().toISOString()}] ${message}`);
            while (logs.length > limit) logs.shift();
            await store.set({ logs });
            onAppend();
        }).catch(() => {});
        return queue;
    }

    return { log: append };
}
