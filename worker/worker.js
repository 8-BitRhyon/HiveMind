/**
 * HiveMind Worker - Cloudflare Workers Backend
 * 
 * Endpoints:
 *   POST /auth   - Authenticate with Alliance Key + IGN
 *   POST /intel  - Submit intel report
 *   GET  /intel/:id - Get intel for a target
 *   POST /lock   - Lock a target
 *   GET  /lock/:id  - Check lock status
 *   DELETE /lock/:id - Release lock
 */

// Environment variables (set via wrangler.toml or dashboard):
// - ALLIANCE_KEY: The secret key for authentication
// - HIVEMIND_KV: KV namespace binding

/// ===============================================================
// SECURITY HELPERS (OWASP & Rate Limiting)
// ===============================================================

async function constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const enc = new TextEncoder();
    // Use SHA-256 to normalize lengths and prevent interpreter short-circuiting
    const hashA = await crypto.subtle.digest("SHA-256", enc.encode(a));
    const hashB = await crypto.subtle.digest("SHA-256", enc.encode(b));
    const arrA = new Uint8Array(hashA);
    const arrB = new Uint8Array(hashB);
    let result = 0;
    for (let i = 0; i < arrA.length; i++) {
        result |= (arrA[i] ^ arrB[i]);
    }
    return result === 0 && a.length === b.length;
}

async function rateLimit(request, env, key_prefix, limit = 10, windowSeconds = 60) {
    const ip = request.headers.get("CF-Connecting-IP") || "anonymous";
    const key = `rl:${key_prefix}:${ip}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    // Get current rate data
    let data = await env.HIVEMIND_KV.get(key, { type: "json" }) || { count: 0, firstSeen: now };
    
    // Reset if window has passed
    if (data.firstSeen < windowStart) {
        data = { count: 1, firstSeen: now };
    } else {
        data.count++;
    }

    // Update KV (set expiration to clear old limits)
    await env.HIVEMIND_KV.put(key, JSON.stringify(data), { expirationTtl: windowSeconds * 2 });

    return data.count > limit;
}

// ===============================================================
// CRYPTOGRAPHIC JWT HELPERS (Web Crypto API)
// ===============================================================

function base64UrlEncode(arrayBuffer) {
    const uint8Array = new Uint8Array(arrayBuffer);
    let base64 = btoa(String.fromCharCode.apply(null, uint8Array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(base64Url) {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) { base64 += '='; }
    const charStr = atob(base64);
    const uint8Array = new Uint8Array(charStr.length);
    for (let i = 0; i < charStr.length; i++) {
        uint8Array[i] = charStr.charCodeAt(i);
    }
    return uint8Array;
}

async function getHMACKey(secretStr) {
    const enc = new TextEncoder();
    return await crypto.subtle.importKey(
        'raw', 
        enc.encode(secretStr), 
        { name: 'HMAC', hash: 'SHA-256' }, 
        false, 
        ['sign', 'verify']
    );
}

async function signJWT(payload, secret) {
    const enc = new TextEncoder();
    const header = { alg: "HS256", typ: "JWT" };
    
    const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
    const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
    
    const dataToSign = `${headerB64}.${payloadB64}`;
    const key = await getHMACKey(secret);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
    const signatureB64 = base64UrlEncode(signatureBuffer);
    
    return `${headerB64}.${payloadB64}.${signatureB64}`;
}

async function verifyJWT(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [headerB64, payloadB64, signatureB64] = parts;
    const dataToVerify = `${headerB64}.${payloadB64}`;
    
    const key = await getHMACKey(secret);
    const signatureBuffer = base64UrlDecode(signatureB64);
    const enc = new TextEncoder();
    
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBuffer, enc.encode(dataToVerify));
    if (!isValid) return null;
    
    try {
        const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
        return JSON.parse(payloadStr);
    } catch(e) {
        return null;
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS — Restrict to known origins (OWASP A05)
        // NOTE: Game sites serve over HTTP only — extension injects on those pages.
        // Admin panel is HTTPS-only.
        const ALLOWED_ORIGINS = [
            "http://s1.antzzz.org",
            "http://s2.antzzz.org",
            "http://s3.antzzz.org",
            "http://www.antzzz.org",
            "https://s1.antzzz.org",
            "https://s2.antzzz.org",
            "https://s3.antzzz.org",
            "https://www.antzzz.org",
            "http://s1.fourmizzz.fr",
            "http://s2.fourmizzz.fr",
            "http://s3.fourmizzz.fr",
            "http://www.fourmizzz.fr",
            "https://s1.fourmizzz.fr",
            "https://s2.fourmizzz.fr",
            "https://s3.fourmizzz.fr",
            "https://www.fourmizzz.fr",
            "https://hivemind-admin.pages.dev"
        ];
        const requestOrigin = request.headers.get("Origin") || "";
        const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin) || 
                          requestOrigin.startsWith("http://localhost:") || 
                          requestOrigin.startsWith("http://127.0.0.1:") || 
                          requestOrigin === "null";
        const allowedOrigin = isAllowed ? requestOrigin : "null";

        const corsHeaders = {
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        // Handle preflight
        if (method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // Fast rejection for disallowed origins (except direct server requests without Origin headers)
        if (requestOrigin && !isAllowed) {
            return new Response("CORS Origin Not Allowed", { status: 403 });
        }

        try {
            // Route: POST /auth (OWASP A07: Identification and Authentication Failures)
            if (path === "/auth" && method === "POST") {
                // Rate limit authentication attempts
                const isRateLimited = await rateLimit(request, env, "auth", 10, 60);
                if (isRateLimited) {
                    return jsonResponse({ error: "Too many attempts. Chill out." }, 429, corsHeaders);
                }
                return await handleAuth(request, env, corsHeaders);
            }

            // Route: POST /intel (OWASP A01 — now requires auth)
            if (path === "/intel" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleIntelSubmit);
            }

            // Route: GET /intel/list (Admin only - all players)
            if (path === "/intel/list" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, env, cors) => 
                    withCache(req, env, ctx, cors, handleListIntel)
                );
            }

            // Route: GET /intel/:id (legacy — OWASP A01: now requires auth)
            const legacyMatch = path.match(/^\/intel\/([a-zA-Z0-9_\-\.\s]+)$/);
            if (legacyMatch && method === "GET") {
                const targetId = decodeURIComponent(legacyMatch[1]);
                const reservedPaths = ["list", "batch", "report", "reports", "diplomacy", "alliances", "coords", "player"];
                if (!reservedPaths.includes(targetId.toLowerCase())) {
                    return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => 
                        withCache(req, e, ctx, c, (r, env_r, c_r) => handleGetPlayerIntel(r, targetId, env_r, c_r))
                    );
                }
            }

            // Route: POST /lock (OWASP A01 — now requires auth)
            if (path === "/lock" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleLockAcquire);
            }

            // Route: GET /lock/:id (OWASP A01 — now requires auth)
            if (path.startsWith("/lock/") && method === "GET") {
                const targetId = path.split("/")[2];
                return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => handleLockCheck(req, targetId, e, c));
            }

            // Route: DELETE /lock/:id (OWASP A01 — now requires auth)
            if (path.startsWith("/lock/") && method === "DELETE") {
                const targetId = path.split("/")[2];
                return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => handleLockRelease(targetId, e, c));
            }

            // ===== HF TRACKER ROUTES =====

            // Route: POST /hf/submit - Batch submit HF snapshots
            if (path === "/hf/submit" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleHFSubmit);
            }

            // Route: GET /hf/history/:player (OWASP A01 — now requires auth)
            if (path.startsWith("/hf/history/") && method === "GET") {
                const player = decodeURIComponent(path.split("/")[3]);
                return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => handleHFHistory(req, player, e, c));
            }

            // Route: GET /hf/latest (OWASP A01 — now requires auth)
            if (path === "/hf/latest" && method === "GET") {
                return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleHFLatest)
                );
            }

            // ===== IAM (Identity & Access Management) ROUTES =====

            // Route: GET /admin/iam/admins (Root Only)
            if (path === "/admin/iam/admins" && method === "GET") {
                return await withSuperAdminAuth(request, env, corsHeaders, handleListAdmins);
            }

            // Route: POST /admin/iam/admins (Root Only)
            if (path === "/admin/iam/admins" && method === "POST") {
                return await withSuperAdminAuth(request, env, corsHeaders, handleAddAdmin);
            }

            // Route: DELETE /admin/iam/admins (Root Only)
            if (path === "/admin/iam/admins" && method === "DELETE") {
                return await withSuperAdminAuth(request, env, corsHeaders, handleRevokeAdmin);
            }

            // ===== INTEL ROUTES =====

            // Route: POST /intel/report - Submit parsed combat report
            if (path === "/intel/report" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleIntelReport);
            }

            // Route: GET /intel/player/:name (OWASP A01 — now requires auth)
            if (path.startsWith("/intel/player/") && method === "GET") {
                const player = decodeURIComponent(path.split("/")[3]);
                return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, (req_r, env_r, cors_r) => handleGetPlayerIntel(req_r, player, env_r, cors_r))
                );
            }

            // Route: POST /intel/batch - Bulk ingest player intel
            if (path === "/intel/batch" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleBatchIntel);
            }

            // Route: POST /intel/reports/batch - Bulk ingest combat reports
            if (path === "/intel/reports/batch" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleBatchReports);
            }

            // Route: POST /intel/diplomacy - Ingest Pacts and Wars
            if (path === "/intel/diplomacy" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleIntelDiplomacy);
            }

            // Route: GET /intel/diplomacy/list - Fetch official Council diplomacy
            if (path === "/intel/diplomacy/list" && method === "GET") {
                return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetDiplomacy)
                );
            }

            // ===== ADMIN ROUTES =====
            
            // Route: POST /admin/auth
            if (path === "/admin/auth" && method === "POST") {
                const isRateLimited = await rateLimit(request, env, "admin_auth", 5, 300);
                if (isRateLimited) {
                    return await jsonResponse({ error: "Too many admin attempts. IP locked out for 5 minutes." }, 429, corsHeaders);
                }
                return await handleAdminAuth(request, env, corsHeaders);
            }

            // Route: GET /admin/tokens
            if (path === "/admin/tokens" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, handleGetTokens);
            }

            // Route: POST /admin/token/create
            if (path === "/admin/token/create" && method === "POST") {
                return await withAdminAuth(request, env, corsHeaders, handleCreateToken);
            }

            // Route: DELETE /admin/token/:id
            if (path.startsWith("/admin/token/") && method === "DELETE") {
                const tokenId = path.split("/")[3];
                return await withAdminAuth(request, env, corsHeaders, (req, env, cors) => 
                    handleDeleteToken(tokenId, env, cors)
                );
            }

            // Route: GET /admin/logs
            if (path === "/admin/logs" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetLogs)
                );
            }

            // Route: GET /admin/roster
            if (path === "/admin/roster" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, handleGetRoster);
            }

            // Route: POST /admin/roster
            if (path === "/admin/roster" && method === "POST") {
                return await withAdminAuth(request, env, corsHeaders, handlePostRoster);
            }

            // Route: GET /admin/economy
            if (path === "/admin/economy" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetEconomy)
                );
            }

            // Route: GET /admin/alliances
            if (path === "/admin/alliances" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetAlliances)
                );
            }

            // Route: GET /admin/alliances/history
            if (path === "/admin/alliances/history" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetAlliancesHistory)
                );
            }

            // Route: GET /admin/diplomacy
            if (path === "/admin/diplomacy" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetDiplomacy)
                );
            }

            // Route: POST /admin/diplomacy
            if (path === "/admin/diplomacy" && method === "POST") {
                return await withAdminAuth(request, env, corsHeaders, handlePostDiplomacy);
            }

            // Route: GET /intel/diplomacy/discovery
            if (path === "/intel/diplomacy/discovery" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetDiplomacyDiscovery)
                );
            }

            // Route: GET /admin/players/history - Player Rankings historical snapshots
            if (path === "/admin/players/history" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetPlayersHistory)
                );
            }

            // Route: POST /intel/alliances
            if (path === "/intel/alliances" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleIntelAlliances);
            }

            // Route: POST /intel/coords - Ingest newly harvested map coordinates
            if (path === "/intel/coords" && method === "POST") {
                return await withPlayerAuth(request, env, corsHeaders, handleIntelCoords);
            }

            // Route: GET /admin/players/coords
            if (path === "/admin/players/coords" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetCoords)
                );
            }

            // Route: GET /intel/coords/list - Player-auth accessible coords (for extension ServerMap)
            if (path === "/intel/coords/list" && method === "GET") {
                return await withPlayerAuth(request, env, corsHeaders, (req, e, c) => 
                    withCache(req, e, ctx, c, handleGetCoords)
                );
            }

            // Route: GET /flood-finder - Targets for extension
            if (path === "/flood-finder" && method === "GET") {
                return await withPlayerAuth(request, env, corsHeaders, handleGetFloodFinder);
            }

            // Route: GET /admin/flood-finder - Management fetch
            if (path === "/admin/flood-finder" && method === "GET") {
                return await withAdminAuth(request, env, corsHeaders, handleGetFloodFinder);
            }

            // Route: POST /admin/flood-finder - Management update
            if (path === "/admin/flood-finder" && method === "POST") {
                return await withAdminAuth(request, env, corsHeaders, handlePostFloodFinder);
            }

            // 404
            return await jsonResponse({ error: "Not found" }, 404, corsHeaders);

        } catch (err) {
            console.error("Worker 500 Error:", err.stack || err.message || err);
            return await jsonResponse({ error: err.message, stack: err.stack }, 500, corsHeaders);
        }
    }
};

// ===============================================================
// AUTH
// ===============================================================

async function handleAuth(request, env, corsHeaders) {
    const body = await request.json();
    const { ign, key } = body;

    if (!ign || !key) {
        return await jsonResponse({ error: "Missing ign or key" }, 400, corsHeaders);
    }

    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    // SECURITY UPDATE: Account-based lockout per IGN
    const lockoutKey = `lockout::ign::${ign.toLowerCase()}`;
    const lockedUntil = parseInt(await env.HIVEMIND_KV.get(lockoutKey) || "0");
    if (Date.now() < lockedUntil) {
        return await jsonResponse({ error: "Account temporarily locked due to repeated failures." }, 423, corsHeaders);
    }

    // OWASP A07 — Rate Limiting (5 attempts per 5 minutes per IP)
    const rateKey = `rate::auth::${clientIP}`;
    const attempts = parseInt(await env.HIVEMIND_KV.get(rateKey) || "0");
    if (attempts >= 5) {
        await logEvent(env, "auth_rate_limited", { ip: clientIP, ign });
        return await jsonResponse({ error: "Too many attempts. Try again in 5 minutes." }, 429, corsHeaders);
    }

    // 1. Check Root Access (Super Admin)
    if (env.ROOT_KEY && await constantTimeCompare(key, env.ROOT_KEY)) {
        const payload = {
            ign: ign,
            role: "root",
            iat: Math.floor(Date.now() / 1000),
            exp: Date.now() + (12 * 60 * 60 * 1000) // 12hr root session
        };
        const token = await signJWT(payload, env.ALLIANCE_KEY);
        await logEvent(env, "auth_success_root", { ign, ip: clientIP });
        return await jsonResponse({ token, ign, role: "root" }, 200, corsHeaders);
    }

    // 2. Check Admin Access (Individual Admin Keys)
    const adminKeyData = await env.HIVEMIND_KV.get(`iam::admins::${key}`, { type: "json" });
    if (adminKeyData) {
        const payload = {
            ign: ign,
            role: "admin",
            iat: Math.floor(Date.now() / 1000),
            exp: Date.now() + (24 * 60 * 60 * 1000) // 24hr admin session
        };
        const token = await signJWT(payload, env.ALLIANCE_KEY);
        await logEvent(env, "auth_success_admin", { ign, ip: clientIP });
        return await jsonResponse({ token, ign, role: "admin" }, 200, corsHeaders);
    }

    // 3. Validate Individualized Player Tokens
    const tokenKey = `token::${key}`;
    const tokenDataStr = await env.HIVEMIND_KV.get(tokenKey);

    if (!tokenDataStr) {
        // Track consecutive failures for account lockout
        const failKey = `fails::ign::${ign.toLowerCase()}`;
        const fails = parseInt(await env.HIVEMIND_KV.get(failKey) || "0") + 1;
        if (fails >= 5) {
            await env.HIVEMIND_KV.put(lockoutKey, String(Date.now() + 900000)); // 15 min lockout
            await env.HIVEMIND_KV.delete(failKey);
            await logEvent(env, "auth_account_locked", { ign, ip: clientIP });
        } else {
            await env.HIVEMIND_KV.put(failKey, String(fails), { expirationTtl: 3600 });
        }

        // Increment rate limit on failure (IP-based)
        await env.HIVEMIND_KV.put(rateKey, String(attempts + 1), { expirationTtl: 300 });
        // OWASP A09 — Log failed auth attempts
        await logEvent(env, "auth_failure", { ign, reason: "invalid_token", ip: clientIP });
        // Wait 500ms to prevent strict timing attacks on key discovery
        await new Promise(r => setTimeout(r, 500));
        return await jsonResponse({ error: "Invalid or Revoked Token" }, 401, corsHeaders);
    }

    // Reset failure counter on success
    await env.HIVEMIND_KV.delete(`fails::ign::${ign.toLowerCase()}`);

    const tokenData = JSON.parse(tokenDataStr);

    // Verify the Token belongs strictly to the requested IGN
    // SECURITY UPDATE: Using constantTimeCompare to prevent timing leaks on IGN metadata
    const isOwner = await constantTimeCompare(tokenData.ign.toLowerCase(), ign.toLowerCase());
    if (!isOwner) {
        await env.HIVEMIND_KV.put(rateKey, String(attempts + 1), { expirationTtl: 300 });
        await logEvent(env, "auth_ign_mismatch", { attempted_ign: ign, owner_ign: tokenData.ign, ip: clientIP });
        return await jsonResponse({ error: "Token does not belong to this IGN" }, 403, corsHeaders);
    }

    // Check ban list just in case
    const whitelistKey = `whitelist::${ign.toLowerCase()}`;
    const whitelistEntry = await env.HIVEMIND_KV.get(whitelistKey);
    if (whitelistEntry) {
        const userData = JSON.parse(whitelistEntry);
        if (userData.status === "banned") {
            return await jsonResponse({ error: "Access revoked." }, 403, corsHeaders);
        }
    }

    // Secure HMAC-SHA256 Session Token Generation
    const sessionPayload = {
        ign: tokenData.ign,
        role: tokenData.role || "member",
        tid: key, // Token ID for real-time revocation check
        exp: Date.now() + 86400000 // 24 hours
    };
    
    // signJWT is defined at the top of the Worker
    const token = await signJWT(sessionPayload, env.ALLIANCE_KEY);

    return await jsonResponse({ token, ign: tokenData.ign, role: tokenData.role || "member" }, 200, corsHeaders);
}

// ===============================================================
// INTEL
// ===============================================================

async function handleIntelSubmit(request, env, corsHeaders) {
    const body = await request.json();
    const { targetId, data, submittedBy } = body;

    if (!targetId || !data) {
        return await jsonResponse({ error: "Missing targetId or data" }, 400, corsHeaders);
    }

    // Validation: prevent obviously fake data
    if (data.tdc && data.tdc > 500000000) {
        return await jsonResponse({ error: "TDC value too high" }, 400, corsHeaders);
    }

    const intelKey = `intel::${targetId}`;
    const intelData = {
        ...data,
        updated_at: Date.now(),
        updated_by: submittedBy || "unknown"
    };

    await env.HIVEMIND_KV.put(intelKey, JSON.stringify(intelData));

    return await jsonResponse({ success: true }, 200, corsHeaders);
}



async function handleIntelGet(targetId, env, corsHeaders) {
    const intelKey = `intel::${targetId}`;
    const data = await env.HIVEMIND_KV.get(intelKey);

    if (!data) {
        return await jsonResponse({ error: "No intel found" }, 404, corsHeaders);
    }

    return await jsonResponse(JSON.parse(data), 200, corsHeaders);
}

// ===============================================================
// LOCKS
// ===============================================================

async function handleLockAcquire(request, env, corsHeaders) {
    const body = await request.json();
    const { targetId, targetName, lockedBy } = body;

    if (!targetId || !lockedBy) {
        return await jsonResponse({ error: "Missing targetId or lockedBy" }, 400, corsHeaders);
    }

    const lockKey = `lock::${targetId}`;
    
    // Check if already locked
    const existing = await env.HIVEMIND_KV.get(lockKey);
    if (existing) {
        const lockData = JSON.parse(existing);
        // Check if expired (1 hour)
        if (Date.now() - lockData.locked_at < 3600000) {
            return await jsonResponse({ 
                error: "Target already locked",
                lockedBy: lockData.locked_by,
                locked_at: lockData.locked_at
            }, 409, corsHeaders);
        }
    }

    const lockData = {
        target_name: targetName || targetId,
        locked_by: lockedBy,
        locked_at: Date.now()
    };

    // Set with 1 hour TTL
    await env.HIVEMIND_KV.put(lockKey, JSON.stringify(lockData), { expirationTtl: 3600 });

    return await jsonResponse({ success: true, lock: lockData }, 200, corsHeaders);
}

async function handleLockCheck(request, targetId, env, corsHeaders) {
    const lockKey = `lock::${targetId}`;
    const data = await env.HIVEMIND_KV.get(lockKey);

    if (!data) {
        return await jsonResponse({ locked: false }, 200, corsHeaders, request);
    }

    return await jsonResponse({ locked: true, ...JSON.parse(data) }, 200, corsHeaders, request);
}

async function handleLockRelease(targetId, env, corsHeaders) {
    const lockKey = `lock::${targetId}`;
    await env.HIVEMIND_KV.delete(lockKey);

    return await jsonResponse({ success: true }, 200, corsHeaders);
}

// ===============================================================
// HF TRACKER
// ===============================================================

/**
 * Batch submit HF snapshots for multiple players.
 * Called by extension after scraping alliance member page / rankings.
 * 
 * Body: { players: [{name, hf}], source: "alliance_members", submittedBy: "Raydonia" }
 * 
 * Storage: KV key "hf::{playerName}" → JSON array of {hf, ts, by, src}
 *   - Max 500 entries per player (rolling window)
 *   - 90-day TTL per entry set
 */
async function handleHFSubmit(request, env, corsHeaders) {
    const body = await request.json();
    const { players, source, submittedBy } = body;

    if (!players || !Array.isArray(players) || players.length === 0) {
        return await jsonResponse({ error: "Missing players array" }, 400, corsHeaders);
    }

    const now = Date.now();
    let updated = 0;

    // Load existing consolidated batch
    let batchData = {};
    const existingBatch = await env.HIVEMIND_KV.get("hf_latest_batch");
    if (existingBatch) {
        try { batchData = JSON.parse(existingBatch); } catch(e) { batchData = {}; }
    }

    for (const p of players) {
        if (!p.name || p.hf === undefined) continue;

        const lowerName = p.name.toLowerCase();

        // Compute prev_hf from existing batch data
        const prevEntry = batchData[lowerName];
        const prevHF = prevEntry ? prevEntry.hf : null;

        // Deduplicate: skip if same HF within last 30 minutes
        if (prevEntry && prevEntry.hf === p.hf && (now - prevEntry.ts) < 1800000) {
            continue;
        }

        // Update the consolidated batch entry
        batchData[lowerName] = {
            name: p.name,
            hf: p.hf,
            prev_hf: prevHF,
            ts: now,
            by: submittedBy || "unknown"
        };

        updated++;
    }

    // Single KV write for all latest snapshots
    await env.HIVEMIND_KV.put("hf_latest_batch", JSON.stringify(batchData), { expirationTtl: 7776000 });

    await logEvent(env, "hf_submit", { count: updated, source, submittedBy });

    return await jsonResponse({ success: true, updated }, 200, corsHeaders);
}

/**
 * Get HF history for a specific player.
 * Checks the consolidated batch for latest data.
 */
async function handleHFHistory(request, player, env, corsHeaders) {
    const historyKey = `hf::history::${player.toLowerCase()}`;
    const historyStr = await env.HIVEMIND_KV.get(historyKey);
    let history = [];
    if (historyStr) {
        try {
            history = JSON.parse(historyStr);
        } catch(e) { /* ignore */ }
    }

    return await jsonResponse({ player, history }, 200, corsHeaders, request);
}

/**
 * Get latest HF for all tracked players.
 * Reads from consolidated batch key (primary) and merges legacy individual keys.
 */
async function handleHFLatest(request, env, corsHeaders) {
    const playerMap = {};

    // Primary: Read from consolidated batch (single KV read)
    const batchRaw = await env.HIVEMIND_KV.get("hf_latest_batch");
    if (batchRaw) {
        try {
            const batch = JSON.parse(batchRaw);
            for (const [key, entry] of Object.entries(batch)) {
                playerMap[key] = entry;
            }
        } catch(e) { /* ignore corrupt data */ }
    }

    // Fallback: Also check legacy individual keys (for data written before this refactor)
    const list = await env.HIVEMIND_KV.list({ prefix: "hf_latest::" });
    for (const key of list.keys) {
        const lowerName = key.name.replace("hf_latest::", "");
        // Only use legacy key if we don't already have a newer entry from batch
        if (!playerMap[lowerName]) {
            const data = await env.HIVEMIND_KV.get(key.name);
            if (data) {
                try { playerMap[lowerName] = JSON.parse(data); } catch(e) { /* skip */ }
            }
        }
    }

    const players = Object.values(playerMap);

    // Sort by HF descending
    players.sort((a, b) => b.hf - a.hf);

    return await jsonResponse({ players }, 200, corsHeaders);
}

// ===============================================================
// ENEMY INTEL
// ===============================================================

/**
 * Store a parsed combat report.
 * Called by extension when a user views a battle report.
 * 
 * Body: {
 *   attacker: { name, troops: {unitIdx: count, ...}, losses: {...} },
 *   defender: { name, troops: {...}, losses: {...} },
 *   hfStolen: number, outcome: string,
 *   submittedBy: string
 * }
 * 
 * Storage: KV key "intel::{playerName}" → array of report summaries (max 100)
 */
async function handleIntelReport(request, env, corsHeaders) {
    const body = await request.json();
    const { attacker, defender, hfStolen, outcome, submittedBy, techLevels } = body;

    if (!attacker?.name && !defender?.name) {
        return await jsonResponse({ error: "Missing player names" }, 400, corsHeaders);
    }

    const now = Date.now();
    let updated = 0;

    // Store intel for both attacker and defender
    const entries = [];
    if (attacker?.name) {
        entries.push({
            player: attacker.name,
            role: "attacker",
            troops: attacker.troops || {},
            losses: attacker.losses || {},
            tech: techLevels?.attacker || null
        });
    }
    if (defender?.name) {
        entries.push({
            player: defender.name,
            role: "defender",
            troops: defender.troops || {},
            losses: defender.losses || {},
            tech: techLevels?.defender || null
        });
    }

    const globalKey = "intel::combat_reports";
    let allReports = Object.create(null);
    const raw = await env.HIVEMIND_KV.get(globalKey);
    if (raw) {
        try { allReports = JSON.parse(raw); } catch(e) { allReports = Object.create(null); }
    }

    for (const entry of entries) {
        const playerKey = entry.player.toLowerCase();
        if (!allReports[playerKey]) allReports[playerKey] = [];
        let reports = allReports[playerKey];

        // Dedup: skip if same report was submitted within last 5 minutes
        const last = reports[reports.length - 1];
        if (last && (now - last.ts) < 300000 && last.role === entry.role) {
            continue;
        }

        reports.push({
            role: entry.role,
            troops: entry.troops,
            losses: entry.losses,
            tech: entry.tech || null,
            hfStolen: hfStolen || 0,
            outcome: outcome || "UNKNOWN",
            by: submittedBy || "unknown",
            ts: now
        });

        // Cap at 100 reports per player
        if (reports.length > 100) reports = reports.slice(-100);
        
        allReports[playerKey] = reports;
        updated++;
    }

    if (updated > 0) {
        await env.HIVEMIND_KV.put(globalKey, JSON.stringify(allReports), { expirationTtl: 7776000 });
    }

    await logEvent(env, "intel_report", { attacker: attacker?.name, defender: defender?.name, outcome, hfStolen, submittedBy });

    return await jsonResponse({ success: true, updated }, 200, corsHeaders);
}

// ==== BATCH COMBAT REPORTS ====
// Accepts an array of reports and consolidates KV writes per unique player
async function handleBatchReports(request, env, corsHeaders) {
    const body = await request.json();
    const { reports, submittedBy } = body;

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
        return await jsonResponse({ error: "Missing reports array" }, 400, corsHeaders);
    }

    const now = Date.now();

    // Group all report entries by player name (in-memory)
    const playerReports = Object.create(null); // { playerKey: [{ role, troops, losses, tech, hfStolen, outcome, by, ts }] }

    for (const report of reports) {
        const { attacker, defender, hfStolen, outcome, techLevels } = report;

        if (attacker?.name) {
            const key = attacker.name.toLowerCase();
            if (!playerReports[key]) playerReports[key] = [];
            playerReports[key].push({
                role: "attacker",
                troops: attacker.troops || {},
                losses: attacker.losses || {},
                tech: techLevels?.attacker || null,
                hfStolen: hfStolen || 0,
                outcome: outcome || "UNKNOWN",
                by: submittedBy || "unknown",
                ts: now
            });
        }

        if (defender?.name) {
            const key = defender.name.toLowerCase();
            if (!playerReports[key]) playerReports[key] = [];
            playerReports[key].push({
                role: "defender",
                troops: defender.troops || {},
                losses: defender.losses || {},
                tech: techLevels?.defender || null,
                hfStolen: hfStolen || 0,
                outcome: outcome || "UNKNOWN",
                by: submittedBy || "unknown",
                ts: now
            });
        }
    }

    // O(1) Unified Combat Reports Cache
    let updated = 0;
    const globalKey = "intel::combat_reports";
    let allReports = Object.create(null);
    
    const raw = await env.HIVEMIND_KV.get(globalKey);
    if (raw) {
        try { allReports = JSON.parse(raw); } catch(e) { allReports = Object.create(null); }
    }

    for (const [playerKey, newEntries] of Object.entries(playerReports)) {
        if (!allReports[playerKey]) allReports[playerKey] = [];
        
        allReports[playerKey].push(...newEntries);

        // Cap at 100 reports per player
        if (allReports[playerKey].length > 100) {
            allReports[playerKey] = allReports[playerKey].slice(-100);
        }
        updated++;
    }

    // Exactly 1 KV Write operation instead of N
    await env.HIVEMIND_KV.put(globalKey, JSON.stringify(allReports), { expirationTtl: 7776000 });

    await logEvent(env, "intel_batch_reports", { reportCount: reports.length, playersUpdated: updated, submittedBy });

    return await jsonResponse({ success: true, reports: reports.length, playersUpdated: updated }, 200, corsHeaders);
}

/**
 * Compact snapshots by keeping only the most recent entry per time bucket.
 * @param {Array} snapshots - Array of {timestamp, data} objects (sorted newest-first)
 * @param {number} bucketMs - Bucket size in milliseconds (86400000 = 1 day, 604800000 = 1 week)
 * @returns {Array} Compacted snapshots, one per bucket, newest-first
 */
function compactByPeriod(snapshots, bucketMs) {
    if (snapshots.length === 0) return [];
    const buckets = new Map();
    for (const snap of snapshots) {
        const bucketKey = Math.floor(snap.timestamp / bucketMs);
        // Keep the first (most recent, since sorted newest-first) per bucket
        if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, snap);
        }
    }
    // Return sorted newest-first
    return Array.from(buckets.values()).sort((a, b) => b.timestamp - a.timestamp);
}

// ==== BATCH INTEL (Unified Player Intelligence) ====
async function handleBatchIntel(request, env, corsHeaders) {
    const payload = await request.json();
    
    // Support both old raw array and new object payload
    const list = Array.isArray(payload) ? payload : payload.players;
    const submittedBy = payload.submittedBy || "rankings_scraper";
    
    if (!list || !Array.isArray(list) || !list.length) {
        return await jsonResponse({ error: "No data or invalid array" }, 400, corsHeaders);
    }

    // OWASP A08 — Payload size limit to prevent resource exhaustion
    if (list.length > 200) {
        return await jsonResponse({ error: "Payload too large. Max 200 entries per batch." }, 413, corsHeaders);
    }

    const now = Date.now();
    let processedCount = 0;

    // 1. Build the snapshot array for this scrape
    const snapshotData = [];
    
    // Also maintain the legacy rankings batch for backwards compat
    const batchKey = `intel::rankings_batch`;
    let globalRankings = {};
    const existingStr = await env.HIVEMIND_KV.get(batchKey);
    if (existingStr) {
        try { globalRankings = JSON.parse(existingStr); } catch (e) {}
    }

    for (const playerStats of list) {
        if (!playerStats.name) continue;

        const targetId = playerStats.name.replace(/\s+/g, '_').toLowerCase();
        
        // Merge with existing legacy data to avoid flickering (inherit non-zero values)
        const oldEntry = globalRankings[targetId];
        const entry = {
            name: playerStats.name,
            alliance: playerStats.alliance !== undefined ? playerStats.alliance : (oldEntry ? oldEntry.alliance : ""),
            rank: playerStats.rank || (oldEntry ? oldEntry.rank : 0),
            hf: playerStats.hf || (oldEntry ? oldEntry.hf : 0),
            tech: playerStats.tech || (oldEntry ? oldEntry.tech : 0),
            anthill: playerStats.anthill || (oldEntry ? oldEntry.anthill : 0),
            fight: playerStats.fight || (oldEntry ? oldEntry.fight : 0),
            ts: now
        };
        
        snapshotData.push(entry);
        globalRankings[targetId] = entry;
        processedCount++;
    }

    // 2. Write legacy batch (1 KV write)
    await env.HIVEMIND_KV.put(batchKey, JSON.stringify(globalRankings));

    // 3. Append to historical snapshots (same pattern as Alliance Rankings)
    const historyKey = "stats::players::history";
    let history = [];
    const existingHistory = await env.HIVEMIND_KV.get(historyKey);
    if (existingHistory) {
        try { history = JSON.parse(existingHistory); } catch(e) { history = []; }
    }

    if (history.length === 0) {
        history.unshift({ timestamp: now, data: snapshotData });
    } else {
        const lastSnapshot = history[0];
        const elapsed = now - lastSnapshot.timestamp;
        const SIX_HOURS = 21600000;
        const TWELVE_HOURS = 43200000;

        // Create a new snapshot if enough time has passed:
        //  - >=20 players batch + 6h gap (alliance scrapes)
        //  - Any batch + 12h gap (catch-all)
        const shouldCreateNew = (list.length >= 20 && elapsed > SIX_HOURS) || elapsed > TWELVE_HOURS;

        // Always merge incoming data into the latest snapshot first (ensures latest view is current)
        let mergedMap = new Map();
        for (let p of lastSnapshot.data) {
            if (p.name) mergedMap.set(p.name.toLowerCase(), p);
        }
        for (let p of snapshotData) {
            if (p.name) {
                let old = mergedMap.get(p.name.toLowerCase());
                if (old) {
                    // Inherit old non-zero values when new payload has 0 or is missing
                    if (p.hf === 0 && old.hf > 0) p.hf = old.hf;
                    if (p.tech === 0 && old.tech > 0) p.tech = old.tech;
                    if (p.anthill === 0 && old.anthill > 0) p.anthill = old.anthill;
                    if (p.fight === 0 && old.fight > 0) p.fight = old.fight;
                    if (p.rank === 0 && old.rank > 0) p.rank = old.rank;
                    // Removed: if (!p.alliance && old.alliance) p.alliance = old.alliance;
                    // If p.alliance is undefined/empty, it means they are currently unaligned or not in this scrape.
                }
                mergedMap.set(p.name.toLowerCase(), p);
            }
        }
        const mergedData = Array.from(mergedMap.values());

        // Update latest snapshot in-place
        lastSnapshot.data = mergedData;

        if (shouldCreateNew) {
            // Freeze the merged data as a new timestamped snapshot
            history.unshift({ timestamp: now, data: mergedData });

            // === TIERED COMPACTION ===
            // Keep full resolution for last 7 days (~28 snapshots at 6h intervals)
            // Compact to 1/day for 8-90 days (~83 snapshots)
            // Compact to 1/week for 90+ days (~40 snapshots for a year)
            // Total: ~150 snapshots covering ~1 year of data
            const SEVEN_DAYS = 604800000;
            const NINETY_DAYS = 7776000000;

            const recent = [];   // Last 7 days: keep all
            const medium = [];   // 8-90 days: keep best per day
            const archive = [];  // 90+ days: keep best per week

            for (const snap of history) {
                const age = now - snap.timestamp;
                if (age <= SEVEN_DAYS) {
                    recent.push(snap);
                } else if (age <= NINETY_DAYS) {
                    medium.push(snap);
                } else {
                    archive.push(snap);
                }
            }

            // Compact medium tier: keep 1 snapshot per calendar day
            const mediumCompacted = compactByPeriod(medium, 86400000); // 1 day in ms

            // Compact archive tier: keep 1 snapshot per calendar week
            const archiveCompacted = compactByPeriod(archive, 604800000); // 1 week in ms

            history = [...recent, ...mediumCompacted, ...archiveCompacted];
        }
    }
    await env.HIVEMIND_KV.put(historyKey, JSON.stringify(history));

    // 4. Also update the consolidated HF latest batch (feeds the HF Tracker)
    let hfBatch = {};
    const existingHfBatch = await env.HIVEMIND_KV.get("hf_latest_batch");
    if (existingHfBatch) {
        try { hfBatch = JSON.parse(existingHfBatch); } catch(e) { hfBatch = {}; }
    }
    for (const entry of snapshotData) {
        const lowerName = entry.name.toLowerCase();
        const prevHF = hfBatch[lowerName] ? hfBatch[lowerName].hf : null;
        hfBatch[lowerName] = {
            name: entry.name,
            hf: entry.hf,
            prev_hf: prevHF,
            ts: now,
            by: submittedBy
        };
    }
    await env.HIVEMIND_KV.put("hf_latest_batch", JSON.stringify(hfBatch), { expirationTtl: 7776000 });

    await logEvent(env, "intel_batch_uploaded", { count: processedCount });
    // NEW: Log as hf_submit so Admin Panel freshness and Activity tab pick it up
    await logEvent(env, "hf_submit", { 
        count: processedCount, 
        source: "alliance_members", 
        submittedBy: submittedBy 
    });

    return await jsonResponse({ success: true, processed: processedCount }, 200, corsHeaders);
}

// ==== GET PLAYER RANKINGS HISTORY ====
async function handleGetPlayersHistory(request, env, corsHeaders) {
    const historyKey = "stats::players::history";
    const data = await env.HIVEMIND_KV.get(historyKey);

    if (!data) {
        return await jsonResponse([], 200, corsHeaders);
    }

    try {
        return await jsonResponse(JSON.parse(data), 200, corsHeaders);
    } catch(e) {
        return await jsonResponse([], 200, corsHeaders);
    }
}

/**
 * Get aggregated intel for a player.
 * Returns best-known troop levels (max observed across all reports)
 * and recent report history.
 */
async function handleGetPlayerIntel(request, player, env, corsHeaders) {
    const playerKey = player.toLowerCase();
    let reports = [];

    // 1. Primary: Global Combat Reports Dictionary
    const globalKey = "intel::combat_reports";
    const globalStr = await env.HIVEMIND_KV.get(globalKey);
    if (globalStr) {
        try {
            const allReports = JSON.parse(globalStr);
            if (allReports[playerKey]) {
                reports = allReports[playerKey];
            }
        } catch(e) {}
    }

    // 2. Fallback: Legacy individual key (if global didn't have it)
    if (reports.length === 0) {
        const legacyKey = `intel::${playerKey}`;
        const legacyStr = await env.HIVEMIND_KV.get(legacyKey);
        if (legacyStr) {
            try { reports = JSON.parse(legacyStr); } catch(e) {}
        }
    }

    // Fetch batch rankings data (from the single KV blob)
    const batchKey = `intel::rankings_batch`;
    const batchStr = await env.HIVEMIND_KV.get(batchKey);
    let batchData = null;
    if (batchStr) {
        try {
            const globalRankings = JSON.parse(batchStr);
            batchData = globalRankings[player.toLowerCase()];
        } catch(e) {}
    }

    if (reports.length === 0 && !batchData) {
        return await jsonResponse({ player, known: false, troops: {}, reports: 0 }, 200, corsHeaders, request);
    }

    // Aggregate: take the MAXIMUM observed count for each unit type
    const maxTroops = {};
    let lastSeen = 0;

    // Aggregate tech levels
    let bestTech = { weapons: null, shield: null, anthill: null, nest: null, confidence: "none" };
    const confRank = { none: 0, estimated: 1, calculated: 2, ranking: 3 }; // 'ranking' is absolute truth for Anthill

    // 1. First process actual combat reports
    for (const r of reports) {
        for (const [unitIdx, count] of Object.entries(r.troops)) {
            if (!maxTroops[unitIdx] || count > maxTroops[unitIdx]) {
                maxTroops[unitIdx] = count;
            }
        }
        if (r.ts > lastSeen) lastSeen = r.ts;

        if (r.tech && (confRank[r.tech.confidence] || 0) > (confRank[bestTech.confidence] || 0)) {
            bestTech = { ...r.tech };
        } else if (r.tech) {
            if (r.tech.weapons !== null && bestTech.weapons === null) bestTech.weapons = r.tech.weapons;
            if (r.tech.shield !== null && bestTech.shield === null) bestTech.shield = r.tech.shield;
            if (r.tech.nest !== null && bestTech.nest === null) bestTech.nest = r.tech.nest;
            if (r.tech.dome !== null && bestTech.dome === null) bestTech.dome = r.tech.dome;
        }
    }

    // 2. Then merge in the guaranteed data from the ranking scraper
    if (batchData) {
        if (batchData.ts > lastSeen) lastSeen = batchData.ts;
        
        // Anthill level from rankings is 100% accurate
        if (batchData.anthill > 0) {
            bestTech.anthill = batchData.anthill;
            bestTech.confidence = "calculated";
            bestTech.techLevel = batchData.tech;
            bestTech.fightRating = batchData.fight;
            bestTech.alliance = batchData.alliance;
        }
        
        // Add a stub report so the UI shows it
        reports.push({
            ts: batchData.ts,
            troops: {},
            tech: { nest: batchData.anthill, techLevel: batchData.tech, fightRating: batchData.fight, alliance: batchData.alliance },
            source: "rankings_bot"
        });
    }

    return await jsonResponse({
        player,
        known: true,
        troops: maxTroops,
        tech: bestTech,
        reportsCount: reports.length,
        reports,
        lastSeen: reports.length ? reports[0].timestamp : (batchData ? batchData.timestamp : Date.now())
    }, 200, corsHeaders, request);
}

async function handleListIntel(request, env, corsHeaders) {
    // List all intel reports (prefix "intel_report::")
    const list = await env.HIVEMIND_KV.list({ prefix: "intel_report::", limit: 1000 });
    
    // Group by player
    const players = {};
    
    for (const key of list.keys) {
        const dataStr = await env.HIVEMIND_KV.get(key.name);
        if (!dataStr) continue;
        
        try {
            const report = JSON.parse(dataStr);
            const target = report.attacker.name;
            
            if (!players[target]) {
                players[target] = {
                    name: target,
                    lastSeen: 0,
                    reports: 0,
                    troops: {},
                    tech: { weapons: null, shield: null, nest: null, dome: null }
                };
            }
            
            players[target].reports++;
            if (report.timestamp > players[target].lastSeen) {
                players[target].lastSeen = report.timestamp;
            }
            
            // Max troops
            for (const [unit, count] of Object.entries(report.attacker.troops)) {
                if (!players[target].troops[unit] || count > players[target].troops[unit]) {
                    players[target].troops[unit] = count;
                }
            }
            
            // Best tech
            if (report.techLevels) {
                const confMap = { "calculated": 2, "estimated": 1, "none": 0 };
                const currentConf = confMap[players[target].tech.confidence || "none"];
                const newConf = confMap[report.techLevels.attacker.confidence || "none"];
                
                if (newConf > currentConf) {
                    players[target].tech = report.techLevels.attacker;
                } else if (newConf === currentConf) {
                    if (report.techLevels.attacker.weapons !== null && players[target].tech.weapons === null) players[target].tech.weapons = report.techLevels.attacker.weapons;
                    if (report.techLevels.attacker.shield !== null && players[target].tech.shield === null) players[target].tech.shield = report.techLevels.attacker.shield;
                    if (report.techLevels.attacker.nest !== null && players[target].tech.nest === null) players[target].tech.nest = report.techLevels.attacker.nest;
                    if (report.techLevels.attacker.dome !== null && players[target].tech.dome === null) players[target].tech.dome = report.techLevels.attacker.dome;
                }
            }
        } catch(e) {}
    }
    
    // Convert to array and sort by lastSeen descending
    const result = Object.values(players).sort((a, b) => b.lastSeen - a.lastSeen);
    
    return await jsonResponse({ list: result }, 200, corsHeaders);
}

// ===============================================================
// ECONOMY TRACKER (Business Intelligence)
// ===============================================================

async function handleGetEconomy(request, env, corsHeaders) {
    // Scan intel logs for robberies and loots
    const list = await env.HIVEMIND_KV.list({ prefix: "log::", limit: 1000 });
    
    let totalLooted = 0;   // HF we stole from enemies
    let totalRobbed = 0;   // HF enemies stole from us
    const recentEvents = [];

    for (const key of list.keys) {
        const dataStr = await env.HIVEMIND_KV.get(key.name);
        if (!dataStr) continue;

        try {
            const log = JSON.parse(dataStr);
            if (log.event === "intel_report" && log.hfStolen && log.hfStolen > 0) {
                // If outcome is VICTORY and attacker is TQC_SELF => Looted
                // If outcome is DEFEAT and defender is TQC_SELF => Robbed
                
                const isLoot = log.outcome === "VICTORY" && log.attacker === "TQC_SELF";
                const isRobbery = log.outcome === "DEFEAT" && log.defender === "TQC_SELF";

                if (isLoot) {
                    totalLooted += log.hfStolen;
                    recentEvents.push({ type: "loot", target: log.defender, amount: log.hfStolen, ts: log.timestamp, by: log.submittedBy });
                } else if (isRobbery) {
                    totalRobbed += log.hfStolen;
                    recentEvents.push({ type: "robbery", attacker: log.attacker, amount: log.hfStolen, ts: log.timestamp, by: log.submittedBy });
                }
            }
        } catch(e) {}
    }

    // Sort events by newest
    recentEvents.sort((a, b) => b.ts - a.ts);

    return await jsonResponse({
        totalLooted,
        totalRobbed,
        net: totalLooted - totalRobbed,
        recentEvents: recentEvents.slice(0, 50)
    }, 200, corsHeaders);
}

// ===============================================================
// ALLIANCE RANKINGS
// ===============================================================

async function handleIntelAlliances(request, env, corsHeaders) {
    const list = await request.json(); // array of alliances
    
    if (!list || !list.length) {
        return await jsonResponse({ error: "No data" }, 400, corsHeaders);
    }

    const latestKey = `stats::alliances::latest`;
    const historyKey = `stats::alliances::history`;
    const now = Date.now();
    
    // 1. Merge with existing "latest" data to accumulate pages
    let existingLatest = { data: [] };
    const latestStr = await env.HIVEMIND_KV.get(latestKey);
    if (latestStr) {
        try { existingLatest = JSON.parse(latestStr); } catch(e) {}
    }

    // Use a Map for O(1) lookups during merge
    const allianceMap = new Map();
    // Populate with existing data
    (existingLatest.data || []).forEach(a => allianceMap.set(a.name, a));
    // Overwrite/Add with new data
    list.forEach(a => allianceMap.set(a.name, a));

    // Convert back to array and sort by rank (ascending)
    const mergedData = Array.from(allianceMap.values()).sort((a, b) => (a.rank || 999) - (b.rank || 999));

    const snapshot = {
        timestamp: now,
        count: mergedData.length,
        data: mergedData
    };
    
    await env.HIVEMIND_KV.put(latestKey, JSON.stringify(snapshot));

    // 2. Update History
    let history = [];
    const historyData = await env.HIVEMIND_KV.get(historyKey);
    if (historyData) {
        try { history = JSON.parse(historyData); } catch(e) {}
    }
    
    // If the latest history entry is "fresh" (e.g. < 10 mins old), merge into it
    // instead of creating a new snapshot. This handles page-by-page scraping.
    const FRESH_THRESHOLD = 10 * 60 * 1000;
    if (history.length > 0 && (now - history[0].timestamp) < FRESH_THRESHOLD) {
        const hSnap = history[0];
        const hMap = new Map();
        (hSnap.data || []).forEach(a => hMap.set(a.name, a));
        list.forEach(a => hMap.set(a.name, a));
        hSnap.data = Array.from(hMap.values()).sort((a, b) => (a.rank || 999) - (b.rank || 999));
        hSnap.count = hSnap.data.length;
        hSnap.timestamp = now; // Update timestamp to newest
    } else {
        // Create a new snapshot but initialize it with the cumulative state 
        // to ensure history charts don't 'dip' if only one page is scraped.
        history.unshift(snapshot);
    }
    
    // Cap history
    if (history.length > 60) history = history.slice(0, 60);
    await env.HIVEMIND_KV.put(historyKey, JSON.stringify(history));

    // Log the event
    await logEvent(env, "intel_alliances", { count: list.length });

    return await jsonResponse({ success: true, stored: mergedData.length }, 200, corsHeaders);
}

async function handleGetAlliances(request, env, corsHeaders) {
    const key = `stats::alliances::latest`;
    const dataStr = await env.HIVEMIND_KV.get(key);

    if (!dataStr) {
        return await jsonResponse({ timestamp: 0, count: 0, data: [] }, 200, corsHeaders);
    }

    const payload = JSON.parse(dataStr);
    return await jsonResponse(payload, 200, corsHeaders);
}

async function handleGetAlliancesHistory(request, env, corsHeaders) {
    const key = `stats::alliances::history`;
    const dataStr = await env.HIVEMIND_KV.get(key);

    if (!dataStr) {
        return await jsonResponse([], 200, corsHeaders);
    }

    const history = Array.from(JSON.parse(dataStr)).reverse();
    return await jsonResponse(history, 200, corsHeaders);
}

// ===============================================================
// COORDINATE HARVESTER
// ===============================================================

async function handleIntelCoords(request, env, corsHeaders) {
    const data = await request.json();
    if (!Array.isArray(data)) {
        return await jsonResponse({ error: "Expected an array of coords" }, 400, corsHeaders);
    }

    const key = `intel::coords`;
    const existingStr = await env.HIVEMIND_KV.get(key);
    let coordsMap = {};

    if (existingStr) {
        try {
            coordsMap = JSON.parse(existingStr);
        } catch (e) {}
    }

    let added = 0;
    data.forEach(p => {
        if (p.name && typeof p.x === "number" && typeof p.y === "number") {
            const nameLower = p.name.toLowerCase();
            // Store mapping. If already exists, overwrite (though they don't change, just in case).
            coordsMap[nameLower] = { name: p.name, x: p.x, y: p.y };
            added++;
        }
    });

    if (added > 0) {
        await env.HIVEMIND_KV.put(key, JSON.stringify(coordsMap));
        await logEvent(env, "intel_coords", { added_count: added });
    }

    return await jsonResponse({ success: true, added }, 200, corsHeaders);
}

async function handleGetCoords(request, env, corsHeaders) {
    const key = `intel::coords`;
    const dataStr = await env.HIVEMIND_KV.get(key);
    let data = {};
    try { data = dataStr ? JSON.parse(dataStr) : {}; } catch(e) {}
    
    // Join with latest rankings to ensure alliance names are accurate and up-to-date
    const rankStr = await env.HIVEMIND_KV.get("intel::rankings_batch");
    let rankings = {};
    try { rankings = rankStr ? JSON.parse(rankStr) : {}; } catch(e) {}
    
    // Fetch manual roster to ensure map consistency
    const rosterStr = await env.HIVEMIND_KV.get("stats::tqc::roster");
    let roster = { members: [] };
    try { if (rosterStr) roster = JSON.parse(rosterStr); } catch(e) {}
    const hasRoster = roster.members && roster.members.length > 0;

    const merged = Object.values(data).map(p => {
        const nameKey = p.name ? p.name.toLowerCase() : "";
        const rankInfo = nameKey ? rankings[nameKey] : null;
        let alliance = rankInfo ? rankInfo.alliance : "None";

        // Roster Enforcement for Map & Coords
        if (hasRoster) {
            if (roster.members.includes(p.name)) {
                alliance = "TQC";
            } else if (alliance.toUpperCase() === "TQC") {
                alliance = "None";
            }
        }

        return {
            ...p,
            alliance
        };
    });

    return await jsonResponse(merged, 200, corsHeaders);
}

// ===============================================================
// DIPLOMACY
// ===============================================================

async function handleIntelDiplomacy(request, env, corsHeaders) {
    const data = await request.json(); // { pacts: [], wars: [] }

    if (!data || !Array.isArray(data.pacts) || !Array.isArray(data.wars)) {
        return await jsonResponse({ error: "Invalid data payload" }, 400, corsHeaders);
    }

    const key = `intel::diplomacy_discovery`;
    
    // Instead of overriding the official diplomacy, we record this as a discovery
    // We can merge with existing or just overwrite if we consider it a point-in-time scrape.
    // For simplicity, overwrite the latest discovery payload.
    await env.HIVEMIND_KV.put(key, JSON.stringify({
        timestamp: Date.now(),
        pacts: data.pacts,
        wars: data.wars,
        submittedBy: request.user ? request.user.ign : 'unknown'
    }));

    await logEvent(env, "intel_diplomacy_discovery", { pactsCount: data.pacts.length, warsCount: data.wars.length });

    return await jsonResponse({ success: true }, 200, corsHeaders);
}

async function handleGetDiplomacyDiscovery(request, env, corsHeaders) {
    const key = `intel::diplomacy_discovery`;
    const dataStr = await env.HIVEMIND_KV.get(key);

    if (!dataStr) {
        return await jsonResponse({ timestamp: 0, pacts: [], wars: [] }, 200, corsHeaders, request);
    }

    return await jsonResponse(JSON.parse(dataStr), 200, corsHeaders, request);
}

async function handleGetDiplomacy(request, env, corsHeaders) {
    const key = `intel::diplomacy`;
    const dataStr = await env.HIVEMIND_KV.get(key);

    if (!dataStr) {
        // Return default structured data
        return await jsonResponse({ 
            timestamp: 0, 
            categories: [
                { id: "sisters", name: "Sister Alliance", color: "#00ffff" },
                { id: "pacts", name: "Pacts", color: "#10cc70" },
                { id: "naps", name: "NAPs", color: "#ffd700" },
                { id: "wars", name: "Wars", color: "#ff4444" }
            ],
            assignments: {},
            audit: []
        }, 200, corsHeaders, request);
    }

    return await jsonResponse(JSON.parse(dataStr), 200, corsHeaders, request);
}

async function handlePostDiplomacy(request, env, corsHeaders) {
    const payload = await request.json();
    
    // Sanitize and validate payload
    // Expected structure: { action: 'update_categories', categories: [...] } or { action: 'set_assignment', target: 'TAG', category: 'sisters' }
    // To support full save from the UI, we can also accept { categories: [...], assignments: {...}, audit: [...] }
    
    // For simplicity, let's accept a full state overwrite from the admin panel
    if (!payload || !payload.categories || !payload.assignments) {
        // Support legacy save style momentarily to not break existing panel before it's refreshed.
        if (payload.pacts && payload.wars) {
            return await jsonResponse({ error: "Legacy format no longer supported. Please refresh your Admin Panel." }, 400, corsHeaders);
        }
        return await jsonResponse({ error: "Invalid data payload" }, 400, corsHeaders);
    }

    const key = `intel::diplomacy`;
    
    await env.HIVEMIND_KV.put(key, JSON.stringify({
        timestamp: Date.now(),
        categories: payload.categories,
        assignments: payload.assignments,
        audit: payload.audit || []
    }));

    // Log individual change to the global Activity Log
    let logDetail = "Updated diplomacy configuration";
    if (payload.audit && payload.audit.length > 0) {
        const last = payload.audit[0];
        if (last.action === 'set_assignment') logDetail = `Assigned ${last.target} to ${last.detail}`;
        else if (last.action === 'remove_assignment') logDetail = `Removed ${last.target} assignment`;
        else if (last.action === 'add_category') logDetail = `Created category: ${last.target}`;
        else if (last.action === 'remove_category') logDetail = `Deleted category: ${last.target}`;
    }

    await logEvent(env, "admin_diplomacy_update", { 
        admin: request.user ? request.user.ign : 'unknown',
        detail: logDetail
    });

    return await jsonResponse({ success: true }, 200, corsHeaders);
}

// ===============================================================
// HELPERS
// ===============================================================

async function hashString(str) {
    const msgUint8 = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function jsonResponse(data, status, headers, request = null) {
    const body = JSON.stringify(data);
    const etag = await hashString(body);
    
    if (request && request.method === "GET") {
        const ifNoneMatch = request.headers.get("If-None-Match");
        if (ifNoneMatch === etag) {
            return new Response(null, {
                status: 304,
                headers: {
                    "Access-Control-Allow-Origin": headers?.["Access-Control-Allow-Origin"] || "*",
                    "ETag": etag
                }
            });
        }
    }

    const finalHeaders = {
        "Content-Type": "application/json",
        "ETag": etag,
        ...headers
    };

    // Note: withCache will override Cache-Control if it handles the request,
    // but we set a default for direct browser hits or non-cached routes if needed.
    if (!finalHeaders["Cache-Control"] && request && request.method === "GET") {
        finalHeaders["Cache-Control"] = "public, max-age=60";
    }

    return new Response(body, {
        status: status || 200,
        headers: finalHeaders
    });
}

// OWASP A03 — Sanitize KV keys to prevent key injection
function sanitizeKey(input) {
    if (!input) return "_unknown";
    return input.replace(/[^a-zA-Z0-9_\-. ]/g, '_').toLowerCase().slice(0, 100);
}

// ===============================================================
// AUDIT LOGGING
// ===============================================================

async function logEvent(env, event, data) {
    const key = `log::${Date.now()}::${crypto.randomUUID()}`;
    await env.HIVEMIND_KV.put(key, JSON.stringify({
        event,
        ...data,
        timestamp: Date.now()
    }), { expirationTtl: 604800 }); // 7 days
}

// ===============================================================
// ADMIN AUTH
// ===============================================================

async function handleAdminAuth(request, env, corsHeaders) {
    const body = await request.json();
    const { adminKey } = body;

    // SECURITY UPDATE: Account-based lockout for the Admin credential
    const lockoutKey = "lockout::admin";
    const lockedUntil = parseInt(await env.HIVEMIND_KV.get(lockoutKey) || "0");
    if (Date.now() < lockedUntil) {
        return await jsonResponse({ error: "Admin access temporarily locked due to repeated failures." }, 423, corsHeaders);
    }

    // 1. Check Root Access
    if (env.ROOT_KEY && await constantTimeCompare(adminKey, env.ROOT_KEY)) {
        const payload = { ign: "Root", role: "root", exp: Date.now() + 86400000 };
        const token = await signJWT(payload, env.ALLIANCE_KEY);
        await logEvent(env, "admin_auth_success_root", { ip: request.headers.get("CF-Connecting-IP") || "unknown" });
        return await jsonResponse({ token, ign: "Root", role: "root" }, 200, corsHeaders);
    }

    // 2. Check Individual Admin Keys
    const adminData = await env.HIVEMIND_KV.get(`iam::admins::${adminKey}`, { type: "json" });
    if (adminData) {
        const payload = { ign: adminData.ign, role: "admin", exp: Date.now() + 86400000 };
        const token = await signJWT(payload, env.ALLIANCE_KEY);
        await logEvent(env, "admin_auth_success_individual", { ign: adminData.ign });
        return await jsonResponse({ token, ign: adminData.ign, role: "admin" }, 200, corsHeaders);
    }

    // 3. Legacy Global Admin Key
    const isLegacyValid = await constantTimeCompare(adminKey, env.ADMIN_KEY);
    if (!adminKey || !isLegacyValid) {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        
        // Track consecutive failures for lockout
        const failKey = "fails::admin";
        const fails = parseInt(await env.HIVEMIND_KV.get(failKey) || "0") + 1;
        if (fails >= 5) {
            await env.HIVEMIND_KV.put(lockoutKey, String(Date.now() + 900000)); // 15 min lockout
            await env.HIVEMIND_KV.delete(failKey);
            await logEvent(env, "admin_lockout", { ip });
        } else {
            await env.HIVEMIND_KV.put(failKey, String(fails), { expirationTtl: 3600 });
        }

        await logEvent(env, "admin_auth_failure", { ip });
        // Intentional delay to further frustrate automated brute-force
        await new Promise(r => setTimeout(r, 1000));
        return await jsonResponse({ error: "Invalid admin key" }, 401, corsHeaders);
    }

    // Reset failure counter on success
    await env.HIVEMIND_KV.delete("fails::admin");

    // Secure HMAC-SHA256 Session Token Generation (JWT paradigm)
    const sessionPayload = {
        ign: "CouncilAdmin",
        role: "admin",
        exp: Date.now() + 86400000 // 24 hours
    };
    
    // Use the same signing secret as player auth for unified verification
    const token = await signJWT(sessionPayload, env.ALLIANCE_KEY);
    await logEvent(env, "admin_auth_success", { ign: "CouncilAdmin" });

    return await jsonResponse({ 
        token, 
        ign: "CouncilAdmin", 
        role: "admin" 
    }, 200, corsHeaders);
}

/**
 * withCache - Wraps GET requests with the Cloudflare Cache API
 * Ensures TTFB is minimal for data-heavy Admin Panel requests.
 */
async function withCache(request, env, ctx, corsHeaders, handler, ttl = 60) {
    // Only cache GET requests
    if (request.method !== "GET") return await handler(request, env, corsHeaders);

    const cache = caches.default;
    const url = new URL(request.url);
    
    // Create a cache key that ignores irrelevant search params if necessary, 
    // but here we keep the full URL for integrity.
    const cacheKey = new Request(url.toString(), request);
    
    let response = await cache.match(cacheKey);
    if (response) {
        // Return cached response with a hit indicator
        const headers = new Headers(response.headers);
        headers.set("X-HiveMind-Cache", "HIT");
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: headers
        });
    }

    // Cache Miss: Execute handler
    response = await handler(request, env, corsHeaders);

    // Only cache successful JSON responses
    if (response.status === 200 && response.headers.get("Content-Type")?.includes("application/json")) {
        const cacheResponse = response.clone();
        // Set edge TTL via s-maxage
        cacheResponse.headers.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl}`);
        cacheResponse.headers.set("X-HiveMind-Cache", "MISS");
        
        // Save to cache in the background
        if (ctx && typeof ctx.waitUntil === 'function') {
            ctx.waitUntil(cache.put(cacheKey, cacheResponse));
        }
    }

    return response;
}

async function withAdminAuth(request, env, corsHeaders, handler) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return await jsonResponse({ error: "Missing authorization" }, 401, corsHeaders);
    }

    const token = authHeader.split(" ")[1];
    
    // OWASP A02 FIX — Verify HMAC-SHA256 signature
    const session = await verifyJWT(token, env.ALLIANCE_KEY);
    
    if (!session) {
        return await jsonResponse({ error: "Invalid or tampered session" }, 401, corsHeaders);
    }

    if (!session.ign || !session.exp) {
        return await jsonResponse({ error: "Invalid token payload" }, 401, corsHeaders);
    }

    if (Date.now() > session.exp) {
        return await jsonResponse({ error: "Session expired. Please log in again." }, 401, corsHeaders);
    }

    // Role-based Access Control (RBAC)
    if (session.role !== 'admin' && session.role !== 'root') {
        return await jsonResponse({ error: "Administrator credentials required." }, 403, corsHeaders);
    }

    return await handler(request, env, corsHeaders, session);
}

/**
 * Super Admin Auth Wrapper (IAM Only)
 */
async function withSuperAdminAuth(request, env, corsHeaders, handler) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return await jsonResponse({ error: "Missing authorization" }, 401, corsHeaders);
    }

    const token = authHeader.split(" ")[1];
    const session = await verifyJWT(token, env.ALLIANCE_KEY);
    
    if (!session || session.role !== 'root') {
        // Return 404 to hide the existence of IAM endpoints to unauthorized users
        return await jsonResponse({ error: "Not found" }, 404, corsHeaders);
    }

    if (Date.now() > session.exp) {
        return await jsonResponse({ error: "Root session expired." }, 401, corsHeaders);
    }

    return await handler(request, env, corsHeaders, session);
}

// ===== IAM HANDLERS =====

async function handleListAdmins(request, env, corsHeaders) {
    const list = await env.HIVEMIND_KV.list({ prefix: "iam::admins::" });
    const admins = [];
    for (const key of list.keys) {
        const data = await env.HIVEMIND_KV.get(key.name, { type: "json" });
        admins.push({
            key: key.name.split("::")[2],
            ign: data.ign,
            role: data.role,
            created_at: data.created_at
        });
    }
    return await jsonResponse({ admins }, 200, corsHeaders);
}

async function handleAddAdmin(request, env, corsHeaders) {
    const body = await request.json();
    const { ign, key } = body;
    if (!key) return await jsonResponse({ error: "Key required" }, 400, corsHeaders);

    const data = {
        ign: ign || "Unknown",
        role: "admin",
        created_at: Date.now()
    };
    await env.HIVEMIND_KV.put(`iam::admins::${key}`, JSON.stringify(data));
    await logEvent(env, "iam_admin_added", { ign, key_preview: key.substring(0, 4) + "..." });
    return await jsonResponse({ success: true }, 201, corsHeaders);
}

async function handleRevokeAdmin(request, env, corsHeaders) {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) return await jsonResponse({ error: "Key required" }, 400, corsHeaders);

    await env.HIVEMIND_KV.delete(`iam::admins::${key}`);
    await logEvent(env, "iam_admin_revoked", { key_preview: key.substring(0, 4) + "..." });
    return await jsonResponse({ success: true }, 200, corsHeaders);
}



// ===============================================================
// MEMBER/PLAYER ROUTE AUTH
// ===============================================================

async function withPlayerAuth(request, env, corsHeaders, handler) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return await jsonResponse({ error: "Unauthorized. Missing Bearer token." }, 401, corsHeaders);
    }

    const token = authHeader.split(" ")[1];
    
    // OWASP A02 FIX — Verify HMAC-SHA256 signature instead of insecure atob()
    const session = await verifyJWT(token, env.ALLIANCE_KEY);
    if (!session) {
        return await jsonResponse({ error: "Invalid or tampered token" }, 401, corsHeaders);
    }

    if (!session.ign || !session.exp) {
        return await jsonResponse({ error: "Invalid token payload" }, 401, corsHeaders);
    }

    if (Date.now() > session.exp) {
        return await jsonResponse({ error: "Session expired. Please reconnect." }, 401, corsHeaders);
    }
    
    // Real-Time Revocation Check
    if (session.tid) {
        const tokenExists = await env.HIVEMIND_KV.get(`token::${session.tid}`);
        if (!tokenExists) {
            await logEvent(env, "auth_revoked_session", { ign: session.ign });
            return await jsonResponse({ error: "This token has been revoked. Contact leadership." }, 401, corsHeaders);
        }
    }

    // Inject validated IGN into request for downstream usage
    request.user = session;
    return await handler(request, env, corsHeaders);
}

// ===============================================================
// TOKEN MANAGEMENT
// ===============================================================

async function handleGetTokens(request, env, corsHeaders) {
    const list = await env.HIVEMIND_KV.list({ prefix: "token::" });
    const tokens = [];

    for (const key of list.keys) {
        const data = await env.HIVEMIND_KV.get(key.name);
        if (data) {
            const parsed = JSON.parse(data);
            tokens.push({
                id: key.name.replace("token::", ""),
                ign: parsed.ign,
                role: parsed.role,
                created_at: parsed.created_at
            });
        }
    }

    return await jsonResponse({ tokens }, 200, corsHeaders);
}

async function handleCreateToken(request, env, corsHeaders) {
    const body = await request.json();
    const { ign, role } = body;

    if (!ign) {
        return await jsonResponse({ error: "Missing IGN" }, 400, corsHeaders);
    }

    const tokenId = crypto.randomUUID();
    const tokenData = {
        ign: ign,
        role: role || "member",
        created_at: Date.now()
    };

    await env.HIVEMIND_KV.put(`token::${tokenId}`, JSON.stringify(tokenData));
    await logEvent(env, "token_created", { ign, role: role || "member" });

    return await jsonResponse({ token: tokenId, ign, role: role || "member" }, 200, corsHeaders);
}

async function handleDeleteToken(tokenId, env, corsHeaders) {
    const existing = await env.HIVEMIND_KV.get(`token::${tokenId}`);
    if (existing) {
        const data = JSON.parse(existing);
        await logEvent(env, "token_revoked", { ign: data.ign });
    }

    await env.HIVEMIND_KV.delete(`token::${tokenId}`);
    return await jsonResponse({ success: true }, 200, corsHeaders);
}

// ===============================================================
// LOGS
// ===============================================================

async function handleGetLogs(request, env, corsHeaders) {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const eventFilter = url.searchParams.get("event");

    const list = await env.HIVEMIND_KV.list({ prefix: "log::", limit: 500 });
    const logs = [];

    for (const key of list.keys) {
        const data = await env.HIVEMIND_KV.get(key.name);
        if (data) {
            const parsed = JSON.parse(data);
            if (!eventFilter || parsed.event === eventFilter) {
                logs.push(parsed);
            }
        }
    }

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => b.timestamp - a.timestamp);

    // Paginate
    const startIndex = (page - 1) * limit;
    const paginated = logs.slice(startIndex, startIndex + limit);

    return await jsonResponse({ logs: paginated, total: logs.length, page }, 200, corsHeaders);
}

// ===============================================================
// ROSTER MANAGEMENT
// ===============================================================

async function handleGetRoster(request, env, corsHeaders) {
    const key = `stats::tqc::roster`;
    const data = await env.HIVEMIND_KV.get(key);
    return await jsonResponse(data ? JSON.parse(data) : { members: [] }, 200, corsHeaders);
}

async function handlePostRoster(request, env, corsHeaders) {
    const data = await request.json();
    if (!data || !Array.isArray(data.members)) {
        return await jsonResponse({ error: "Expected { members: [] }" }, 400, corsHeaders);
    }
    const key = `stats::tqc::roster`;
    await env.HIVEMIND_KV.put(key, JSON.stringify(data));
    return await jsonResponse({ success: true }, 200, corsHeaders);
}

// ===============================================================
// FLOOD FINDER (HYPERCHAIN)
// ===============================================================

async function handleGetFloodFinder(request, env, corsHeaders) {
    const key = `admin::flood_finder`;
    const data = await env.HIVEMIND_KV.get(key);
    return await jsonResponse(data ? JSON.parse(data) : { targets: [] }, 200, corsHeaders);
}

async function handlePostFloodFinder(request, env, corsHeaders) {
    const data = await request.json();
    if (!data || !Array.isArray(data.targets)) {
        return await jsonResponse({ error: "Expected { targets: [] }" }, 400, corsHeaders);
    }
    
    const key = `admin::flood_finder`;
    
    // Add server-side timestamp to updates
    const payload = {
        targets: data.targets.map(t => ({
            ...t,
            last_updated: Date.now()
        }))
    };

    await env.HIVEMIND_KV.put(key, JSON.stringify(payload));
    await logEvent(env, "flood_finder_updated", { count: payload.targets.length, user: request.user?.ign });
    
    return await jsonResponse({ success: true, targets: payload.targets }, 200, corsHeaders);
}
