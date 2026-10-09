// Thin HTTP layer for the TeraBox endpoints. No Chrome APIs in here so it
// can be unit-tested with a fake fetch.

export const TERABOX_DOMAIN = 'terabox.com';

export function buildUrl(subdomain, path) {
    return `https://${subdomain || 'www'}.${TERABOX_DOMAIN}${path}`;
}

// 16-digit numeric report id, as used by the game endpoints.
export function reportId(random = Math.random) {
    let id = '';
    for (let i = 0; i < 16; i++) id += Math.floor(random() * 10);
    return id;
}

export class HttpError extends Error {
    constructor(status, url) {
        super(`HTTP ${status} for ${url}`);
        this.name = 'HttpError';
        this.status = status;
    }
}

// Only transient failures are worth retrying: network errors (TypeError from
// fetch), 429 and 5xx. Client errors (4xx) and bad JSON are permanent.
export function isRetryable(error) {
    if (error instanceof HttpError) {
        return error.status === 429 || error.status >= 500;
    }
    return error instanceof TypeError;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson(fetchImpl, url, {
    retries = 3,
    baseDelayMs = 1000,
    sleep = defaultSleep,
} = {}) {
    let attempt = 0;
    for (;;) {
        try {
            const response = await fetchImpl(url, {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw new HttpError(response.status, url);
            return await response.json();
        } catch (error) {
            if (attempt >= retries || !isRetryable(error)) throw error;
            attempt += 1;
            await sleep(baseDelayMs * 2 ** (attempt - 1));
        }
    }
}

// Follows redirects from www.terabox.com and returns the account subdomain,
// e.g. "jp" from https://jp.terabox.com/... Returns '' on failure.
export async function detectSubdomain(fetchImpl) {
    try {
        const response = await fetchImpl(buildUrl('', '/'), { redirect: 'follow', credentials: 'include' });
        const host = new URL(response.url).hostname;
        return host.endsWith(`.${TERABOX_DOMAIN}`) ? host.split('.')[0] : '';
    } catch (error) {
        return '';
    }
}
