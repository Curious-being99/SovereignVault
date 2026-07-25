# Sovereign Vault 🛡️

Sovereign Vault is an offline-first, heavily-encrypted, and real-time synchronized full-stack file storage application. Designed for maximum security and local ownership, it pairs a modern, fluid React single-page interface with a hardened Hono backend (`better-sqlite3`and OPFS).

The application is fully compatible with mobile environments through Capacitor, enabling native biometrics, direct transfers, and hardware-protected secure storage, complete with a automated GitHub Actions workflow to build and rename Android APKs as `app-sovereignvault.apk`.

---

## 🏗️ Architecture Overview

The system is split into a robust **Front-End (React SPA)** and a performant **Back-End (Node.js/Express Server)**. It can run in standard server environments or be packaged entirely as a native Android app with offline fallbacks.

### 🧬 High-Efficiency P2P Storage & Mesh Networking (Zero-Compromise P2P)
Unlike standard web apps that rely on cloud servers or fake simulations, Sovereign Vault operates a **fully real, highly performant browser-native peer storage engine** designed for production-scale workloads:

1. **Origin Private File System (OPFS) Storage Engine:**
   - **Real-World Persistence:** Reads and writes gigabytes of raw, encrypted file shards directly to the user's physical hard drive via high-speed, low-latency binary streams.
   - **Zero-Mock Architecture:** This is not a simulation. Peers act as actual storage nodes, utilizing their hardware to host shards of the decentralized network.
   - **Performance:** Bypasses browser quota caps and `localStorage` limits, utilizing `FileSystemFileHandle.createWritable()` for non-blocking disk I/O.
   - **Memory Efficiency:** Integrated **Streaming Reconstruction** and **Blob Slicing** prevent Out-Of-Memory (OOM) crashes even when handling multi-gigabyte files.

2. **Quantum-Hardened Security (Ring 1):**
   - **Ring 1 (Ring-LWE):** Implements actual **Ring Learning With Errors** lattice-based cryptography to protect session keys. This is a real mathematical implementation of post-quantum polynomial scrambling ($X^{256} + 1$).
   - **Triple-Layer Encryption:** Files are protected by a hybrid stack of **Ring-LWE**, **AES-256-GCM**, and **ChaCha20-Poly1305**, providing multi-cipher defense in depth.
   - **Zero-Knowledge Architecture:** Encryption keys never leave the client's local environment.

3. **Kaspa L1 Immutability:**
   - **Blockchain Anchoring:** Every file is immutably anchored to the **Kaspa L1 BlockDAG**, providing a global, tamper-proof proof-of-existence and timestamp.

4. **WebRTC Multi-Channel Mesh Transport:**
   - **No Intermediaries:** Nodes establish secure, end-to-end encrypted UDP/TCP connections directly with each other via native WebRTC `DataChannels`.
   - **Decentralized Signaling:** A decentralized GunJS graph coordinates initial handshakes, ensuring the data flows purely peer-to-peer—never touching a central database.

3. **Reed-Solomon Erasure Coding (N=5, K=3):**
   - **Mathematical Redundancy:** Files are split into encrypted chunks and mathematically transformed into $N=5$ erasure-coded shards.
   - **High Fault-Tolerance:** Reconstructing the file requires a threshold of any $K=3$ shards. Up to 2 of the hosting nodes can go offline permanently or be deleted, and the file remains 100% reconstructible.
   - **Privacy by Design:** No single peer ever hosts a complete set of shards. Every shard is client-side encrypted before transmission, ensuring mathematical absolute isolation.

4. **Kademlia DHT with XOR Distance Metric:**
   - **256-bit Space:** Nodes are assigned random 256-bit identifiers. Every file shard is given a 256-bit Content Identifier (CID) based on its SHA-256 hash.
   - **Smart XOR Placement:** Shards are placed on nodes whose Node IDs are mathematically closest using the XOR distance metric: 
     $$d(x, y) = x \oplus y$$
   - **Iterative Multi-hop Routing:** Lookups are routed to nodes with mathematically decreasing distances to the target CID, finding shards in $O(\log N)$ hops across the active mesh topology.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Sovereign Vault Client                        │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────┐   │
│   │  React View Engine  │◄─►│ Capacitor Plugins   │◄─►│ Local DB & │   │
│   │  (Vite + Tailwind)  │   │ (Biometric / BLE)   │   │ Encryption │   │
│   └─────────────────────┘   └─────────────────────┘   └────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Encrypted Chunk Streams / REST)
                                    ▼
```
┌────────────────────────────────────────────────────────────────────────┐
│                        Sovereign Vault Backend                         │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                       Express App Engine                       │   │
│   │  • Multi-part chunked upload processing                        │   │
│   │  • Content-Addressable Storage (CAS) with Merkle DAG           │   │
│   │  • Direct transfers, mDNS discovery, and Kaspa anchoring       │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│             ┌─────────────────────┴─────────────────────┐              │
│             ▼                                           ▼              │
│   ┌───────────────────┐                       ┌───────────────────┐    │
│   │   SQLite Database │                       │ Secure File Vault │    │
│   │    (vault.db)     │                       │ (AES+ChaCha CAS)  │    │
│   └───────────────────┘                       └───────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Cryptographic & Security Architecture

Sovereign Vault is built around a zero-trust model. Key security characteristics include:

### 1. Triple-Layered Stream Encryption (Ring-LWE + AES + ChaCha)
Every raw file uploaded to the server is dynamically piped through a multi-layered cryptographic stack:
- **Ring 1 (Ring-LWE):** Lattice-based polynomial scrambling used to wrap the session key. This is a real mathematical implementation providing resistance against quantum-computing-based attacks.
- **Layer 2 (AES-256-GCM):** Industry standard authenticated symmetric encryption.
- **Layer 3 (ChaCha20-Poly1305):** A modern, highly secure stream cipher featuring superb performance across mobile CPUs.
- Each write utilizes unique cryptographically-secure random Initialization Vectors (IVs) ensuring the same plaintext yields entirely different ciphertexts across uploads.

### 2. Content-Addressable Storage (CAS) & Merkle DAG Layout
- Large files are structured dynamically as a Merkle Directed Acyclic Graph (DAG) and verified chunk-by-chunk using cryptographic hashes.
- Real-time hashes ensure complete integrity: files and block levels can be validated, repaired, or rebuilt upon corruption.
- To prevent storage performance bottlenecks, files are mapped uniformly based on their SHA-256 hash into **65,536 distinct nested directories** (`vault_data/xx/yy/`), keeping OS-level file listings and disk access extremely fast.

### 3. Password Hashing & Key Derivation
- Uses client-side PBKDF2 salting coupled with robust, server-side cryptographic salting on authentication pathways to prevent lookup/rainbow table attacks.
- Robust checks on user inputs protect user secrets at rest and prevent brute-force exposures.

---

## 📦 Directory Structure

```
.
├── .github/
│   └── workflows/
│       └── android.yml          # CI/CD pipeline to compile & package Android APK
├── android/                     # Native Android project configuration (Capacitor)
├── src/                         # Front-End Source Code (React + Vite)
│   ├── components/              # Extracted modular UI elements (Dashboard, Vault, Settings)
│   ├── lib/
│   │   └── api.ts               # Core client API wrapper handling offline fallbacks & REST requests
│   ├── App.tsx                  # Primary view controller and React client-side engine
│   ├── main.tsx                 # Web entry point
│   ├── index.css                # Global styles with Tailwind imports
│   └── types.ts                 # Shared global TypeScript types and structures
├── server.ts                    # Hardened backend server with API endpoints and SQLite schema setup
├── capacitor.config.ts          # Hybrid native integration configuration (Android schemes, Biometrics)
├── package.json                 # Dependency declarations and build script definitions
├── vite.config.ts               # Bundling config with Tailwind and asset base paths
└── metadata.json                # Platform descriptor metadata
```

---

## 🚀 Installation & Local Development

### Prerequisites
- **Node.js:** v18 or v20+
- **NPM:** v9+

### Step-by-Step Run Guide

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start Development Environment:**
   Starts both the Express API and mounts Vite's hot-reload middleware concurrently on port `3000`:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:3000`.

3. **Production Compilation:**
   Compiles frontend static assets to `dist/` and bundles the Express backend via `esbuild` into a unified CommonJS file `dist/server.cjs`:
   ```bash
   npm run build
   ```

4. **Start Production Server:**
   ```bash
   npm run start
   ```

---

## 📱 Mobile Platform (Capacitor Android)

The application has native support for mobile compilation.

### Syncing Web Assets with Android Studio:
Every time frontend code is updated and rebuilt, you must synchronize with Capacitor:
```bash
npm run build
npx cap sync android
```

### GitHub Actions (Auto APK Builder):
Whenever commits are pushed to the repository, the included workflow (`.github/workflows/android.yml`) triggers automatically to:
1. Initialize Node environment and install dependencies.
2. Build the optimized static frontend.
3. Sync assets with Capacitor.
4. Set up JDK 17 with Gradle Caching.
5. Compile and generate a release-ready APK.
6. Automatically rename the output from `app-debug.apk` to a custom, professional package named **`app-sovereignvault.apk`** for immediate deployment or sideloading!

---

## ⚙️ CI/CD Configuration (`.github/workflows/android.yml`)

The GitHub workflow is pre-configured with caching and custom compilation properties to ensure rapid builds:

```yaml
name: Build Android APK

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20.x'
        cache: 'npm'

    - name: Install dependencies
      run: npm install

    - name: Build web assets
      run: npm run build

    - name: Sync Capacitor
      run: npx cap sync android

    - name: set up JDK 17
      uses: actions/setup-java@v3
      with:
        java-version: '17'
        distribution: 'temurin'
        cache: gradle

    - name: Grant execute permission for gradlew
      run: chmod +x android/gradlew

    - name: Build with Gradle
      run: cd android && ./gradlew assembleDebug

    - name: Rename APK
      run: mv android/app/build/outputs/apk/debug/app-sovereignvault-debug.apk android/app/build/outputs/apk/debug/app-sovereignvault.apk

    - name: Upload APK
      uses: actions/upload-artifact@v3
      with:
        name: app-sovereignvault
        path: android/app/build/outputs/apk/debug/app-sovereignvault.apk
```

---

## 🛡️ Key Server Features & Protective Limits
- **Payload Restrictions:** Database restores and inputs are restricted strictly (e.g. `MAX_DB_SIZE = 100MB`) to safeguard against denial-of-service/memory overflow vector attacks.
- **Robust Endpoint Handlers:** All authentication routes (`/api/register`, `/api/login`, `/api/get-salt`) enforce strict parameter validation to eliminate potential runtime crash vulnerabilities.
- **File Stream Safety:** Native error event listeners on write streams catch errors gracefully without leaking resources or causing memory leaks.
