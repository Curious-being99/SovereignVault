# Sovereign Vault 🛡️ — Core Storage Architecture & Design Lifecycle

This document outlines the zero-trust, offline-first, decentralized storage architecture of **Sovereign Vault**. By treating the physical hardware of active peers as the cloud, Sovereign Vault eliminates central database reliance, providing absolute privacy, mathematical redundancy, and high-performance browser-native persistence.

---

## 🗺️ High-Level Design Lifecycle Overview

Sovereign Vault's lifecycle operates in three continuous loops: **Upload (Sharding & Placement)**, **Maintenance (Sovereign Verification & Anti-Entropy)**, and **Download (Query, Retrieval, & Local Assembly)**.

```
                  ┌──────────────────────────────────────────────┐
                  │                 USER FILE                    │
                  └──────────────────────┬───────────────────────┘
                                         │
     ============================== 1. UPLOAD ==============================
                                         ▼
                             ┌───────────────────────┐
                             │  Ring 1: Ring-LWE     │ ◄── Lattice-Based
                             │  Lattice Scrambling   │     Key Wrapping
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │  Cipher Layer 2 & 3   │ ◄── Master Session Key
                             │  (AES-256 + ChaCha20) │
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ Reed-Solomon Shard    │ ── N=5 Shards Created
                             │  Erasure Coding       │    (Any K=3 to Reconstruct)
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │  Kademlia XOR Mapping │ ── CID Hash XOR-Matched
                             │  & WebRTC Streaming   │    to Closest Peer IDs
                             └───────────┬───────────┘
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  ▼                      ▼                      ▼
         ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
         │   Peer Node A  │     │   Peer Node B  │     │   Peer Node C  │
         │ (OPFS Storage) │     │ (OPFS Storage) │     │ (OPFS Storage) │
         └───────┬────────┘     └───────┬────────┘     └───────┬────────┘
                 │                      │                      │
     ============│================= 2. MAINTENANCE =============│===========
                 │                      │                      │
                 └───────────────┐      │      ┌───────────────┘
                                 ▼      ▼      ▼
                             ┌───────────────────────┐
                             │ Merkle DAG & Entropy  │ ◄── Background Verification
                             │ Integrity Auditing    │     Checks (Redundancy Sync)
                             └───────────┬───────────┘
                                         │
     ============================= 3. DOWNLOAD =============================
                                         ▼
                             ┌───────────────────────┐
                             │ Direct WebRTC Fetch   │ ◄── Request any K=3
                             │  (Parallel Streams)   │     Valid Shards
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ Reed-Solomon Decode   │ ── Assemble original
                             │   Matrix Erasure      │    ciphertext stream
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ Ring 1: Ring-LWE      │ ── Key re-assembled
                             │ Polynomial Unscramble │    via Lattice Math
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ Client Decryption &   │ ── File assembled
                             │  Stream Save (OPFS)   │    completely locally
                             └───────────────────────┘
```

---

## 🚀 1. The Upload Cycle

The Upload sequence takes a local file input and distributes it securely across the direct peer-to-peer grid.

### Step 1.1: Ring 1 Quantum-Hardened Encryption (Ring-LWE)
When a user selects a file, it never touches a central cloud. The React browser sandbox initiates a multi-layered cryptographic process:
- **Ring 1 (Ring-LWE):** Actual mathematical implementation of **Learning With Errors (LWE)** over polynomial rings. This provides a post-quantum security layer by wrapping the symmetric session key using lattice-based math where $X^{256} + 1$ is the modulus.
- **Layer 2 (AES-256-GCM):** High-speed symmetric encryption for the file payload.
- **Layer 3 (ChaCha20-Poly1305):** Secondary streaming cipher layer for authenticated encryption.
- **OOM Prevention:** Files are never loaded entirely into memory. The system uses **Blob Slicing** to pipe chunks into the encryption and sharding engines.

### Step 1.2: Reed-Solomon Sharding
The encrypted binary block is passed directly to the **Reed-Solomon Erasure Coding** engine:
- The system parameters are set to $N=5$ and $K=3$.
- The encrypted payload is split into **3 data pieces**, and **2 mathematical parity pieces** are generated, creating a total of **5 shards**.
- **Security Benefit:** No single peer receives a complete file. Even if a hostile actor compromises a node, a lone shard represents unreadable, high-entropy noise.
- **Fault Tolerance:** Any $K=3$ out of $5$ shards can reconstruct the original payload. Even if 2 hosting nodes disappear permanently, zero data loss occurs.

### Step 1.3: XOR-Closest Routing & WebRTC Streaming
Each shard is assigned a 256-bit Content Identifier (CID) using SHA-256:
- The client queries its local routing table containing active peer node IDs.
- The system computes the **Kademlia XOR Distance Metric**:
  $$d(x, y) = x \oplus y$$
- The 5 shards are stream-written concurrently over direct WebRTC `DataChannels` (orchestrated dynamically using raw signaling sockets) to the physical hardware of the 5 closest active peers.

---

## 🛡️ 2. The Maintenance Cycle

Once shards are committed to peer hardware, the network performs continuous passive self-healing.

### Step 2.1: Native OPFS Persistence (Zero-Mock)
Upon receiving a shard, a peer writes the binary chunk directly to its **Origin Private File System (OPFS)**:
- **Uncapped Storage:** OPFS bypasses browser quota constraints, letting physical machines store gigabytes of raw, encrypted peer data directly on their physical storage drives.
- **High-Performance Streams:** Uses `FileSystemFileHandle.createWritable()` to stream binary data directly to disk, ensuring low latency and zero UI blocking.
- **Reliability:** Unlike temporary browser cache, OPFS is persistent and optimized for heavy I/O workloads.

### Step 2.2: Kaspa L1 BlockDAG Anchoring
For absolute immutability, every file completion event triggers an anchoring routine to the **Kaspa L1 Mainnet**:
- **Proof of Existence:** The file's unique Merkle Root is broadcast and indexed against the Kaspa BlockDAG.
- **Timestamping:** Kaspa's high-velocity BlockDAG provides sub-second finality for proof-of-timestamping, making the file's existence verifiable globally and independently of the Sovereign Vault network.
- **Auditability:** Users can verify their file's anchoring status via the `kaspaL1Anchor` and `kaspaL1Score` metadata fields.

### Step 2.3: Merkle Tree Auditing & Anti-Entropy
A decentralized, background anti-entropy routine monitors health across the mesh:
- Shards are organized hierarchically as a **Merkle Directed Acyclic Graph (DAG)**.
- **Verification:** Nodes exchange Merkle tree root hashes to identify corrupted, missing, or altered blocks without transferring actual file payloads.
- **Repair:** If a node goes offline, or its shard fails a hash validation check, remaining peers use the Reed-Solomon parity math to reconstruct the missing shard and stream it to a new XOR-closest peer, maintaining the required redundancy target ($N=5$).

---

## 📥 3. The Download Cycle

Retrieving a file is an on-demand, peer-to-peer assembly process.

```
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │ Shard #1     │     │ Shard #2     │     │ Shard #3     │
 │ (Peer Node)  │     │ (Peer Node)  │     │ (Peer Node)  │
 └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
        │                    │                    │
        │ WebRTC DataStream  │ WebRTC DataStream  │ WebRTC DataStream
        ▼                    ▼                    ▼
 ┌────────────────────────────────────────────────────────┐
 │                 Sovereign Vault Client                 │
 │                                                        │
 │  1. Parallel Shard Buffer Assembly                     │
 │  2. Reed-Solomon Decode (Matrix Reconstruction)        │
 │  3. Ring 1: Ring-LWE Key Unscrambling                  │
 │  4. Decrypt Cipher Stream (AES + ChaCha20)             │
 └──────────────────────────┬─────────────────────────────┘
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │             Reconstructed Decrypted File               │
 │            (Streaming OPFS Reconstruction)             │
 └────────────────────────────────────────────────────────┘
```

### Step 3.1: Parallel WebRTC Fetch
When the user requests a file:
- The client looks up the file’s CID directory and identifies the hosting peer nodes.
- It opens parallel WebRTC connection streams to pull shards.
- The retrieval routine is highly optimized: as soon as any **3 valid shards ($K=3$)** are completely loaded into memory, the remaining connection streams are aborted to conserve bandwidth.

### Step 3.2: Streaming Reconstruction & Decryption
- **OOM-Safe Reassembly:** For massive files, the server and client utilize a **Streaming Reconstruction Engine**. Instead of concatenating huge buffers in RAM, shards are piped sequentially into a filesystem write stream.
- **Reed-Solomon Decode:** The matrix inversion decoding is run locally, rebuilding the contiguous encrypted payload stream.
- **Ring 1 Unscrambling:** The Ring-LWE session key envelope is decrypted using post-quantum lattice mathematics.
- **Stream Decryption:** The browser-native cryptographic engine decrypts the payload on-the-fly using the recovered session key (AES-256-GCM + ChaCha20).
- The resulting file is pushed as a direct download stream or stored in the local OPFS "Vault" for offline access.

---

## 🌐 The Physical Hardware Mesh Cloud

By coupling **WebRTC**, **Reed-Solomon (5,3) Erasure Coding**, and **Origin Private File System (OPFS)** storage, Sovereign Vault makes central servers entirely obsolete:

1. **True Privacy:** No third party or server administrator ever sees the file name, metadata, or contents. All encryption keys remain client-side, bound to hardware passkeys or secure user keypacks.
2. **Infinite Scale:** The network’s storage capacity scales proportionally with the number of users. Every new participant donates their hard drive space (via OPFS) and bandwidth (via WebRTC) to the mesh.
3. **Impenetrable Fault Tolerance:** Files can survive catastrophic physical network disruptions. As long as any 3 of your chosen peer nodes remain alive, your digital identity and secure vault are fully recoverable.
