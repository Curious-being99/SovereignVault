import { openDB as idbOpenDB, IDBPDatabase } from 'idb';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { FileData } from './db';

export const DB_NAME = 'VaultPersistence';
export const STORE_NAME = 'keys';
export const STORE_USERS = 'users';
export const STORE_FILES = 'files';
export const STORE_SYNC = 'syncQueue';

export const dbEvents = new EventTarget();

export function notifyChange(store: string, action: 'put' | 'delete' | 'clear', payload?: any) {
  dbEvents.dispatchEvent(new CustomEvent('db-change', { detail: { store, action, payload } }));
}

export function subscribeToStore(storeName: string, callback: () => void) {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent;
    if (customEvent.detail.store === storeName || customEvent.detail.store === '*') {
      callback();
    }
  };
  dbEvents.addEventListener('db-change', handler);
  return () => dbEvents.removeEventListener('db-change', handler);
}

// ---- Hybrid Engine Architecture ----
// 1. Tries to boot SQLite WASM + OPFS (Absolute Bleeding Edge).
// 2. If it fails (e.g. unsupported browser), falls back to Advanced IndexedDB.
// 3. Exposes the exact same asynchronous API to the rest of the app.

let sqliteDb: any = null;
let idbPromise: Promise<IDBPDatabase> | null = null;
let activeEngine: 'sqlite-opfs' | 'indexeddb' | null = null;

async function initSQLiteOPFS(): Promise<boolean> {
  try {
    // @ts-ignore
    const sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });
    
    if (sqlite3.oo1.OpfsDb) {
      // @ts-ignore
      sqliteDb = new sqlite3.oo1.OpfsDb('/vault_hybrid.db');
      console.log('[StorageEngine] Cutting-Edge SQLite WASM + OPFS Engine successfully initialized!');
      activeEngine = 'sqlite-opfs';
      
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);
        CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);
        CREATE TABLE IF NOT EXISTS syncQueue (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);
      `);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[StorageEngine] SQLite WASM + OPFS failed, falling back to IndexedDB:', err);
    return false;
  }
}

async function initIDB(): Promise<IDBPDatabase> {
  if (!idbPromise) {
    idbPromise = idbOpenDB(DB_NAME, 4, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        if (!db.objectStoreNames.contains(STORE_USERS)) {
          const userStore = db.createObjectStore(STORE_USERS, { keyPath: 'id', autoIncrement: true });
          userStore.createIndex('username', 'username', { unique: true });
        }
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          const fileStore = db.createObjectStore(STORE_FILES, { keyPath: 'id', autoIncrement: true });
          fileStore.createIndex('userId', 'userId', { unique: false });
          fileStore.createIndex('privateVaultId', 'privateVaultId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC)) {
          db.createObjectStore(STORE_SYNC, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
    console.log('[StorageEngine] Advanced IndexedDB Fallback Engine initialized!');
    activeEngine = 'indexeddb';
  }
  return idbPromise;
}

let initializationPromise: Promise<void> | null = null;
async function ensureEngine() {
  if (activeEngine) return;
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const sqliteSuccess = await initSQLiteOPFS();
      if (!sqliteSuccess) {
        await initIDB();
      }
    })();
  }
  await initializationPromise;
}

export async function getActiveEngineName() {
  await ensureEngine();
  return activeEngine;
}

// Helpers for SQLite JSON serialization
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof window !== 'undefined' ? window.btoa(binary) : btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = typeof window !== 'undefined' ? window.atob(base64) : atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

function serialize(data: any): string {
  return JSON.stringify(data, (key, value) => {
    if (value instanceof ArrayBuffer) {
      return { _type: 'ArrayBuffer', data: arrayBufferToBase64(value) };
    }
    return value;
  });
}

function deserialize(str: string): any {
  if (!str) return null;
  try {
    return JSON.parse(str, (key, value) => {
      if (value && typeof value === 'object' && value._type === 'ArrayBuffer') {
        return base64ToArrayBuffer(value.data);
      }
      return value;
    });
  } catch { return null; }
}

async function sqlitePut(tableName: string, data: any): Promise<number> {
  let id = data.id;
  const valStr = serialize(data);
  if (id !== undefined && id !== null) {
    sqliteDb.exec({
      sql: `INSERT INTO ${tableName} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      bind: [id, valStr]
    });
    return id;
  } else {
    sqliteDb.exec({
      sql: `INSERT INTO ${tableName} (data) VALUES (?)`,
      bind: [valStr]
    });
    const rows: any[] = [];
    sqliteDb.exec({
      sql: 'SELECT last_insert_rowid() as id',
      rowMode: 'object',
      callback: (row: any) => rows.push(row)
    });
    id = rows[0].id;
    data.id = id;
    const newValStr = serialize(data);
    sqliteDb.exec({
      sql: `UPDATE ${tableName} SET data = ? WHERE id = ?`,
      bind: [newValStr, id]
    });
    return id;
  }
}

export async function setItem(key: string, value: any): Promise<void> {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec({
      sql: 'INSERT INTO keys (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      bind: [key, serialize(value)]
    });
  } else {
    const db = await initIDB();
    await db.put(STORE_NAME, value, key);
  }
  notifyChange(STORE_NAME, 'put', { key, value });
}

export async function getItem(key: string): Promise<any> {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    let result = null;
    sqliteDb.exec({
      sql: 'SELECT value FROM keys WHERE key = ?',
      bind: [key],
      rowMode: 'object',
      callback: (row: any) => { result = deserialize(row.value); }
    });
    return result;
  } else {
    const db = await initIDB();
    return await db.get(STORE_NAME, key);
  }
}

export async function removeItem(key: string): Promise<void> {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec({ sql: 'DELETE FROM keys WHERE key = ?', bind: [key] });
  } else {
    const db = await initIDB();
    await db.delete(STORE_NAME, key);
  }
  notifyChange(STORE_NAME, 'delete', { key });
}

// User methods
export async function getLocalUsers() {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    const rows: any[] = [];
    sqliteDb.exec({
      sql: 'SELECT data FROM users',
      rowMode: 'object',
      callback: (row: any) => rows.push(deserialize(row.data))
    });
    return rows;
  } else {
    const db = await initIDB();
    return await db.getAll(STORE_USERS);
  }
}

export async function getLocalUserByUsername(username: string) {
  const users = await getLocalUsers();
  const cleanUsername = username.trim().toLowerCase();
  return users.find((u: any) => u.username && u.username.trim().toLowerCase() === cleanUsername);
}

export async function saveLocalUser(user: any) {
  await ensureEngine();
  
  if (user.username) {
    const cleanUsername = user.username.trim().toLowerCase();
    const allUsers = await getLocalUsers();
    
    const duplicates = allUsers.filter(
      (u: any) => u.username && u.username.trim().toLowerCase() === cleanUsername
    );
    
    if (duplicates.length > 0) {
      const targetId = user.id !== undefined && user.id !== null ? user.id : duplicates[0].id;
      user.id = targetId;
      
      for (const dup of duplicates) {
        if (dup.id !== targetId) {
          await migrateOfflineFilesUserId(dup.id, targetId).catch(() => {});
          if (activeEngine === 'sqlite-opfs') {
            sqliteDb.exec({ sql: 'DELETE FROM users WHERE id = ?', bind: [dup.id] });
          } else {
            const db = await initIDB();
            await db.delete(STORE_USERS, dup.id);
          }
          notifyChange(STORE_USERS, 'delete', { id: dup.id });
        }
      }
    }
  }
  
  let id;
  if (activeEngine === 'sqlite-opfs') {
    id = await sqlitePut(STORE_USERS, user);
  } else {
    const db = await initIDB();
    id = await db.put(STORE_USERS, user);
  }
  
  notifyChange(STORE_USERS, 'put', user);
  return id;
}

// File methods
export async function getLocalFiles(userId: number, privateVaultId?: string) {
  await ensureEngine();
  
  if (activeEngine === 'sqlite-opfs') {
    const rows: any[] = [];
    sqliteDb.exec({
      sql: 'SELECT data FROM files',
      rowMode: 'object',
      callback: (row: any) => rows.push(deserialize(row.data))
    });
    if (privateVaultId) {
      return rows.filter(f => f.privateVaultId === privateVaultId);
    }
    return rows.filter(f => f.userId === userId);
  } else {
    const db = await initIDB();
    if (privateVaultId) {
      return await db.getAllFromIndex(STORE_FILES, 'privateVaultId', privateVaultId);
    }
    return await db.getAllFromIndex(STORE_FILES, 'userId', userId);
  }
}

export async function getVisibleFiles(userId: number, privateVaultId?: string): Promise<FileData[]> {
  const files = await getLocalFiles(userId, privateVaultId);
  return files.filter((file: FileData) => {
    if (!file.syncStatus) return true;
    if (file.syncStatus === 'synced') return true;
    if (file.syncStatus === 'pending') return true;
    if (file.syncStatus === 'local-only') return true;
    return true;
  });
}

export async function getLocalSharedFiles() {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    const rows: any[] = [];
    sqliteDb.exec({
      sql: 'SELECT data FROM files',
      rowMode: 'object',
      callback: (row: any) => rows.push(deserialize(row.data))
    });
    return rows.filter(f => f.isShared);
  } else {
    const db = await initIDB();
    const allFiles = await db.getAll(STORE_FILES);
    return allFiles.filter((f: any) => f.isShared);
  }
}

export async function saveLocalFile(file: any) {
  await ensureEngine();
  let id;
  if (activeEngine === 'sqlite-opfs') {
    id = await sqlitePut(STORE_FILES, file);
  } else {
    const db = await initIDB();
    id = await db.put(STORE_FILES, file);
  }
  notifyChange(STORE_FILES, 'put', file);
  return id;
}

export async function deleteLocalFile(fileId: number) {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec({ sql: 'DELETE FROM files WHERE id = ?', bind: [fileId] });
  } else {
    const db = await initIDB();
    await db.delete(STORE_FILES, fileId);
  }
  notifyChange(STORE_FILES, 'delete', { id: fileId });
}

export async function getLocalFile(fileId: number) {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    let result = null;
    sqliteDb.exec({
      sql: 'SELECT data FROM files WHERE id = ?',
      bind: [fileId],
      rowMode: 'object',
      callback: (row: any) => { result = deserialize(row.data); }
    });
    return result;
  } else {
    const db = await initIDB();
    return await db.get(STORE_FILES, fileId);
  }
}

export async function migrateOfflineFilesUserId(oldUserId: number, newUserId: number) {
  const files = await getLocalFiles(oldUserId);
  for (const file of files) {
    file.userId = newUserId;
    await saveLocalFile(file);
  }
}

export async function linkOrphanFilesToUser(userId: number, privateVaultId: string) {
  await ensureEngine();
  let allFiles: any[] = [];
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec({
      sql: 'SELECT data FROM files',
      rowMode: 'object',
      callback: (row: any) => {
        try {
          allFiles.push(deserialize(row.data));
        } catch (e) {}
      }
    });
  } else {
    const db = await initIDB();
    allFiles = await db.getAll(STORE_FILES);
  }

  let updatedCount = 0;
  for (const file of allFiles) {
    if (file && file.privateVaultId === privateVaultId && file.userId !== userId) {
      file.userId = userId;
      await saveLocalFile(file);
      updatedCount++;
    }
  }
  console.log(`[StorageEngine] Linked ${updatedCount} local orphan files to userId ${userId} via privateVaultId ${privateVaultId}`);
  return updatedCount;
}

// Sync Queue methods
export async function addToSyncQueue(action: string, payload: any) {
  await ensureEngine();
  const item = { action, payload, timestamp: Date.now() };
  if (activeEngine === 'sqlite-opfs') {
    await sqlitePut(STORE_SYNC, item);
  } else {
    const db = await initIDB();
    await db.add(STORE_SYNC, item);
  }
  notifyChange(STORE_SYNC, 'put', { action });
}

export async function getSyncQueue() {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    const rows: any[] = [];
    sqliteDb.exec({
      sql: 'SELECT data FROM syncQueue',
      rowMode: 'object',
      callback: (row: any) => rows.push(deserialize(row.data))
    });
    return rows;
  } else {
    const db = await initIDB();
    return await db.getAll(STORE_SYNC);
  }
}

export async function removeSyncQueueItem(id: number) {
  await ensureEngine();
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec({ sql: 'DELETE FROM syncQueue WHERE id = ?', bind: [id] });
  } else {
    const db = await initIDB();
    await db.delete(STORE_SYNC, id);
  }
  notifyChange(STORE_SYNC, 'delete', { id });
}

// Advanced Permanent & Open Source Storage Functions
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log(`[StorageEngine] Persistent storage granted: ${isPersisted}`);
      return isPersisted;
    } catch (e) {
      console.error('[StorageEngine] Error requesting persistent storage:', e);
      return false;
    }
  }
  return false;
}

let directoryHandle: FileSystemDirectoryHandle | null = null;
export async function mountHardwareFolder(): Promise<boolean> {
  try {
    // @ts-ignore
    directoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });
    
    // @ts-ignore
    const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        // @ts-ignore
      await directoryHandle.requestPermission({ mode: 'readwrite' });
    }
    
    console.log('[StorageEngine] Hardware folder mounted successfully.');
    return true;
  } catch (err) {
    console.error('[StorageEngine] Hardware mounting failed:', err);
    return false;
  }
}

export function isHardwareMounted(): boolean {
  return directoryHandle !== null;
}

export async function saveToHardware(filename: string, data: Blob): Promise<void> {
  if (!directoryHandle) return;
  try {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch (err) {
    console.error(`[StorageEngine] Failed to write ${filename} to hardware:`, err);
    throw err;
  }
}

export async function checkStorageStatus(): Promise<{ persisted: boolean; usage: number; quota: number; hardware: boolean; engine: string }> {
  let persisted = false;
  let usage = 0;
  let quota = 0;
  if (typeof navigator !== 'undefined' && navigator.storage) {
    if (navigator.storage.persisted) {
      try { persisted = await navigator.storage.persisted(); } catch (e) {}
    }
    if (navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        usage = estimate.usage || 0;
        quota = estimate.quota || 0;
      } catch (e) {}
    }
  }
  const engine = (await getActiveEngineName()) || 'unknown';
  return { persisted, usage, quota, hardware: isHardwareMounted(), engine };
}

export interface CompleteDatabaseDump {
  version: number;
  exportedAt: number;
  keys: { key: string; value: any }[];
  users: any[];
  files: any[];
  syncQueue: any[];
}

export async function exportCompleteDatabase(): Promise<CompleteDatabaseDump> {
  await ensureEngine();
  
  const keysList: { key: string; value: any }[] = [];
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec({
      sql: 'SELECT key, value FROM keys',
      rowMode: 'object',
      callback: (row: any) => keysList.push({ key: row.key, value: deserialize(row.value) })
    });
  } else {
    const db = await initIDB();
    const keysStore = db.transaction(STORE_NAME, 'readonly').store;
    const keyKeys = await keysStore.getAllKeys();
    for (const k of keyKeys) {
      const v = await keysStore.get(k);
      keysList.push({ key: k.toString(), value: v });
    }
  }

  const users = await getLocalUsers();
  const files = await getLocalFiles(-1); // Assuming this returns all, but we need a getAll implementation
  // Actually getLocalFiles with -1 might not work. Let's just getAll files.
  let allFiles = [];
  let allSync = [];
  
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec({ sql: 'SELECT data FROM files', rowMode: 'object', callback: (row: any) => allFiles.push(deserialize(row.data)) });
    sqliteDb.exec({ sql: 'SELECT data FROM syncQueue', rowMode: 'object', callback: (row: any) => allSync.push(deserialize(row.data)) });
  } else {
    const db = await initIDB();
    allFiles = await db.getAll(STORE_FILES);
    allSync = await db.getAll(STORE_SYNC);
  }
  
  return {
    version: 4,
    exportedAt: Date.now(),
    keys: keysList,
    users,
    files: allFiles,
    syncQueue: allSync
  };
}

export async function importCompleteDatabase(dump: CompleteDatabaseDump): Promise<void> {
  await ensureEngine();
  
  if (activeEngine === 'sqlite-opfs') {
    sqliteDb.exec('DELETE FROM keys');
    sqliteDb.exec('DELETE FROM users');
    sqliteDb.exec('DELETE FROM files');
    sqliteDb.exec('DELETE FROM syncQueue');
    
    for (const item of dump.keys || []) await setItem(item.key, item.value);
    for (const user of dump.users || []) await sqlitePut(STORE_USERS, user);
    for (const file of dump.files || []) await sqlitePut(STORE_FILES, file);
    for (const sync of dump.syncQueue || []) await sqlitePut(STORE_SYNC, sync);
    
  } else {
    const db = await initIDB();
    
    const txClear = db.transaction([STORE_NAME, STORE_USERS, STORE_FILES, STORE_SYNC], 'readwrite');
    await txClear.objectStore(STORE_NAME).clear();
    await txClear.objectStore(STORE_USERS).clear();
    await txClear.objectStore(STORE_FILES).clear();
    await txClear.objectStore(STORE_SYNC).clear();
    await txClear.done;
    
    const txKeys = db.transaction(STORE_NAME, 'readwrite');
    for (const item of dump.keys || []) await txKeys.store.put(item.value, item.key);
    await txKeys.done;
    
    const txUsers = db.transaction(STORE_USERS, 'readwrite');
    for (const user of dump.users || []) await txUsers.store.put(user);
    await txUsers.done;
    
    const txFiles = db.transaction(STORE_FILES, 'readwrite');
    for (const file of dump.files || []) await txFiles.store.put(file);
    await txFiles.done;
    
    const txSync = db.transaction(STORE_SYNC, 'readwrite');
    for (const sync of dump.syncQueue || []) await txSync.store.put(sync);
    await txSync.done;
  }
  
  notifyChange('*', 'clear');
}

export async function optimizeDatabase(): Promise<{ beforeCount: number; afterCount: number }> {
  await ensureEngine();
  let beforeCount = 0;
  let cleanedCount = 0;
  
  if (activeEngine === 'sqlite-opfs') {
    const rows: any[] = [];
    sqliteDb.exec({ sql: 'SELECT data FROM files', rowMode: 'object', callback: (row: any) => rows.push(deserialize(row.data)) });
    beforeCount = rows.length;
    for (const file of rows) {
      if (!file.name || !file.userId) {
        sqliteDb.exec({ sql: 'DELETE FROM files WHERE id = ?', bind: [file.id] });
        cleanedCount++;
      }
    }
  } else {
    const db = await initIDB();
    const allFiles = await db.getAll(STORE_FILES);
    beforeCount = allFiles.length;
    const tx = db.transaction(STORE_FILES, 'readwrite');
    for (const file of allFiles) {
      if (!file.name || !file.userId) {
        await tx.store.delete(file.id);
        cleanedCount++;
      }
    }
    await tx.done;
  }
  
  if (cleanedCount > 0) {
    notifyChange(STORE_FILES, 'delete');
  }
  
  return {
    beforeCount,
    afterCount: beforeCount - cleanedCount
  };
}
