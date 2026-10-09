// Service worker (MV3). Stateless between events: everything that must survive
// a worker restart lives in chrome.storage.local.
import { buildUrl, fetchJson, detectSubdomain } from './lib/api.js';
import { createCollector } from './lib/collector.js';
import { createLogger } from './lib/logger.js';
import { createStats } from './lib/stats.js';

const RESUME_ALARM = 'resume-collector';
const RESUME_PERIOD_MIN = 1;

const store = {
    get: (key) => chrome.storage.local.get(key).then((r) => r[key]),
    set: (obj) => chrome.storage.local.set(obj),
};

const broadcast = (message) => {
    chrome.runtime.sendMessage(message).catch(() => {}); // popup may be closed
};

const { log } = createLogger(store, { onAppend: () => broadcast({ action: 'logUpdated' }) });

async function subdomain() {
    return (await store.get('teraboxSubdomain')) || '';
}

async function getJson(path) {
    return fetchJson(fetch, buildUrl(await subdomain(), path));
}

const api = {
    bonus: () => getJson('/rest/1.0/imact/goldrain/report?&valid_envelope_cnt=80'),
    pull: () => getJson('/rest/1.0/imact/miner/pull'),
    start: () => getJson('/rest/1.0/imact/miner/start'),
    getItem: (gameId, objectType, reportId) =>
        getJson(`/rest/1.0/imact/miner/getitem?game_id=${gameId}&object_type=${objectType}&report_id=${reportId}`),
    finish: (gameId) => getJson(`/rest/1.0/imact/miner/finishgame?game_id=${gameId}`),
};

const stats = createStats(store);

function notify(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title,
        message,
    }).catch(() => {});
}

const collector = createCollector({
    api,
    store,
    log,
    stats,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onEvent: (name) => {
        if (name === 'dailyLimitReached') {
            broadcast({ action: 'dailyLimitReached' });
            notify('TeraBox Coin Collector', 'Daily free plays are used up. Collection stopped.');
        } else if (name === 'stopped') {
            broadcast({ action: 'logUpdated' });
            notify('TeraBox Coin Collector', 'Collection stopped after repeated errors. Open the log for details.');
        } else {
            broadcast({ action: 'updateCoinCount' });
        }
    },
});

async function refreshSubdomain() {
    const detected = await detectSubdomain(fetch);
    await store.set({ teraboxSubdomain: detected });
    await log(detected ? `Using subdomain: ${detected}` : 'Could not detect TeraBox subdomain; using www');
}

async function userInfoAndCoinCount() {
    const userInfo = await getJson('/passport/get_info');
    const coinCount = await getJson('/rest/1.0/inte/system/getrecord');
    return { userInfo, coinCount };
}

// Top-level listeners must be registered synchronously so Chrome can wake the worker for them.
chrome.runtime.onInstalled.addListener(async () => {
    await store.set({ isRunning: false });
    chrome.alarms.create(RESUME_ALARM, { periodInMinutes: RESUME_PERIOD_MIN });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(RESUME_ALARM, { periodInMinutes: RESUME_PERIOD_MIN });
    collector.resumeIfNeeded();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RESUME_ALARM) collector.resumeIfNeeded();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'startCollecting':
            (async () => {
                await refreshSubdomain();
                sendResponse(await collector.start());
            })().catch((error) => sendResponse({ success: false, message: error.message }));
            return true; // async response
        case 'stopCollecting':
            collector.stop().then(sendResponse);
            return true;
        case 'getStatus':
            Promise.all([store.get('isRunning'), store.get('dailyLimitReached')])
                .then(([isRunning, dailyLimitReached]) => sendResponse({ isRunning: Boolean(isRunning), dailyLimitReached: Boolean(dailyLimitReached) }));
            return true;
        case 'getStats':
            stats.get().then((s) => sendResponse(s));
            return true;
        case 'getLogs':
            store.get('logs').then((logs) => sendResponse(logs || []));
            return true;
        case 'getUserInfoAndCoinCount':
            userInfoAndCoinCount()
                .then((data) => sendResponse(data))
                .catch((error) => {
                    log(`Error fetching user info and coin count: ${error.message}`);
                    sendResponse({ error: error.message });
                });
            return true;
        default:
            return false;
    }
});
