/**
 * Decentralized Sync Engine for Sovereign Vault (Disabled - Local Only Mode)
 */

export interface KaspaSession {
  kaspaAddress: string;
  peerNode: string;
  status: 'disconnected';
  hashRate: string;
  blockHeight: number;
}

export interface OneDBSession {
  connected: false;
  provider: null;
}

export interface DecentralizedSyncLog {
  id: string;
  timestamp: string;
  type: 'KASPA_ANCHOR' | 'KASPA_RECOVER' | 'ONEDB_SYNC' | 'ONEDB_AUTH' | 'KASPA_AUTH';
  status: 'SUCCESS';
  details: string;
}

export const decentralizedSync = {
  getKaspaSession(): KaspaSession {
    return {
      kaspaAddress: '',
      peerNode: 'Disabled',
      status: 'disconnected',
      hashRate: '0',
      blockHeight: 0,
    };
  },

  saveKaspaSession(_session: KaspaSession) {},

  async connectKaspaNode(_userId?: string, _customAddress?: string): Promise<KaspaSession> {
    throw new Error("Remote sync is disabled. Use local storage only.");
  },

  async disconnectKaspa() {},

  async anchorToKaspaDAG(
    _userId: string,
    _encryptedDbHex: string,
    _onProgress: (progress: number) => void
  ): Promise<{ txHash: string; blockHeight: number }> {
    throw new Error("Remote sync is disabled. Use local storage only.");
  },

  async retrieveFromKaspaDAG(
    _userId: string,
    _onProgress: (progress: number) => void
  ): Promise<string> {
    throw new Error("Remote sync is disabled. Use local storage only.");
  },

  getOneDBSession(): OneDBSession {
    return {
      connected: false,
      provider: null,
    };
  },

  saveOneDBSession(_session: OneDBSession) {},

  async connectOneDB(
    _provider: 'github',
    _instanceUrl: string,
    _credentials?: {
      githubToken?: string;
      githubRepo?: string;
      githubPath?: string;
    }
  ): Promise<OneDBSession> {
    throw new Error("Remote sync is disabled. Use local storage only.");
  },

  async disconnectOneDB() {},

  async syncWithOneDB(
    _userId: string,
    _encryptedDbHex: string
  ): Promise<void> {
    throw new Error("Remote sync is disabled. Use local storage only.");
  },

  async pullFromOneDB(
    _userId: string
  ): Promise<string> {
    throw new Error("Remote sync is disabled. Use local storage only.");
  },

  getLogs(): DecentralizedSyncLog[] {
    return [];
  },

  addLog(
    _type: 'KASPA_ANCHOR' | 'KASPA_RECOVER' | 'ONEDB_SYNC' | 'ONEDB_AUTH' | 'KASPA_AUTH',
    _status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS',
    _details: string,
    _sizeBytes?: number,
    _txHash?: string
  ) {},

  clearLogs() {}
};
