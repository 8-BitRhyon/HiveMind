# HiveMind Tactical Command Center

## Evolutionary Strategic Intelligence and Edge-Accelerated Coordination

HiveMind is a high-performance tactical overlay and intelligence aggregator designed to transform a legacy MMO alliance into a top-tier coordinated force. Originally developed as a secure standalone port of the Calys Optiflood script, HiveMind evolved into a centralized "Shared Intelligence" network that drives alliance growth, productivity, and defensive resilience through edge computing and cryptographic security.

---

## Technical Feats and Engineering Metrics

### 1. Edge Acceleration and Infrastructure Sustainability

A critical engineering milestone was the transformation of HiveMind from a local utility into a sustainable global network capable of supporting dozens of concurrent alliance members without infrastructure exhaustion.

- **97% Reduction in Latency:** By implementing the Cloudflare Cache API (`caches.default`) with custom `withCache` middleware, the system achieved a Time to First Byte (TTFB) reduction from ~1500ms (KV Origin Read) to **<45ms** (Edge Cache Hit).
- **99.9% Infrastructure Efficiency:** The system transitioned from "near-limit" daily request volumes to a high-efficiency batching model. Through deduplicated batching and local hash comparisons, backend request frequency was reduced by over 90 percent, allowing the entire alliance to scale on minimal serverless resources.

### 2. The "Antzzzbase" Strategic Intelligence Engine

HiveMind replaces fragmented coordination with a centralized Cloudflare-backed intelligence suite designed for long-term strategic analysis.

- **Historical Snapshotting:** Automates the monitoring of enemy HF changes and activity trends. The system maintains a **500-entry rolling window** per player with a **90-day data retention** policy, enabling the identification of enemy growth patterns and manual "Tracer" habit analysis.
- **Combat Strength Reverse-Engineering:** A source-agnostic parsing engine aggregates troop compositions and tech levels from disparate combat reports. This builds a permanent profile of recurrent adversaries at the edge.

### 3. Identity and Access Management (IAM) Architecture

To protect alliance data from external adversaries, HiveMind implements a hardened **Defense-in-Depth** security layer aligned with OWASP top-ten principles.

- **Cryptographic Session Integrity:** Migrated from plain-string identification to a robust **HMAC-SHA256 JWT** implementation (Web Crypto API). This ensures **Cryptographic Non-Repudiation** for all coordination requests and intel submissions.
- **Role-Based Access Control (RBAC):** Implements a granular permission model separating _Member_ and _Admin_ roles. Adhering to the **Principle of Least Privilege**, sensitive administrative functions (token revocation, audit logging) are strictly partitioned from general tactical intelligence.
- **Adaptive Threat Mitigation:** Utilizes a KV-based **Leaky Bucket Rate Limiter** on the `/auth` endpoint to mitigate brute-force attempts and credential stuffing (OWASP A07).
- **Individualized UUID Tokenization:** Every member utilizes a unique UUID-based access token, allowing for instant, granular revocation without disrupting the broader alliance infrastructure.

### 4. Coordinated "Lock" Framework

The system introduces real-time council-wide synchronization to prevent redundant maneuvers.

- **Atomic Target Locking:** Members can "Lock" a target at the edge, preventing others from wasting resources on the same objective.
- **Predictive Simulation Chain:** Engineered a forecast engine that synchronizes arrival times and landing order across the entire alliance network, ensuring maximum "Impact Time" precision.

---

## User Experience and Personalization

### 1. Cognitive Load Management

A primary design goal was to ensure that the influx of real-time tactical data did not overwhelm the user. HiveMind utilizes layered information disclosure and high-density grouping to maintain clarity under pressure.

- **Tactical Prioritization:** Essential data (Target Locks, Arrival Times) is foregrounded, while deep intelligence (Historical HF, Combat Records) is accessible via deliberate interaction.
- **Transactional UI Checks:** Implements "Atomic" validation to ensure the server state matches the UI state before any tactical action is committed, reducing user error during rapid maneuvers.

### 2. Personalized Visual Ecosystem (The "ThemeManager")

Recognizing the diverse preferences of the council, HiveMind features a robust theme engine allowing players to tailor their operational environment.

- **Concrete Brutalist (The "Freshman"):** A minimalist, utility-first gray and black aesthetic for maximum focus.
- **Neon Syndicate (Cyber):** High-contrast dark blue with neon red and green accents for nighttime operations.
- **Phosphor CRT (Terminal):** A retro-matrix aesthetic featuring black backgrounds and vibrant green phosphor typography.
- **Warm Sepia (Vintage):** A low-strain aesthetic utilizing vintage paper and ink tones for prolonged strategic planning.

---

## Cross-Platform Engineering

HiveMind was engineered with a universal compatibility layer, ensuring a seamless experience across multiple browser environments.

- **Browser-Agnostic Core:** The logic is decoupled into a modular architecture that supports **Chrome, Firefox, and Brave** with minimal manifest adjustments.
- **Mobile-First Operational Philosophy:** Designed to reduce player falloff by providing a robust, persistent interface that maintains defensive integrity across different environments, including mobile-responsive considerations for the Admin Panel.

---

## Architectural Challenges and "Grave Mistakes"

### The Alliance Flickering Crisis

Early in development, a state-synchronization error caused "Alliance Flickering," where user roles would reset to `null` during background syncs.

- **Root Cause:** Self-sync payloads were omitting alliance metadata, leading to partial state overrides in the Workers' KV store.
- **The Fix:** Implemented a "Merge-by-Timestamp" logic and qualification-aware scraping to ensure state integrity across multiple browser tabs and extension states.

---

## Technology Stack

- **Logic:** Vanilla JavaScript (ES6+), **jQuery** (DOM manipulation), Web Crypto API (HMAC-SHA256).
- **Architecture:** **Manifest V3 (MV3)** Browser Extension with cross-browser Firefox (Gecko) compatibility.
- **Backend:** Cloudflare Workers (Edge Computing), Cloudflare KV (Persistence), **Cloudflare Cache API** (`caches.default`).
- **Admin Panel:** Cloudflare Pages (Bespoke Tactical UI), **Chart.js** (KPI and Economy Visuals).
- **Data Vis:** Vis.js (Standalone Spatial Realm Mapping).

---

> [!NOTE]
> This repository represents a technical portfolio project. All alliance-specific identifiers and infrastructure keys have been removed or anonymized for security.
> | **Nest** | _Loge_ | Deepest defense; provides `0.3 + (0.15 * L)` health bonus. |

---

## Technology Stack

- **Logic:** Vanilla JavaScript (ES6+), **jQuery**, Web Crypto API.
- **Architecture:** **Manifest V3 (MV3)** with cross-browser Firefox (Gecko) compatibility.
- **Backend:** Cloudflare Workers, Cloudflare KV, **Cloudflare Cache API**.
- **Admin Panel:** Cloudflare Pages, **Chart.js** (KPI Visuals).
- **Data Vis:** Vis.js (Standalone Spatial Realm Mapping).

---

> [!NOTE]
> This repository represents a technical portfolio project. All alliance-specific identifiers and infrastructure keys have been removed or anonymized for security.
