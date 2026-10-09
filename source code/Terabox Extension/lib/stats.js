// Daily statistics and health, kept in chrome.storage so they survive restarts.
// Resets automatically when the local date changes.

export function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function createStats(store, { now = () => new Date() } = {}) {
    let queue = Promise.resolve();

    function fresh(day) {
        return { day, plays: 0, cycles: 0, errors: 0, lastSuccessAt: null, lastError: null };
    }

    async function update(mutate) {
        queue = queue.then(async () => {
            const current = (await store.get('stats')) || fresh(dayKey(now()));
            const today = dayKey(now());
            const base = current.day === today ? current : { ...fresh(today), lastSuccessAt: current.lastSuccessAt };
            mutate(base, now());
            await store.set({ stats: base });
        }).catch(() => {});
        return queue;
    }

    return {
        play: () => update((s) => { s.plays += 1; }),
        cycle: () => update((s) => { s.cycles += 1; }),
        success: () => update((s, t) => { s.lastSuccessAt = t.toISOString(); }),
        error: (message) => update((s) => { s.errors += 1; s.lastError = message; }),
        async get() {
            const current = (await store.get('stats')) || fresh(dayKey(now()));
            return current.day === dayKey(now())
                ? current
                : { ...fresh(dayKey(now())), lastSuccessAt: current.lastSuccessAt };
        },
    };
}
