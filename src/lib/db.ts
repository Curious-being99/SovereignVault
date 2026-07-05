export interface UserProfile {
  id?: number;
  username: string; // unique
  displayName: string;
  passwordHash: string; // PBKDF2 hash
  passwordSalt: string; // salt for authentication PBKDF2
  joinedAt: number;
  avatarColor?: string;
  autoLockInterval?: number;
  vaultSeedId?: string;
  privateVaultId?: string;
}

export interface FileData {
  id?: number;
  userId: number; // reference to UserProfile.id
  privateVaultId?: string; // Private unique identity for this file's owner
  name: string;
  data: ArrayBuffer;
  type: string;
  size: number; // Precomputed file size in bytes
  folderPath: string; // E.g., "/" or "/Documents" or "/Work"
  isFolder: boolean; // True if this represents a directory entry
  isShared: boolean; // True if shared to local P2P mesh
  senderName?: string; // Set if file was received/sync'd from another local user
  shareNote?: string; // Note added when sharing to peers
  lastModified: number;
  deletedAt?: number; // timestamp when placed in Trash
  originalFolderPath?: string; // original folderPath before being trashed
  clientEncrypted?: boolean; // if false, file was encrypted server-side instead of in-memory client-side
  previousDagHash?: string;
  dagHash?: string;
  dagSignature?: string;
  sigAlgorithm?: string;
  vaultSeedId?: string;
  cryptoBlockNumber?: number;
  originalOwnerSeedId?: string | null;
  peerReceiverSeedId?: string | null;
  originalId?: number;
  merkleRoot?: string;
  isOfflineOnly?: boolean; // true = never show when online
  createdOffline?: boolean;
  lastSynced?: number | null;
  syncStatus?: 'pending' | 'synced' | 'conflict' | 'local-only';
}
