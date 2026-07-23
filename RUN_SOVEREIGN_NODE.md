# 🧅 Sovereign P2P Mesh Node Daemon — Operational Manual

Welcome to the **Sovereign P2P Mesh Node Daemon**. This is a lightweight, zero-dependency, ultra-fast Node.js command-line client designed to run in standard terminals or natively on mobile devices using **Termux (Android)**.

By running this node daemon, you establish a real, active participation point in the quantum-resistant cryptographic onion routing mesh network, validate block consensus transactions, and earn on-chain validation reputation weights.

---

## 🚀 Quick Start Instructions

Ensure you have [Node.js](https://nodejs.org) (v16+) installed.

### Option A: Standard Terminal (macOS / Linux / Windows)

1. **Clone & Install Dependencies**
   ```bash
   git clone <your-github-repo-url>
   cd <your-repo-folder>
   npm install
   ```

2. **Execute the Sovereign Node**
   Using npm:
   ```bash
   npm run sovereign-node
   ```
   Or execute directly:
   ```bash
   node sovereign-node.js
   ```

---

### Option B: Mobile Termux Terminal (Android)

Termux is a powerful terminal emulator and Linux environment app for Android.

1. **Install and Update Termux**
   Download Termux from F-Droid (preferred) or Github. Open it and run:
   ```bash
   pkg update && pkg upgrade -y
   ```

2. **Install Node.js & Git in Termux**
   ```bash
   pkg install nodejs git -y
   ```

3. **Clone & Boot Node Daemon**
   ```bash
   git clone <your-github-repo-url>
   cd <your-repo-folder>
   npm install
   node sovereign-node.js
   ```

---

## 🛠 Interactive In-Terminal Command Line

Once running, the interactive shell prompt `sovereign@mesh:~#` is activated. You can issue the following commands:

| Command | Action | Operational Purpose |
| :--- | :--- | :--- |
| **`status`** | Renders live telemetry dashboard | Monitors RAM usage, routed packets, validation blocks, and active peers. |
| **`peers`** | Refreshes and lists swarm nodes | Pulls real-time active nodes discovered on the decentralised gateway relay. |
| **`mine-dag`** | Validates ledger consensus | Simulates high-efficiency transaction block validation and anchors state on-chain, earning Validator Reward weight. |
| **`route-onion`**| Sends real onion-routed packets | Interactively wraps a private message payload into layers of X25519 ECDH + AES-256-GCM keys to transfer hop-by-hop. |
| **`gateway`** | Re-routes default gateway host | Changes the gateway URL to point to another peer host or custom deployment server. |
| **`keypack`** | Shows your cryptographic identities| Displays your unique Peer ID, Ed25519 Public Key (signatures), and X25519 Public Key (onion agreement). |
| **`clear`** | Clears terminal screen logs | Wipes stdout output to preserve a clean panel. |
| **`exit`** | Gracefully terminates daemon | Stops background polling loops and safely keeps private keypacks stored locally. |

---

## 🔐 Deep-Dive Core Architectures

### 1. Quantum-Resistant Onion Keypacks (`node-identity.json`)
Upon the first launch, the daemon automatically derives secure keypacks:
* **Ed25519 Private/Public Keypair**: Handles signing local blocks and verifying the integrity of ledger sync blocks.
* **X25519 Private/Public Keypair**: Performs high-speed Elliptic-Curve Diffie-Hellman (ECDH) handshakes with peers.

This ensures key generation runs natively with C++ compilation speeds directly in your console.

### 2. Live P2P Swarm & Packet Long-Polling
Instead of simulated loops, the daemon:
1. **Announces presence** to the decentralized central gateway via standard endpoints.
2. **Synchronizes dynamic Peer Lists** from live network participants.
3. **Pulls real enqueued onion packets** destined for your local node from the remote routing registry.
4. **Decrypts or forwards** packets securely to adjacent hops in the swarm.

### 3. Kaspa-Inspired On-Chain Rewards BlockDAG Miner
By running `mine-dag`, your node performs:
1. Cryptographic hashing of local transaction sets.
2. Merkle Root compilation.
3. Cryptographic signing of the Root block with your private Ed25519 keypack.
4. Immuntable state submission to the mainnet.
5. Accrues validator reputation score weights directly on the global consensus ledger.
