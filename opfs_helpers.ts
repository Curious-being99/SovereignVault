async function getOpfsBlobsDir() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('vault_native_blobs', { create: true });
  } catch (e) {
    return null;
  }
}

async function writeOpfsBlob(id: string | number, data: ArrayBuffer) {
  const dir = await getOpfsBlobsDir();
  if (!dir) return false;
  try {
    const fileHandle = await dir.getFileHandle(`${id}.bin`, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch (e) {
    console.error('Failed to write OPFS blob:', e);
    return false;
  }
}

async function readOpfsBlob(id: string | number): Promise<ArrayBuffer | null> {
  const dir = await getOpfsBlobsDir();
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(`${id}.bin`);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch (e) {
    return null;
  }
}

async function deleteOpfsBlob(id: string | number) {
  const dir = await getOpfsBlobsDir();
  if (!dir) return;
  try {
    await dir.removeEntry(`${id}.bin`);
  } catch (e) {}
}

