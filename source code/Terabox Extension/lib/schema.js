// Response validation. When TeraBox changes a response shape, these checks
// name the missing field instead of failing somewhere unclear later.

export class SchemaError extends Error {
    constructor(endpoint, reason) {
        super(`Unexpected response from ${endpoint}: ${reason}`);
        this.name = 'SchemaError';
    }
}

export function validateStart(data) {
    if (!data || typeof data !== 'object') return { ok: false, reason: 'empty body' };
    if (!data.data) return { ok: false, reason: 'missing "data"' };
    if (data.data.game_id === undefined || data.data.game_id === null) return { ok: false, reason: 'missing data.game_id' };
    if (!data.data.map_info || !Array.isArray(data.data.map_info.items)) return { ok: false, reason: 'missing data.map_info.items' };
    return { ok: true };
}

export function validatePull(data) {
    if (!data || typeof data !== 'object') return { ok: false, reason: 'empty body' };
    if (!data.data || typeof data.data.free_times_left !== 'number') return { ok: false, reason: 'missing numeric data.free_times_left' };
    return { ok: true };
}
