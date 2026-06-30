/**
 * Anti-Entropy & Vector Clock implementation for Sovereign Vault.
 * Manages peer synchronization history and conflict resolution logic.
 */

export type PeerID = string;
export type LogicalClock = number;

export interface VectorClock {
  [peerId: string]: LogicalClock;
}

export interface SyncAuditEntry {
  timestamp: number;
  peerId: PeerID;
  type: 'PULL' | 'PUSH' | 'MERGE';
  status: 'SUCCESS' | 'CONFLICT' | 'FAULT';
  blocksSynced: number;
  vectorClock: VectorClock;
}

export interface AntiEntropyState {
  localClock: LogicalClock;
  vectorClock: VectorClock;
  auditLog: SyncAuditEntry[];
  lastSyncTimestamp: number | null;
}

class AntiEntropyManager {
  private state: AntiEntropyState = {
    localClock: 0,
    vectorClock: {},
    auditLog: [],
    lastSyncTimestamp: null,
  };

  private localPeerId: PeerID;

  constructor(localPeerId: PeerID) {
    this.localPeerId = localPeerId;
    this.state.vectorClock[localPeerId] = 0;
  }

  /**
   * Increments the local logical clock.
   */
  tick(): void {
    this.state.localClock++;
    this.state.vectorClock[this.localPeerId] = this.state.localClock;
  }

  /**
   * Compares two vector clocks.
   * Returns 1 if clockA is newer, -1 if clockB is newer, 0 if equal, and null if concurrent (conflict).
   */
  compare(clockA: VectorClock, clockB: VectorClock): number | null {
    let aNewer = false;
    let bNewer = false;

    const allKeys = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);

    for (const key of allKeys) {
      const valA = clockA[key] || 0;
      const valB = clockB[key] || 0;

      if (valA > valB) aNewer = true;
      if (valB > valA) bNewer = true;
    }

    if (aNewer && bNewer) return null; // Concurrent / Conflict
    if (aNewer) return 1;
    if (bNewer) return -1;
    return 0;
  }

  /**
   * Merges a remote vector clock into the local state.
   */
  merge(remotePeerId: PeerID, remoteClock: VectorClock, blocksSynced: number): SyncAuditEntry {
    this.state.localClock++;
    this.state.vectorClock[this.localPeerId] = this.state.localClock;

    const comparison = this.compare(this.state.vectorClock, remoteClock);
    const status = comparison === null ? 'CONFLICT' : 'SUCCESS';

    // Merge logic: take the maximum of each component
    const allKeys = new Set([...Object.keys(this.state.vectorClock), ...Object.keys(remoteClock)]);
    for (const key of allKeys) {
      this.state.vectorClock[key] = Math.max(
        this.state.vectorClock[key] || 0,
        remoteClock[key] || 0
      );
    }

    const entry: SyncAuditEntry = {
      timestamp: Date.now(),
      peerId: remotePeerId,
      type: 'MERGE',
      status,
      blocksSynced,
      vectorClock: { ...this.state.vectorClock },
    };

    this.state.auditLog.unshift(entry);
    if (this.state.auditLog.length > 100) this.state.auditLog.pop(); // Keep last 100 entries
    
    this.state.lastSyncTimestamp = entry.timestamp;
    return entry;
  }

  getAuditLog(): SyncAuditEntry[] {
    return this.state.auditLog;
  }

  getVectorClock(): VectorClock {
    return { ...this.state.vectorClock };
  }

  getState(): AntiEntropyState {
    return { ...this.state };
  }
}

export const createAntiEntropyManager = (localPeerId: PeerID) => new AntiEntropyManager(localPeerId);
