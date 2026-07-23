/**
 * Merkle Tree Implementation for Shard Auditing
 * Provides deterministic Merkle Trees built from local shard CIDs.
 * Used by the peer-to-peer gossip protocol to quickly compare directories
 * and detect missing pieces (anti-entropy / mesh healing).
 */

import { stringTo256Bit } from "./dht";

/**
 * Computes a fast, stable hash of one or two string values for the Merkle nodes.
 * Uses a stable FNV-1a cascaded hash returned as a hex string.
 */
function hashPair(left: string, right: string = ""): string {
  const combined = left + right;
  let hash = 2166136261;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class MerkleTree {
  public leaves: string[];
  public levels: string[][];

  constructor(shardHashes: string[]) {
    // Deterministic ordering is crucial for Merkle Tree consistency across peers
    this.leaves = [...shardHashes].sort();
    this.levels = [];
    this.buildTree();
  }

  private buildTree() {
    if (this.leaves.length === 0) {
      this.levels = [["empty"]];
      return;
    }

    // Leaf level nodes are hashes of the shard CIDs themselves
    let currentLevel = this.leaves.map(leaf => hashPair(leaf));
    this.levels.push(currentLevel);

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // Duplicate left if odd
        nextLevel.push(hashPair(left, right));
      }
      currentLevel = nextLevel;
      this.levels.push(currentLevel);
    }
  }

  /**
   * Returns the root hash of the Merkle Tree.
   */
  getRoot(): string {
    if (this.levels.length === 0) return "empty";
    const topLevel = this.levels[this.levels.length - 1];
    return topLevel[0] || "empty";
  }

  /**
   * Compares local tree leaves with remote tree leaves to detect:
   * 1. Shards that we have but the remote peer is missing (to push to them)
   * 2. Shards that the remote peer has but we are missing (to pull from them)
   */
  static diff(local: MerkleTree, remoteLeaves: string[]): {
    missingLocally: string[];
    missingRemotely: string[];
  } {
    const localSet = new Set(local.leaves);
    const remoteSet = new Set(remoteLeaves);

    const missingLocally: string[] = [];
    const missingRemotely: string[] = [];

    localSet.forEach(hash => {
      if (!remoteSet.has(hash)) {
        missingRemotely.push(hash);
      }
    });

    remoteSet.forEach(hash => {
      if (!localSet.has(hash)) {
        missingLocally.push(hash);
      }
    });

    return {
      missingLocally,
      missingRemotely
    };
  }
}
