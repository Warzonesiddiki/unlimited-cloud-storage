// In-memory stand-in for chrome.storage.local with the same async get/set shape.
export function createMemoryStore(initial = {}) {
    const data = { ...initial };
    return {
        async get(key) { return data[key]; },
        async set(obj) { Object.assign(data, obj); },
        snapshot() { return { ...data }; },
    };
}
