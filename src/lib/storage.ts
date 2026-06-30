import { openDB as idbOpenDB, IDBPDatabase } from 'idb';

export const DB_NAME = 'VaultPersistence';
export const STORE_NAME = 'keys';
const STORE_USERS = 'users';
const STORE_FILES = 'files';
const STORE_SYNC = 'syncQueue';

let dbPromise: Promise<IDBPDatabase> | null = null;

export async function openDB(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = idbOpenDB(DB_NAME, 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        db.createObjectStore(STORE_USERS, { keyPath: 'id', autoIncrement: true });
        transaction.objectStore(STORE_USERS).createIndex('username', 'username', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const fileStore = db.createObjectStore(STORE_FILES, { keyPath: 'id', autoIncrement: true });
        fileStore.createIndex('userId', 'userId');
      }
      if (!db.objectStoreNames.contains(STORE_SYNC)) {
        db.createObjectStore(STORE_SYNC, { keyPath: 'id', autoIncrement: true });
      }
    },
    blocked() {
      // Handle blocked event
    },
    blocking() {
      // Handle blocking event
    },
    terminated() {
      // Handle terminated event
    },
  });
  
  return dbPromise;
}

export async function setItem(key: string, value: any): Promise<void> {
  const db = await openDB();
  await db.put(STORE_NAME, value, key);
}

export async function getItem(key: string): Promise<any> {
  const db = await openDB();
  return await db.get(STORE_NAME, key);
}

export async function removeItem(key: string): Promise<void> {
  const db = await openDB();
  await db.delete(STORE_NAME, key);
}

// User methods
export async function getLocalUsers() {
  const db = await openDB();
  return await db.getAll(STORE_USERS);
}
export async function getLocalUserByUsername(username: string) {
  const db = await openDB();
  return await db.getFromIndex(STORE_USERS, 'username', username);
}
export async function saveLocalUser(user: any) {
  const db = await openDB();
  return await db.put(STORE_USERS, user);
}

// File methods
export async function getLocalFiles(userId: number) {
  const db = await openDB();
  return await db.getAllFromIndex(STORE_FILES, 'userId', userId);
}
export async function getLocalSharedFiles() {
  const db = await openDB();
  const allFiles = await db.getAll(STORE_FILES);
  return allFiles.filter(f => f.isShared);
}
export async function saveLocalFile(file: any) {
  const db = await openDB();
  return await db.put(STORE_FILES, file);
}
export async function deleteLocalFile(fileId: number) {
  const db = await openDB();
  await db.delete(STORE_FILES, fileId);
}
export async function getLocalFile(fileId: number) {
  const db = await openDB();
  return await db.get(STORE_FILES, fileId);
}

// Sync Queue methods
export async function addToSyncQueue(action: string, payload: any) {
  const db = await openDB();
  await db.add(STORE_SYNC, { action, payload, timestamp: Date.now() });
}
export async function getSyncQueue() {
  const db = await openDB();
  return await db.getAll(STORE_SYNC);
}
export async function removeSyncQueueItem(id: number) {
  const db = await openDB();
  await db.delete(STORE_SYNC, id);
}
