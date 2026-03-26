/**
 * HiveMind Background Service Worker
 * 
 * Handles cross-origin requests and session-persistent fetches
 * to bypass content script limitations.
 */

// Cross-browser namespace polyfill for service worker context
if (typeof globalThis.browser === "undefined" && typeof globalThis.chrome !== "undefined") {
    globalThis.browser = globalThis.chrome;
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "HM_FETCH") {
        handleFetch(request.payload)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async
    }
});

async function handleFetch(payload) {
    const { url, method, body, headers } = payload;
    
    const options = {
        method: method || "GET",
        headers: headers || {},
        credentials: 'include'
    };
    
    if (body) {
        options.body = body;
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.text();
}
