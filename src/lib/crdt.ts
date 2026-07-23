import * as Y from 'yjs';
import { FileData } from './db';
import { saveLocalFile, subscribeToStore, dbEvents } from './storage';

export const filesDoc = new Y.Doc();
export const filesMap = filesDoc.getMap<any>('files_metadata');

let isApplyingRemote = false;

// Listen to local DB changes to update CRDT
dbEvents.addEventListener('db-change', (e: any) => {
  const { store, action, payload } = e.detail;
  if (store === 'files' && action === 'put' && !isApplyingRemote) {
    const file = payload as FileData;
    if (!file.id) return;
    const metadata = { ...file };
    if (metadata.data) {
      metadata.data = undefined;
    }
    const current = filesMap.get(file.id.toString());
    if (JSON.stringify(current) !== JSON.stringify(metadata)) {
      filesMap.set(file.id.toString(), metadata);
    }
  } else if (store === 'files' && action === 'delete' && !isApplyingRemote) {
    if (payload && payload.id) {
       filesMap.delete(payload.id.toString());
    }
  }
});

// Observe remote changes and persist them to local storage
filesMap.observe(async (event, tr) => {
  if (tr.origin === 'remote') {
    // Only process changes that came from a remote peer
    const changes = event.changes.keys;
    for (const [key, change] of changes.entries()) {
      if (change.action === 'add' || change.action === 'update') {
        const updatedMetadata = filesMap.get(key);
        if (updatedMetadata) {
          isApplyingRemote = true;
          try {
             await saveLocalFile(updatedMetadata);
          } catch(e) {
             console.error("CRDT save error", e);
          } finally {
             isApplyingRemote = false;
          }
        }
      }
    }
  }
});

export function onCrdtUpdate(callback: (update: Uint8Array) => void) {
  const handler = (update: Uint8Array, origin: any) => {
     if (origin !== 'remote') {
        callback(update);
     }
  };
  filesDoc.on('update', handler);
  return () => filesDoc.off('update', handler);
}

export function applyRemoteCrdtUpdate(update: Uint8Array) {
  Y.applyUpdate(filesDoc, update, 'remote');
}
