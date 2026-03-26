# HiveMind: Tactical Command Center & Distributed Intelligence Suite

A high-performance Command and Control (C2) ecosystem designed for real-time logistics optimization and operational security in persistent browser-based MMORTS environments. HiveMind transforms raw data scraping, distributed state management, and edge computing into a centralized, low-latency tactical dashboard.

## System Architecture

The ecosystem operates across three primary layers:

1. **Edge Scraping Engine (Browser Extension)**: A JavaScript-based harvester that performs real-time DOM parsing, cryptographic session management, and "Atomic Sync" operations to ensure data integrity during high-frequency updates.
2. **Accelerated Backend (Cloudflare Workers)**: A serverless API layer utilizing the Cloudflare Cache API (`caches.default`) and KV storage. Implements a custom middleware for 60-second edge caching, resulting in a 97% reduction in TTFB (Time to First Byte).
3. **Tactical Command Center (Admin Panel)**: A bespoke, glassmorphic analytics dashboard featuring real-time network graphs (Vis.js), Strategic Threat Matrices, and Alliance Power Profilers.

## Core Features & Engineering Wins

### Performance Engineering
- **Edge Acceleration**: Integrated Cloudflare Workers with a multi-tiered caching strategy. Requests are served from the Cloudflare global edge, reducing average latency from ~1500ms to <50ms.
- **TTFB Optimization**: Achieved sub-50ms response times by offloading 90% of origin KV reads to the edge cache.

### Distributed Data Integrity
- **Atomic Sync**: Implements a step-by-step verification process for troop movements and resource transfers, preventing "ghost data" errors common in high-latency environments.
- **State-Aware Scraping**: Advanced logic in `queue.js` prevents alliance misattribution by cross-referencing persistent user state with dynamic page content.

### Behavioral Security (OpSec)
- **Auto-Garrison Protocols**: Automated defensive posture management that masks true army sizes from enemy scouting operations through strategic troop rotation.
- **Safety Interlocks**: Hardcoded constraints in the tactical interface to prevent catastrophic "friendly fire" incidents or accidental resource misallocation.

## Technical Stack

- **Frontend**: Vanilla JS, Vis.js, Chart.js, CSS3 (Bespoke Glassmorphism).
- **Backend**: Cloudflare Workers (Node.js/V8 Runtime), Cloudflare KV.
- **Infrastructure**: Wrangler CLI, Cloudflare Pages, Edge Caching.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
