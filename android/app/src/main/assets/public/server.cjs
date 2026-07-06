var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_ws = require("ws");
var import_os = __toESM(require("os"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_compression = __toESM(require("compression"), 1);
var import_stream = require("stream");
function stampCryptoFileAttributes(fileId) {
  try {
    const columns = db.prepare("PRAGMA table_info(files)").all();
    const hasCryptoBlock = columns.some((c) => c.name === "cryptoBlockNumber");
    if (!hasCryptoBlock) return;
    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
    if (!file) return;
    let updateNeeded = false;
    let originalOwnerSeedId = file.originalOwnerSeedId;
    let peerReceiverSeedId = file.peerReceiverSeedId;
    let cryptoBlockNumber = file.cryptoBlockNumber;
    if (!cryptoBlockNumber || cryptoBlockNumber === 0) {
      if (file.isFolder === 0) {
        const priorCount = db.prepare(
          "SELECT COUNT(*) as count FROM files WHERE userId = ? AND isFolder = 0 AND id < ?"
        ).get(file.userId, file.id);
        const count = priorCount?.count || 0;
        cryptoBlockNumber = Math.floor(count / 5) + 1;
        updateNeeded = true;
      }
    }
    if (!originalOwnerSeedId) {
      const user = db.prepare("SELECT vaultSeedId FROM users WHERE id = ?").get(file.userId);
      originalOwnerSeedId = file.vaultSeedId || user?.vaultSeedId || null;
      updateNeeded = true;
    }
    const currentUserRow = db.prepare("SELECT vaultSeedId FROM users WHERE id = ?").get(file.userId);
    const currentUserSeed = currentUserRow?.vaultSeedId || null;
    if (originalOwnerSeedId && currentUserSeed && originalOwnerSeedId !== currentUserSeed) {
      peerReceiverSeedId = currentUserSeed;
      updateNeeded = true;
    }
    if (file.senderName) {
      const senderUser = db.prepare(
        "SELECT vaultSeedId FROM users WHERE username = ? COLLATE NOCASE"
      ).get(file.senderName);
      if (senderUser && senderUser.vaultSeedId) {
        originalOwnerSeedId = senderUser.vaultSeedId;
        peerReceiverSeedId = currentUserSeed;
        updateNeeded = true;
      }
    }
    if (updateNeeded) {
      db.prepare(
        `
        UPDATE files 
        SET cryptoBlockNumber = ?, originalOwnerSeedId = ?, peerReceiverSeedId = ? 
        WHERE id = ?
      `
      ).run(cryptoBlockNumber, originalOwnerSeedId, peerReceiverSeedId, fileId);
      console.log(
        `[CryptoLedger] Stamped File ID ${fileId} (${file.name}): Block #${cryptoBlockNumber}, OwnerSeed: ${originalOwnerSeedId}, PeerSeed: ${peerReceiverSeedId}`
      );
    }
  } catch (err) {
    console.error(
      `[CryptoLedger] Error stamping crypto file attributes for ID ${fileId}:`,
      err.message
    );
  }
}
function stampCryptoShadowBlockAttributes(rowId) {
  try {
    const columns = db.prepare("PRAGMA table_info(mesh_shadow_blocks)").all();
    const hasCryptoBlock = columns.some((c) => c.name === "cryptoBlockNumber");
    if (!hasCryptoBlock) return;
    const block = db.prepare("SELECT * FROM mesh_shadow_blocks WHERE id = ?").get(rowId);
    if (!block) return;
    let meta = {};
    try {
      meta = JSON.parse(block.metadata);
    } catch (e) {
    }
    let originalOwnerSeedId = block.originalOwnerSeedId || meta.originalOwnerSeedId || null;
    let peerReceiverSeedId = block.peerReceiverSeedId || meta.peerReceiverSeedId || null;
    let cryptoBlockNumber = block.cryptoBlockNumber || meta.cryptoBlockNumber || 0;
    if (block.dagHash) {
      const file = db.prepare(
        "SELECT cryptoBlockNumber, originalOwnerSeedId, peerReceiverSeedId FROM files WHERE dagHash = ?"
      ).get(block.dagHash);
      if (file) {
        if (!cryptoBlockNumber) cryptoBlockNumber = file.cryptoBlockNumber;
        if (!originalOwnerSeedId)
          originalOwnerSeedId = file.originalOwnerSeedId;
        if (!peerReceiverSeedId) peerReceiverSeedId = file.peerReceiverSeedId;
      }
    }
    if (!originalOwnerSeedId) {
      originalOwnerSeedId = block.vaultSeedId || null;
    }
    db.prepare(
      `
      UPDATE mesh_shadow_blocks 
      SET cryptoBlockNumber = ?, originalOwnerSeedId = ?, peerReceiverSeedId = ? 
      WHERE id = ?
    `
    ).run(cryptoBlockNumber, originalOwnerSeedId, peerReceiverSeedId, rowId);
  } catch (err) {
    console.error(
      `[CryptoLedger] Error stamping shadow block ID ${rowId}:`,
      err.message
    );
  }
}
var OriginalDatabase = import_better_sqlite3.default;
var WrappedDatabase = class extends OriginalDatabase {
  constructor(filename, options) {
    super(filename, options);
    const originalPrepare = this.prepare.bind(this);
    this.prepare = (sql) => {
      const stmt = originalPrepare(sql);
      const originalRun = stmt.run.bind(stmt);
      stmt.run = (...args) => {
        const result = originalRun(...args);
        if (/insert\s+(?:or\s+\w+\s+)?into\s+files/i.test(sql) && result && result.lastInsertRowid) {
          const insertedId = Number(result.lastInsertRowid);
          setTimeout(() => {
            stampCryptoFileAttributes(insertedId);
          }, 10);
        }
        if (/insert\s+(?:or\s+\w+\s+)?into\s+mesh_shadow_blocks/i.test(sql) && result && result.lastInsertRowid) {
          const insertedId = Number(result.lastInsertRowid);
          setTimeout(() => {
            stampCryptoShadowBlockAttributes(insertedId);
          }, 10);
        }
        return result;
      };
      return stmt;
    };
  }
};
var dbPath = import_path.default.join(process.cwd(), "vault.db");
var db = new WrappedDatabase(dbPath);
db.pragma("journal_mode = DELETE");
db.pragma("synchronous = FULL");
db.pragma("foreign_keys = ON");
var VAULT_MASTER_KEY = process.env.VAULT_DB_KEY || "qs-lite-master-secure-key-2026";
var encryptionKey = import_crypto.default.createHash("sha256").update(VAULT_MASTER_KEY).digest();
function getUserEncryptionKey(userIdOrSeedId) {
  if (!userIdOrSeedId) return encryptionKey;
  let seedId = null;
  let migrationKeyHex = null;
  if (typeof userIdOrSeedId === "number") {
    const user = db.prepare("SELECT vaultSeedId, migrationUserKey FROM users WHERE id = ?").get(userIdOrSeedId);
    seedId = user?.vaultSeedId || null;
    migrationKeyHex = user?.migrationUserKey || null;
  } else {
    seedId = userIdOrSeedId;
  }
  if (migrationKeyHex) {
    try {
      const wrapped = Buffer.from(migrationKeyHex, "hex");
      return decryptBuffer(wrapped, encryptionKey);
    } catch (e) {
      console.error(
        "[getUserEncryptionKey] Failed to unwrap migrationUserKey:",
        e.message
      );
    }
  }
  if (!seedId) return encryptionKey;
  return import_crypto.default.createHmac("sha256", encryptionKey).update(seedId).digest();
}
function deriveLayeredKeys(masterKey) {
  const aesKey = import_crypto.default.createHash("sha256").update(masterKey).update("aes-layer").digest();
  const chachaKey = import_crypto.default.createHash("sha256").update(masterKey).update("chacha-layer").digest();
  return { aesKey, chachaKey };
}
var LayeredEncryptTransform = class extends import_stream.Transform {
  constructor(masterKey) {
    super();
    this.headerWritten = false;
    const { aesKey, chachaKey } = deriveLayeredKeys(masterKey);
    this.aesIv = import_crypto.default.randomBytes(12);
    this.chachaIv = import_crypto.default.randomBytes(12);
    this.aesCipher = import_crypto.default.createCipheriv("aes-256-gcm", aesKey, this.aesIv);
    this.chachaCipher = import_crypto.default.createCipheriv(
      "chacha20-poly1305",
      chachaKey,
      this.chachaIv,
      { authTagLength: 16 }
    );
  }
  _transform(chunk, encoding, callback) {
    try {
      if (!this.headerWritten) {
        this.push(Buffer.concat([this.aesIv, this.chachaIv]));
        this.headerWritten = true;
      }
      const layer1 = this.aesCipher.update(chunk);
      const layer2 = this.chachaCipher.update(layer1);
      this.push(layer2);
      callback();
    } catch (e) {
      callback(e);
    }
  }
  _flush(callback) {
    try {
      if (!this.headerWritten) {
        this.push(Buffer.concat([this.aesIv, this.chachaIv]));
        this.headerWritten = true;
      }
      const layer1Final = this.aesCipher.final();
      const layer2Final = this.chachaCipher.update(layer1Final);
      const layer2End = this.chachaCipher.final();
      this.push(Buffer.concat([layer2Final, layer2End]));
      const aesTag = this.aesCipher.getAuthTag();
      const chachaTag = this.chachaCipher.getAuthTag();
      this.push(Buffer.concat([aesTag, chachaTag]));
      callback();
    } catch (e) {
      callback(e);
    }
  }
};
function layeredDecryptBufferSync(buffer, masterKey) {
  if (buffer.length < 24 + 32) {
    throw new Error("Buffer too short for layered decryption");
  }
  const { aesKey, chachaKey } = deriveLayeredKeys(masterKey);
  const aesIv = buffer.subarray(0, 12);
  const chachaIv = buffer.subarray(12, 24);
  const aesTag = buffer.subarray(buffer.length - 32, buffer.length - 16);
  const chachaTag = buffer.subarray(buffer.length - 16);
  const cipherText = buffer.subarray(24, buffer.length - 32);
  const chachaDecipher = import_crypto.default.createDecipheriv(
    "chacha20-poly1305",
    chachaKey,
    chachaIv,
    { authTagLength: 16 }
  );
  chachaDecipher.setAuthTag(chachaTag);
  const layer1Decrypted = Buffer.concat([
    chachaDecipher.update(cipherText),
    chachaDecipher.final()
  ]);
  const aesDecipher = import_crypto.default.createDecipheriv("aes-256-gcm", aesKey, aesIv);
  aesDecipher.setAuthTag(aesTag);
  return Buffer.concat([
    aesDecipher.update(layer1Decrypted),
    aesDecipher.final()
  ]);
}
function encryptBuffer(buffer, key = encryptionKey) {
  const { aesKey, chachaKey } = deriveLayeredKeys(key);
  const aesIv = import_crypto.default.randomBytes(12);
  const chachaIv = import_crypto.default.randomBytes(12);
  const aesCipher = import_crypto.default.createCipheriv("aes-256-gcm", aesKey, aesIv);
  const layer1 = Buffer.concat([aesCipher.update(buffer), aesCipher.final()]);
  const aesTag = aesCipher.getAuthTag();
  const chachaCipher = import_crypto.default.createCipheriv(
    "chacha20-poly1305",
    chachaKey,
    chachaIv,
    { authTagLength: 16 }
  );
  const layer2 = Buffer.concat([
    chachaCipher.update(layer1),
    chachaCipher.final()
  ]);
  const chachaTag = chachaCipher.getAuthTag();
  return Buffer.concat([aesIv, chachaIv, aesTag, chachaTag, layer2]);
}
function decryptBuffer(buffer, key = encryptionKey) {
  if (!buffer) return buffer;
  if (buffer.length >= 56) {
    try {
      return layeredDecryptBufferSync(buffer, key);
    } catch (layeredErr) {
    }
  }
  if (buffer.length >= 28) {
    try {
      const iv = buffer.subarray(0, 12);
      const tag = buffer.subarray(12, 28);
      const encrypted = buffer.subarray(28);
      const decipher = import_crypto.default.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch (e) {
      if (key !== encryptionKey) {
        try {
          const iv = buffer.subarray(0, 12);
          const tag = buffer.subarray(12, 28);
          const encrypted = buffer.subarray(28);
          const decipher = import_crypto.default.createDecipheriv(
            "aes-256-gcm",
            encryptionKey,
            iv
          );
          decipher.setAuthTag(tag);
          return Buffer.concat([decipher.update(encrypted), decipher.final()]);
        } catch (innerErr) {
          return buffer;
        }
      }
      return buffer;
    }
  }
  return buffer;
}
var ShortBloomFilter = class {
  constructor(size = 256, hashCount = 3) {
    this.size = size;
    this.hashCount = hashCount;
    this.bitArray = new Uint8Array(size);
  }
  getHashes(value) {
    const hashes = [];
    let h1 = 5381;
    let h2 = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      h1 = (h1 << 5) + h1 ^ char;
      h2 = h2 * 33 ^ char;
    }
    for (let i = 0; i < this.hashCount; i++) {
      const index = Math.abs((h1 + i * h2) % this.size);
      hashes.push(index);
    }
    return hashes;
  }
  add(value) {
    const hashes = this.getHashes(value);
    for (const h of hashes) {
      this.bitArray[h] = 1;
    }
  }
  test(value) {
    const hashes = this.getHashes(value);
    for (const h of hashes) {
      if (this.bitArray[h] === 0) {
        return false;
      }
    }
    return true;
  }
  reset() {
    this.bitArray.fill(0);
  }
};
function buildMerkleRoot(chunks) {
  const algorithm = "sha512";
  if (chunks.length === 0) {
    return import_crypto.default.createHash(algorithm).update(Buffer.alloc(0)).digest("hex");
  }
  let currentLayer = chunks.map(
    (chunk) => import_crypto.default.createHash(algorithm).update(chunk).digest("hex")
  );
  while (currentLayer.length > 1) {
    const nextLayer = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        nextLayer.push(
          import_crypto.default.createHash(algorithm).update(currentLayer[i] + currentLayer[i + 1]).digest("hex")
        );
      } else {
        nextLayer.push(
          import_crypto.default.createHash(algorithm).update(currentLayer[i] + currentLayer[i]).digest("hex")
        );
      }
    }
    currentLayer = nextLayer;
  }
  return currentLayer[0];
}
function computeMerkleRoot(data) {
  const algorithm = "sha512";
  if (!data) {
    return import_crypto.default.createHash(algorithm).update(Buffer.alloc(0)).digest("hex");
  }
  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (typeof data === "string") {
    try {
      if (import_fs.default.existsSync(data)) {
        buffer = import_fs.default.readFileSync(data);
      } else {
        buffer = Buffer.from(data);
      }
    } catch {
      buffer = Buffer.from(data);
    }
  } else {
    buffer = Buffer.alloc(0);
  }
  const chunkSize = 65536;
  const chunks = [];
  if (buffer.length === 0) {
    return import_crypto.default.createHash("sha256").update(Buffer.alloc(0)).digest("hex");
  }
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(
      buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length))
    );
  }
  return buildMerkleRoot(chunks);
}
function getCurrentUserUsername(userId) {
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
  return user?.username || "anonymous";
}
function isCorruptOrVirusVideo(name, type, size, contentSource, userKey) {
  const lowercaseName = (name || "").toLowerCase();
  const lowercaseType = (type || "").toLowerCase();
  const isVideo = lowercaseType.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|flv|3gp|wmv|ogg)$/i.test(lowercaseName) || lowercaseName.includes("video") && !lowercaseType.includes("directory") && lowercaseType !== "folder";
  const isMaliciousOrCorruptName = lowercaseName.includes("virus") || lowercaseName.includes("malware") || lowercaseName.includes("trojan") || lowercaseName.includes("infected") || lowercaseName.includes("eicar") || lowercaseName.includes("exploit") || lowercaseName.includes("corrupt") || lowercaseName.includes("damaged") || lowercaseName.includes("broken");
  if (isMaliciousOrCorruptName) {
    return true;
  }
  const isFolder = lowercaseType === "directory" || lowercaseType === "folder";
  if (!isFolder && size <= 0) {
    return true;
  }
  if (isVideo) {
    if (!isFolder && size <= 0) {
      return true;
    }
  }
  if (contentSource) {
    try {
      let content = null;
      if (Buffer.isBuffer(contentSource)) {
        content = contentSource;
      } else if (typeof contentSource === "string" && import_fs.default.existsSync(contentSource)) {
        const stats = import_fs.default.statSync(contentSource);
        if (stats.isFile()) {
          content = import_fs.default.readFileSync(contentSource);
        }
      }
      if (content) {
        const contentStr = content.toString();
        if (contentStr.includes(
          "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        )) {
          return true;
        }
        const effectiveKey = userKey || encryptionKey;
        try {
          const decrypted = decryptBuffer(content, effectiveKey);
          if (decrypted.toString().includes(
            "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
          )) {
            return true;
          }
          if (isVideo) {
            if (decrypted.length > 0 && decrypted.length < 12) {
              return true;
            }
          }
        } catch (decryptErr) {
        }
        if (isVideo) {
          if (content.length > 0 && content.length < 12) {
            return true;
          }
        }
      }
    } catch (e) {
      return false;
    }
  }
  return false;
}
function recoverFiles() {
  const VAULT_DATA_DIR = import_path.default.join(process.cwd(), "vault_data");
  if (!import_fs.default.existsSync(VAULT_DATA_DIR)) return;
  try {
  } catch (err) {
  }
  const usersToRebuild = /* @__PURE__ */ new Set();
  let recoveredCount = 0;
  function scanDir(dir) {
    const entries = import_fs.default.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = import_path.default.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".meta")) {
        try {
          const meta = JSON.parse(import_fs.default.readFileSync(fullPath, "utf8"));
          const encFilePath = fullPath.replace(".meta", "");
          const userKey = getUserEncryptionKey(meta.vaultSeedId || meta.userId);
          if (isCorruptOrVirusVideo(
            meta.name,
            meta.type,
            meta.size,
            encFilePath,
            userKey
          )) {
            console.warn(
              `[Security Scan] Deleting corrupt or virus file during recovery: ${meta.name}`
            );
            try {
              if (import_fs.default.existsSync(fullPath)) import_fs.default.unlinkSync(fullPath);
              if (import_fs.default.existsSync(encFilePath)) import_fs.default.unlinkSync(encFilePath);
            } catch (unlinkErr) {
              console.error(
                `[Security Scan] Failed to delete file:`,
                unlinkErr
              );
            }
            continue;
          }
          let isChunkedComplete = false;
          if (meta.chunkHashes && Array.isArray(meta.chunkHashes) && meta.chunkHashes.length > 0) {
            isChunkedComplete = meta.chunkHashes.every(
              (h) => import_fs.default.existsSync(getSecureChunkPath(h))
            );
          }
          const isFolderCheck = meta.isFolder === true || meta.type === "directory" || meta.type === "folder";
          const fileDataExists = import_fs.default.existsSync(encFilePath) || isChunkedComplete || isFolderCheck;
          if (fileDataExists) {
            let fileIdStr = entry.name.split(".")[0].replace("file_", "").replace("vault_block_", "").split("_")[0];
            let fileId = parseInt(fileIdStr, 10);
            if (isNaN(fileId) && meta.fileId) {
              fileId = meta.fileId;
            }
            let exists = null;
            if (!isNaN(fileId)) {
              exists = db.prepare(
                "SELECT id, userId, name, size FROM files WHERE id = ?"
              ).get(fileId);
            }
            if (!exists || exists && exists.size <= 0 && meta.size > 0) {
              if (exists && !isNaN(fileId)) {
                db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
              }
              let userId = null;
              let resolvedSeedId = meta.vaultSeedId || null;
              if (resolvedSeedId) {
                const userBySeed = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(resolvedSeedId);
                if (userBySeed) {
                  userId = userBySeed.id;
                }
              }
              if (!userId && (meta.userId || meta.ownerId)) {
                const hintId = Number(meta.userId || meta.ownerId);
                const userById = db.prepare("SELECT id, vaultSeedId FROM users WHERE id = ?").get(hintId);
                if (userById) {
                  userId = userById.id;
                  resolvedSeedId = userById.vaultSeedId;
                }
              }
              if (!userId && meta.ownerHint) {
                const userByHint = db.prepare(
                  "SELECT id, vaultSeedId FROM users WHERE username = ? COLLATE NOCASE"
                ).get(meta.ownerHint);
                if (userByHint) {
                  userId = userByHint.id;
                  resolvedSeedId = userByHint.vaultSeedId;
                }
              }
              if (!userId || isNaN(Number(userId))) continue;
              const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
              if (!userExists) continue;
              const duplicateEntry = db.prepare(
                "SELECT id FROM files WHERE userId = ? AND name = ? AND folderPath = ?"
              ).get(userId, meta.name, meta.folderPath || "/");
              if (duplicateEntry) continue;
              if (!isNaN(fileId)) {
                db.prepare(
                  `
                  INSERT INTO files (id, userId, name, type, size, folderPath, isFolder, isShared, lastModified, clientEncrypted, shareNote, vaultSeedId, dagHash, previousDagHash, dagSignature, merkleRoot, encryptionKey)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
                ).run(
                  fileId,
                  userId,
                  meta.name,
                  meta.type,
                  meta.size,
                  meta.folderPath || "/",
                  meta.isFolder || meta.type === "directory" || meta.type === "folder" ? 1 : 0,
                  0,
                  meta.lastModified || Date.now(),
                  meta.clientEncrypted ? 1 : 0,
                  `System Recovery (ID Match: ${fileId})`,
                  resolvedSeedId,
                  meta.dagHash || null,
                  meta.previousDagHash || null,
                  meta.dagSignature || meta.signature || null,
                  meta.merkleRoot || null,
                  meta.encryptionKey || null
                );
              } else {
                const info = db.prepare(
                  `
                  INSERT INTO files (userId, name, type, size, folderPath, isFolder, isShared, lastModified, clientEncrypted, shareNote, vaultSeedId, dagHash, previousDagHash, dagSignature, merkleRoot, encryptionKey)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
                ).run(
                  userId,
                  meta.name,
                  meta.type,
                  meta.size,
                  meta.folderPath || "/",
                  meta.isFolder || meta.type === "directory" || meta.type === "folder" ? 1 : 0,
                  0,
                  meta.lastModified || Date.now(),
                  meta.clientEncrypted ? 1 : 0,
                  `System Recovery (CAS or Auto ID)`,
                  resolvedSeedId,
                  meta.dagHash || null,
                  meta.previousDagHash || null,
                  meta.dagSignature || meta.signature || null,
                  meta.merkleRoot || null,
                  meta.encryptionKey || null
                );
                const newFileId = Number(info.lastInsertRowid);
                try {
                  meta.fileId = newFileId;
                  import_fs.default.writeFileSync(fullPath, JSON.stringify(meta));
                } catch (e) {
                }
                if (isChunkedComplete) {
                  const insertChunk = db.prepare(
                    "INSERT INTO file_chunks (fileId, chunkIndex, chunkHash, isUploaded) VALUES (?, ?, ?, ?)"
                  );
                  const transaction = db.transaction((hashes) => {
                    hashes.forEach((hash, index) => {
                      insertChunk.run(newFileId, index, hash, 1);
                    });
                  });
                  transaction(meta.chunkHashes);
                }
              }
              usersToRebuild.add(userId);
              recoveredCount++;
            }
          } else {
            try {
              if (import_fs.default.existsSync(fullPath)) import_fs.default.unlinkSync(fullPath);
            } catch (e) {
            }
          }
        } catch (e) {
          console.error(
            `[Recovery] Failed to process meta file ${fullPath}:`,
            e
          );
        }
      }
    }
  }
  scanDir(VAULT_DATA_DIR);
  if (recoveredCount > 0) {
    console.log(
      `[Recovery] Successfully restored ${recoveredCount} orphaned files to the database.`
    );
    for (const userId of usersToRebuild) {
      console.log(
        `[Recovery] Auto-healing BlockDAG chain for user ${userId}...`
      );
      rebuildUserDag(userId);
    }
  }
  const allDbFiles = db.prepare("SELECT id, name, userId FROM files WHERE isFolder = 0").all();
  for (const f of allDbFiles) {
    const filePath = getSecureFilePath(f.id);
    if (!import_fs.default.existsSync(filePath)) {
      if (f.name.includes("stress_test_") || f.name.includes("simulation_")) {
        console.log(
          `[Purge] Automatically removing missing legacy simulation file: ${f.name} (ID: ${f.id})`
        );
        const fileMetadata = db.prepare("SELECT dagHash FROM files WHERE id = ?").get(f.id);
        if (fileMetadata?.dagHash) {
          db.prepare("DELETE FROM mesh_shadow_blocks WHERE dagHash = ?").run(
            fileMetadata.dagHash
          );
        }
        db.prepare("DELETE FROM files WHERE id = ?").run(f.id);
      } else {
        if (f.name.startsWith("Recovered_File_") || f.name.includes("temp_")) {
          db.prepare("DELETE FROM files WHERE id = ?").run(f.id);
        } else {
          const logMsg = `[DIAGNOSTIC] [FILE_MISSING] DB entry exists but physical file is missing! FileID: ${f.id}, Name: ${f.name}, UserID: ${f.userId}`;
          console.warn(logMsg);
        }
      }
    }
  }
  db.prepare(
    "DELETE FROM mesh_shadow_blocks WHERE metadata LIKE '%stress_test_%' OR metadata LIKE '%simulation_%'"
  ).run();
  function scanForOrphans(dir) {
    const entries = import_fs.default.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = import_path.default.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForOrphans(fullPath);
      } else if (entry.name.endsWith(".enc") && !entry.name.includes(".meta")) {
        const fileIdString = entry.name.replace("file_", "").replace(".enc", "");
        const fileId = parseInt(fileIdString);
        if (isNaN(fileId)) continue;
        const exists = db.prepare("SELECT id FROM files WHERE id = ?").get(fileId);
        if (!exists) {
          try {
            const content = import_fs.default.readFileSync(fullPath);
            const mRoot = computeMerkleRoot(content);
            const shadow = db.prepare(
              "SELECT * FROM mesh_shadow_blocks WHERE merkleRoot = ? OR dagHash = ?"
            ).get(mRoot, mRoot);
            if (shadow) {
              const meta = JSON.parse(shadow.metadata);
              const userKey = getUserEncryptionKey(
                shadow.vaultSeedId || shadow.ownerId
              );
              if (isCorruptOrVirusVideo(
                meta.name || `Recovered_File_${fileId}`,
                meta.type,
                meta.size,
                fullPath,
                userKey
              )) {
                console.warn(
                  `[Security Scan] Deleting corrupt or virus file during orphan recovery: ${meta.name || fileId}`
                );
                try {
                  if (import_fs.default.existsSync(fullPath)) import_fs.default.unlinkSync(fullPath);
                  const metaPath = fullPath + ".meta";
                  if (import_fs.default.existsSync(metaPath)) import_fs.default.unlinkSync(metaPath);
                } catch (unlinkErr) {
                }
                continue;
              }
              let shadowOwnerId = 0;
              let resolvedSeedId = shadow.vaultSeedId || meta.vaultSeedId || null;
              if (resolvedSeedId) {
                const matchingUser = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(resolvedSeedId);
                if (matchingUser) {
                  shadowOwnerId = matchingUser.id;
                }
              }
              if (!shadowOwnerId || isNaN(Number(shadowOwnerId))) {
                continue;
              }
              const shadowUserRow = db.prepare("SELECT id FROM users WHERE id = ?").get(shadowOwnerId);
              if (!shadowUserRow) {
                continue;
              }
              db.prepare(
                `
                INSERT OR REPLACE INTO files (id, userId, name, type, size, folderPath, isFolder, isShared, lastModified, clientEncrypted, shareNote, dagHash, previousDagHash, dagSignature, merkleRoot, vaultSeedId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `
              ).run(
                fileId,
                shadowOwnerId,
                meta.name || `Recovered_File_${fileId}`,
                meta.type || "application/octet-stream",
                meta.size || content.length,
                meta.folderPath || "/",
                meta.isFolder || meta.type === "directory" || meta.type === "folder" ? 1 : 0,
                0,
                meta.lastModified || Date.now(),
                meta.clientEncrypted ? 1 : 0,
                "HEALED - Automatically restored from mesh shadow index",
                meta.dagHash || shadow.dagHash,
                meta.previousDagHash || null,
                meta.dagSignature || null,
                meta.merkleRoot || mRoot,
                resolvedSeedId
              );
              usersToRebuild.add(shadowOwnerId);
              recoveredCount++;
            }
          } catch (healErr) {
            console.error(
              `[AutoHeal] Failed to auto-heal orphaned file ${fileId}:`,
              healErr
            );
          }
        }
      }
    }
  }
  scanForOrphans(VAULT_DATA_DIR);
}
function performDeepRecovery(requestingUserId) {
  const VAULT_DATA_DIR = import_path.default.join(process.cwd(), "vault_data");
  if (!import_fs.default.existsSync(VAULT_DATA_DIR))
    return { recovered: 0, total_scanned: 0, ownership_mismatches: 0 };
  let recoveredCount = 0;
  let totalScanned = 0;
  let ownershipMismatches = 0;
  const requestingUser = db.prepare("SELECT username, vaultSeedId FROM users WHERE id = ?").get(requestingUserId);
  if (!requestingUser)
    return { recovered: 0, total_scanned: 0, ownership_mismatches: 0 };
  const userVaultSeedId = requestingUser.vaultSeedId;
  console.log(
    `[DeepRecovery] Starting scan for User ID ${requestingUserId} (@${requestingUser.username}). VaultSeed: ${userVaultSeedId || "MISSING"}`
  );
  function deepScan(dir) {
    if (!import_fs.default.existsSync(dir)) return;
    const entries = import_fs.default.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = import_path.default.join(dir, entry.name);
      if (entry.isDirectory()) {
        deepScan(fullPath);
      } else if (entry.name.endsWith(".meta")) {
        totalScanned++;
        const isLegacyMeta = entry.name.startsWith("file_");
        const isCasMeta = entry.name.startsWith("cas_") || entry.name.startsWith("vault_block_");
        if (!isLegacyMeta && !isCasMeta && !entry.name.startsWith("chunk_"))
          continue;
        let fileId = null;
        let resolvedMerkleRoot = null;
        let meta = null;
        try {
          meta = JSON.parse(import_fs.default.readFileSync(fullPath, "utf8"));
        } catch (e) {
          console.error(`[DeepRecovery] Failed to parse meta: ${fullPath}`);
          continue;
        }
        const encFilePath = fullPath.replace(".meta", "");
        if (isLegacyMeta || isCasMeta && entry.name.startsWith("vault_block_")) {
          let fileIdStr = entry.name.split(".")[0].replace("file_", "").replace("vault_block_", "").split("_")[0];
          fileId = parseInt(fileIdStr, 10);
          if (isNaN(fileId) && meta.fileId) fileId = meta.fileId;
          if (isNaN(fileId)) fileId = null;
        } else if (isCasMeta) {
          resolvedMerkleRoot = entry.name.replace("cas_", "").split(".")[0];
          if (meta.fileId) fileId = meta.fileId;
        }
        const isFolderCheck = meta.isFolder === true || meta.type === "directory" || meta.type === "folder";
        let isChunkedComplete = false;
        if (meta.chunkHashes && Array.isArray(meta.chunkHashes) && meta.chunkHashes.length > 0) {
          isChunkedComplete = meta.chunkHashes.every(
            (h) => import_fs.default.existsSync(getSecureChunkPath(h))
          );
        }
        const fileDataExists = import_fs.default.existsSync(encFilePath) || isChunkedComplete || isFolderCheck;
        if (!fileDataExists) {
          console.warn(
            `[DeepRecovery] Skipping ${entry.name}: Physical data file missing (${encFilePath})`
          );
          continue;
        }
        let exists = false;
        if (fileId !== null) {
          const existingRecord = db.prepare("SELECT userId FROM files WHERE id = ?").get(fileId);
          if (existingRecord) {
            if (existingRecord.userId === requestingUserId) {
              exists = true;
            } else {
              exists = false;
              fileId = null;
            }
          }
        }
        if (!exists && resolvedMerkleRoot) {
          exists = !!db.prepare("SELECT id FROM files WHERE merkleRoot = ? AND userId = ?").get(resolvedMerkleRoot, requestingUserId);
        }
        if (!exists) {
          if (meta?.name?.includes("stress_test_") || meta?.name?.includes("simulation_"))
            continue;
          const userKey = getUserEncryptionKey(requestingUserId);
          if (meta && isCorruptOrVirusVideo(
            meta.name,
            meta.type,
            meta.size,
            encFilePath,
            userKey
          )) {
            console.warn(
              `[Security Scan] Deleting corrupt/malicious record in deep scan: ${meta.name}`
            );
            try {
              if (import_fs.default.existsSync(encFilePath)) import_fs.default.unlinkSync(encFilePath);
              if (import_fs.default.existsSync(fullPath)) import_fs.default.unlinkSync(fullPath);
            } catch (err) {
            }
            continue;
          }
          let targetUserId = -1;
          if (meta) {
            const metaSeedId = meta.vaultSeedId || meta.originalOwnerSeedId || null;
            if (metaSeedId && userVaultSeedId && String(metaSeedId).trim() === String(userVaultSeedId).trim()) {
              targetUserId = requestingUserId;
              console.log(
                `[DeepRecovery] Hash Match: Orphan "${meta.name}" verified via stable VaultSeedId.`
              );
            } else if (meta.ownerHint && requestingUser && String(meta.ownerHint).toLowerCase().trim() === requestingUser.username.toLowerCase().trim()) {
              console.log(
                `[DeepRecovery] Hint Match: Orphan "${meta.name}" verified via username hint: ${meta.ownerHint}`
              );
              targetUserId = requestingUserId;
            } else if (Number(meta.userId) === Number(requestingUserId)) {
              console.log(
                `[DeepRecovery] ID Match: Orphan "${meta.name}" verified via legacy userId: ${meta.userId}`
              );
              targetUserId = requestingUserId;
            }
          }
          if (targetUserId === -1) {
            ownershipMismatches++;
            continue;
          }
          const duplicateEntry = db.prepare(
            "SELECT id FROM files WHERE userId = ? AND name = ? AND folderPath = ?"
          ).get(
            targetUserId,
            meta?.name || "Recovered",
            meta?.folderPath || "/"
          );
          if (duplicateEntry) {
            console.log(
              `[DeepRecovery] Skipping duplicate name/path: ${meta?.name} in ${meta?.folderPath}`
            );
            continue;
          }
          let fileName = meta?.name || `Recovered_File_${fileId || resolvedMerkleRoot?.substring(0, 8)}.enc`;
          try {
            if (fileId !== null) {
              db.prepare(
                `
                INSERT INTO files (id, userId, name, type, size, folderPath, isFolder, isShared, lastModified, clientEncrypted, shareNote, vaultSeedId, dagHash, previousDagHash, dagSignature, merkleRoot, encryptionKey)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `
              ).run(
                fileId,
                targetUserId,
                fileName,
                meta?.type || "application/octet-stream",
                meta?.size || (import_fs.default.existsSync(fullPath) ? import_fs.default.statSync(fullPath).size : 0),
                meta?.folderPath || "/",
                isFolderCheck ? 1 : 0,
                0,
                meta?.lastModified || Date.now(),
                meta?.clientEncrypted ? 1 : 0,
                "DEEP-RECOVERED - Authenticated partition match confirmed",
                userVaultSeedId,
                meta?.dagHash || null,
                meta?.previousDagHash || null,
                meta?.dagSignature || meta?.signature || null,
                meta?.merkleRoot || resolvedMerkleRoot || null,
                meta?.encryptionKey || null
              );
            } else {
              const info = db.prepare(
                `
                INSERT INTO files (userId, name, type, size, folderPath, isFolder, isShared, lastModified, clientEncrypted, shareNote, vaultSeedId, dagHash, previousDagHash, dagSignature, merkleRoot, encryptionKey)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `
              ).run(
                targetUserId,
                fileName,
                meta?.type || "application/octet-stream",
                meta?.size || (import_fs.default.existsSync(encFilePath) ? import_fs.default.statSync(encFilePath).size : 0),
                meta?.folderPath || "/",
                isFolderCheck ? 1 : 0,
                0,
                meta?.lastModified || Date.now(),
                meta?.clientEncrypted ? 1 : 0,
                "DEEP-RECOVERED - Authenticated partition match confirmed",
                userVaultSeedId,
                meta?.dagHash || null,
                meta?.previousDagHash || null,
                meta?.dagSignature || meta?.signature || null,
                meta?.merkleRoot || resolvedMerkleRoot || null,
                meta?.encryptionKey || null
              );
            }
            recoveredCount++;
            console.log(
              `[DeepRecovery] SUCCESS: Restored "${fileName}" to User ${targetUserId}`
            );
          } catch (e) {
            console.error(`[DeepRecovery] Failed to insert file record:`, e);
          }
        }
      }
    }
  }
  deepScan(VAULT_DATA_DIR);
  if (recoveredCount > 0) {
    try {
      rebuildUserDag(requestingUserId);
    } catch (e) {
    }
  }
  console.log(
    `[DeepRecovery] Cycle Complete. Recovered: ${recoveredCount}, Mismatches: ${ownershipMismatches}, Total Meta Scanned: ${totalScanned}`
  );
  return {
    recovered: recoveredCount,
    total_scanned: totalScanned,
    ownership_mismatches: ownershipMismatches
  };
}
var BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(buffer) {
  let result = "";
  let num = BigInt("0x" + buffer.toString("hex"));
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = BASE58_ALPHABET[0] + result;
  }
  return result;
}
function parseBootstrapMultiaddr(multiaddr) {
  const parts = multiaddr.split("/").filter(Boolean);
  const tcpIdx = parts.indexOf("tcp");
  const p2pIdx = parts.indexOf("p2p");
  if (tcpIdx === -1 || tcpIdx === 0) return null;
  const hostAddress = parts[tcpIdx - 1];
  const port = parts[tcpIdx + 1];
  if (!hostAddress || !port) return null;
  const peerId = p2pIdx !== -1 ? parts[p2pIdx + 1] : null;
  const isSecure = port === "443" || parts.includes("https") || parts.includes("wss");
  const protocol = isSecure ? "https" : "http";
  return {
    url: `${protocol}://${hostAddress}:${port}`,
    peerId
  };
}
function isValidHttpUrl(str) {
  if (!str) return false;
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function getSecureFilePath(fileId, merkleRoot) {
  const VAULT_DATA_DIR = import_path.default.join(process.cwd(), "vault_data");
  if (!import_fs.default.existsSync(VAULT_DATA_DIR)) {
    import_fs.default.mkdirSync(VAULT_DATA_DIR, { recursive: true });
  }
  let resolvedMerkle = merkleRoot;
  if (!resolvedMerkle && fileId && !isNaN(Number(fileId))) {
    try {
      const file = db.prepare("SELECT merkleRoot FROM files WHERE id = ?").get(fileId);
      resolvedMerkle = file?.merkleRoot;
    } catch (e) {
    }
  }
  const useCas = resolvedMerkle && resolvedMerkle !== "GENESIS_MERKLE_ROOT_000000000000000000" && !resolvedMerkle.startsWith("FOLDER_ROOT_");
  const oldPath = import_path.default.join(VAULT_DATA_DIR, `file_${fileId}.enc`);
  const keyToHash = useCas ? `cas_${resolvedMerkle}` : String(fileId);
  const hash = import_crypto.default.createHash("sha256").update(keyToHash).digest("hex");
  const level1 = hash.substring(0, 2);
  const level2 = hash.substring(2, 4);
  const targetDir = import_path.default.join(VAULT_DATA_DIR, level1, level2);
  if (!import_fs.default.existsSync(targetDir)) {
    import_fs.default.mkdirSync(targetDir, { recursive: true });
  }
  const fileName = useCas ? `cas_${resolvedMerkle}.enc` : `file_${fileId}.enc`;
  const newPath = import_path.default.join(targetDir, fileName);
  if (import_fs.default.existsSync(oldPath)) {
    try {
      import_fs.default.renameSync(oldPath, newPath);
    } catch (e) {
      console.warn(
        `Dynamic migration failed for file_${fileId}, fallback to legacy root:`,
        e
      );
      return oldPath;
    }
  }
  return newPath;
}
function getSecureChunkPath(chunkHash) {
  const VAULT_DATA_DIR = import_path.default.join(process.cwd(), "vault_data");
  const CHUNKS_DIR = import_path.default.join(VAULT_DATA_DIR, "chunks");
  if (!import_fs.default.existsSync(CHUNKS_DIR)) {
    import_fs.default.mkdirSync(CHUNKS_DIR, { recursive: true });
  }
  const hash = import_crypto.default.createHash("sha256").update(chunkHash).digest("hex");
  const level1 = hash.substring(0, 2);
  const level2 = hash.substring(2, 4);
  const targetDir = import_path.default.join(CHUNKS_DIR, level1, level2);
  if (!import_fs.default.existsSync(targetDir)) {
    import_fs.default.mkdirSync(targetDir, { recursive: true });
  }
  return import_path.default.join(targetDir, `chunk_${chunkHash}.enc`);
}
function safeDeleteFileChunks(fileId) {
  try {
    const chunks = db.prepare("SELECT chunkHash FROM file_chunks WHERE fileId = ?").all(fileId);
    for (const chunk of chunks) {
      const hash = chunk.chunkHash;
      const refResult = db.prepare(
        "SELECT COUNT(*) as count FROM file_chunks WHERE chunkHash = ? AND fileId != ?"
      ).get(hash, fileId);
      if (refResult && refResult.count === 0) {
        const chunkPath = getSecureChunkPath(hash);
        try {
          if (import_fs.default.existsSync(chunkPath)) import_fs.default.unlinkSync(chunkPath);
        } catch (e) {
        }
      }
    }
    db.prepare("DELETE FROM file_chunks WHERE fileId = ?").run(fileId);
  } catch (e) {
    console.error(
      `[CAS] Failed to safely delete chunks for fileId ${fileId}:`,
      e
    );
  }
}
function safeDeletePhysicalFile(fileId, merkleRoot) {
  safeDeleteFileChunks(fileId);
  const filePath = getSecureFilePath(fileId, merkleRoot);
  let canDelete = true;
  if (merkleRoot && merkleRoot !== "GENESIS_MERKLE_ROOT_000000000000000000" && !merkleRoot.startsWith("FOLDER_ROOT_")) {
    try {
      const result = db.prepare(
        "SELECT COUNT(*) as count FROM files WHERE merkleRoot = ? AND id != ?"
      ).get(merkleRoot, fileId);
      const resultVersions = db.prepare(
        "SELECT COUNT(*) as count FROM file_versions WHERE merkleRoot = ? AND fileId != ?"
      ).get(merkleRoot, fileId);
      const resultMesh = db.prepare(
        "SELECT COUNT(*) as count FROM mesh_shadow_blocks WHERE merkleRoot = ?"
      ).get(merkleRoot);
      const totalCount = (result?.count || 0) + (resultVersions?.count || 0) + (resultMesh?.count || 0);
      if (totalCount > 0) {
        canDelete = false;
        console.log(
          `[CAS] Retaining deduplicated physical file on disk. merkleRoot other reference count is ${totalCount}`
        );
      }
    } catch (e) {
      console.warn("[CAS] Reference counting query warning:", e);
    }
  }
  if (canDelete) {
    try {
      if (import_fs.default.existsSync(filePath)) import_fs.default.unlinkSync(filePath);
    } catch (e) {
    }
    try {
      if (import_fs.default.existsSync(filePath + ".meta")) import_fs.default.unlinkSync(filePath + ".meta");
    } catch (e) {
    }
    try {
      const old = import_path.default.join(process.cwd(), "vault_data", `file_${fileId}.enc`);
      if (import_fs.default.existsSync(old)) import_fs.default.unlinkSync(old);
      if (import_fs.default.existsSync(old + ".meta")) import_fs.default.unlinkSync(old + ".meta");
    } catch (e) {
    }
  }
}
function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      displayName TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      passwordSalt TEXT NOT NULL,
      joinedAt INTEGER NOT NULL,
      avatarColor TEXT,
      autoLockInterval INTEGER DEFAULT 0,
      privateVaultId TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      privateVaultId TEXT,
      name TEXT NOT NULL,
      data BLOB,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      folderPath TEXT NOT NULL,
      isFolder INTEGER NOT NULL,
      isShared INTEGER NOT NULL,
      senderName TEXT,
      shareNote TEXT,
      lastModified INTEGER NOT NULL,
      sigAlgorithm TEXT DEFAULT 'HMAC-SHA256',
      merkleRoot TEXT DEFAULT NULL,
      deletedAt INTEGER,
      originalFolderPath TEXT,
      clientEncrypted INTEGER DEFAULT 1,
      dagHash TEXT,
      previousDagHash TEXT,
      dagSignature TEXT,
      vaultSeedId TEXT,
      encryptionKey TEXT,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS mesh_shadow_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ownerId INTEGER NOT NULL,
      dagHash TEXT UNIQUE NOT NULL,
      merkleRoot TEXT,
      metadata TEXT NOT NULL,
      encryptedContent BLOB NOT NULL,
      syncedAt INTEGER NOT NULL
    );
  `);
  const migrations = [
    "ALTER TABLE files ADD COLUMN deletedAt INTEGER DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN originalFolderPath TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN shareNote TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN avatarColor TEXT DEFAULT '#6366f1'",
    "ALTER TABLE users ADD COLUMN autoLockInterval INTEGER DEFAULT 0",
    "ALTER TABLE files ADD COLUMN clientEncrypted INTEGER DEFAULT 1",
    "ALTER TABLE files ADD COLUMN dagHash TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN previousDagHash TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN dagSignature TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN sigAlgorithm TEXT DEFAULT 'HMAC-SHA256'",
    "ALTER TABLE files ADD COLUMN merkleRoot TEXT DEFAULT NULL",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN metadata TEXT DEFAULT '{}'",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN encryptedContent BLOB DEFAULT NULL",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN ownerId INTEGER DEFAULT 0",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN syncedAt INTEGER DEFAULT 0",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN merkleRoot TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN vaultSeedId TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN vaultSeedId TEXT DEFAULT NULL",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN vaultSeedId TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN encryptionKey TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN cryptoBlockNumber INTEGER DEFAULT 0",
    "ALTER TABLE files ADD COLUMN originalOwnerSeedId TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN peerReceiverSeedId TEXT DEFAULT NULL",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN cryptoBlockNumber INTEGER DEFAULT 0",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN originalOwnerSeedId TEXT DEFAULT NULL",
    "ALTER TABLE mesh_shadow_blocks ADD COLUMN peerReceiverSeedId TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN migrationUserKey TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN privateVaultId TEXT DEFAULT NULL",
    "ALTER TABLE files ADD COLUMN privateVaultId TEXT DEFAULT NULL"
  ];
  for (const m of migrations) {
    try {
      db.exec(m);
    } catch (e) {
    }
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mesh_tombstones (
        dagHash TEXT PRIMARY KEY,
        ownerId INTEGER,
        deletedAt INTEGER
      )
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_mesh_tombstone_owner ON mesh_tombstones(ownerId);"
    );
  } catch (e) {
    console.error("[Migration] Failed to create mesh_tombstones table:", e);
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fileId INTEGER NOT NULL,
        chunkIndex INTEGER NOT NULL,
        chunkHash TEXT NOT NULL,
        isUploaded INTEGER DEFAULT 0,
        FOREIGN KEY(fileId) REFERENCES files(id) ON DELETE CASCADE
      )
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_file_chunks_fileId ON file_chunks(fileId);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_file_chunks_hash ON file_chunks(chunkHash);"
    );
  } catch (e) {
    console.error("[Migration] Failed to create file_chunks table:", e);
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fileId INTEGER NOT NULL,
        merkleRoot TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        lastModified INTEGER NOT NULL,
        savedAt INTEGER NOT NULL,
        encryptionKey TEXT,
        FOREIGN KEY(fileId) REFERENCES files(id) ON DELETE CASCADE
      )
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_file_versions_fileId ON file_versions(fileId);"
    );
  } catch (e) {
    console.error("[Migration] Failed to create file_versions table:", e);
  }
  try {
    const tableInfo = db.prepare("PRAGMA table_info(mesh_shadow_blocks)").all();
    const hasUserId = tableInfo.some((c) => c.name === "userId");
    const hasOwnerId = tableInfo.some((c) => c.name === "ownerId");
    if (hasUserId && hasOwnerId) {
      db.prepare(
        "UPDATE mesh_shadow_blocks SET ownerId = userId WHERE ownerId = 0 OR ownerId IS NULL"
      ).run();
      console.log(
        "[Migration] Successfully synchronized ownerId from legacy userId column in mesh_shadow_blocks."
      );
    }
  } catch (e) {
    console.error("[Migration] Failed to synchronize ownerId:", e);
  }
  try {
    const allUsers = db.prepare("SELECT * FROM users").all();
    for (const u of allUsers) {
      if (!u.vaultSeedId) {
        const derivedSeedId = import_crypto.default.createHmac("sha256", u.passwordHash).update(u.username.toLowerCase()).digest("hex");
        db.prepare("UPDATE users SET vaultSeedId = ? WHERE id = ?").run(
          derivedSeedId,
          u.id
        );
        console.log(
          `[Backfill] Deterministically derived and stored vaultSeedId for user ${u.username}`
        );
      }
    }
  } catch (e) {
    console.error(
      "[Backfill] Failed to update vaultSeedId for legacy users:",
      e
    );
  }
  try {
    const allUsers = db.prepare("SELECT id, vaultSeedId FROM users").all();
    for (const u of allUsers) {
      if (u.vaultSeedId) {
        db.prepare(
          "UPDATE files SET vaultSeedId = ? WHERE userId = ? AND (vaultSeedId IS NULL OR vaultSeedId = '')"
        ).run(u.vaultSeedId, u.id);
        db.prepare(
          "UPDATE mesh_shadow_blocks SET vaultSeedId = ? WHERE ownerId = ? AND (vaultSeedId IS NULL OR vaultSeedId = '')"
        ).run(u.vaultSeedId, u.id);
      }
    }
    console.log(
      "[Backfill] Successfully propagated vaultSeedId to all files and shadow blocks in DB."
    );
  } catch (e) {
    console.error("[Backfill] Propagate vaultSeedId error:", e);
  }
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(userId);");
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_files_folder_path ON files(folderPath);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deletedAt);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_files_user_folder ON files(userId, folderPath);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_mesh_ownerId ON mesh_shadow_blocks(ownerId);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_mesh_dagHash ON mesh_shadow_blocks(dagHash);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_users_vault_seed ON users(vaultSeedId);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_files_vault_seed ON files(vaultSeedId);"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_mesh_vault_seed ON mesh_shadow_blocks(vaultSeedId);"
    );
  } catch (e) {
    console.error("Failed to build high-scale performance indices:", e);
  }
}
function getVaultSeedIdForUser(userId) {
  try {
    const u = db.prepare("SELECT vaultSeedId FROM users WHERE id = ?").get(userId);
    return u?.vaultSeedId || null;
  } catch (e) {
    return null;
  }
}
function runStorageGarbageCollector() {
  const VAULT_DATA_DIR = import_path.default.join(process.cwd(), "vault_data");
  if (!import_fs.default.existsSync(VAULT_DATA_DIR)) return;
  console.log("[StorageGC] Starting Storage Garbage Collection...");
  let deletedOrphanFilesCount = 0;
  let deletedOrphanChunksCount = 0;
  let deletedTrashFilesCount = 0;
  let totalBytesFreed = 0;
  const getFilesRecursively = (dir) => {
    let results = [];
    if (!import_fs.default.existsSync(dir)) return results;
    try {
      const list = import_fs.default.readdirSync(dir);
      for (const file of list) {
        const fullPath = import_path.default.join(dir, file);
        const stat = import_fs.default.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getFilesRecursively(fullPath));
        } else {
          results.push(fullPath);
        }
      }
    } catch (e) {
      console.error("[StorageGC] Error traversing directory:", dir, e);
    }
    return results;
  };
  try {
    const allFiles = db.prepare("SELECT id, merkleRoot, size FROM files").all();
    const activeFileIds = /* @__PURE__ */ new Set();
    const activeMerkleRoots = /* @__PURE__ */ new Set();
    for (const f of allFiles) {
      activeFileIds.add(String(f.id));
      if (f.merkleRoot) {
        activeMerkleRoots.add(f.merkleRoot);
      }
    }
    const allChunks = db.prepare("SELECT chunkHash FROM file_chunks").all();
    const activeChunkHashes = /* @__PURE__ */ new Set();
    for (const c of allChunks) {
      activeChunkHashes.add(c.chunkHash);
    }
    const allUsers = db.prepare("SELECT vaultSeedId FROM users").all();
    const activeUserSeeds = /* @__PURE__ */ new Set();
    for (const u of allUsers) {
      if (u.vaultSeedId) activeUserSeeds.add(u.vaultSeedId);
    }
    const allPhysicalFiles = getFilesRecursively(VAULT_DATA_DIR);
    for (const filePath of allPhysicalFiles) {
      if (filePath.includes(import_path.default.sep + "chunks" + import_path.default.sep)) {
        continue;
      }
      const baseName = import_path.default.basename(filePath);
      if (!baseName.endsWith(".enc") && !baseName.endsWith(".meta")) {
        continue;
      }
      let isOrphan = false;
      const isCas = baseName.startsWith("cas_") || baseName.startsWith("vault_block_");
      if (isCas) {
        const merkle = baseName.replace("cas_", "").replace("vault_block_", "").replace(".enc", "").replace(".meta", "").split("_")[0];
        if (!activeMerkleRoots.has(merkle)) {
          isOrphan = true;
        }
      } else if (baseName.startsWith("file_")) {
        const idString = baseName.replace("file_", "").replace(".enc", "").replace(".meta", "").split("_")[0];
        if (!activeFileIds.has(idString)) {
          isOrphan = true;
        }
      }
      if (isOrphan) {
        const metaPath = filePath.endsWith(".meta") ? filePath : filePath + ".meta";
        if (import_fs.default.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(import_fs.default.readFileSync(metaPath, "utf8"));
            if (meta.vaultSeedId && activeUserSeeds.has(meta.vaultSeedId)) {
              continue;
            }
          } catch (e) {
          }
        }
      }
      if (isOrphan) {
        try {
          const size = import_fs.default.statSync(filePath).size;
          import_fs.default.unlinkSync(filePath);
          deletedOrphanFilesCount++;
          totalBytesFreed += size;
        } catch (e) {
          console.error(
            `[StorageGC] Failed to delete orphan file ${filePath}:`,
            e
          );
        }
      }
    }
    const chunksDir = import_path.default.join(VAULT_DATA_DIR, "chunks");
    if (import_fs.default.existsSync(chunksDir)) {
      const allPhysicalChunks = getFilesRecursively(chunksDir);
      for (const chunkPath of allPhysicalChunks) {
        const baseName = import_path.default.basename(chunkPath);
        if (baseName.startsWith("chunk_") && baseName.endsWith(".enc")) {
          const hashVal = baseName.replace("chunk_", "").replace(".enc", "");
          if (!activeChunkHashes.has(hashVal)) {
            try {
              const size = import_fs.default.statSync(chunkPath).size;
              import_fs.default.unlinkSync(chunkPath);
              deletedOrphanChunksCount++;
              totalBytesFreed += size;
            } catch (e) {
              console.error(
                `[StorageGC] Failed to delete orphan chunk ${chunkPath}:`,
                e
              );
            }
          }
        }
      }
    }
    console.log(
      `[StorageGC] Completed. Freed: ${(totalBytesFreed / (1024 * 1024)).toFixed(2)} MB. Purged orphans: ${deletedOrphanFilesCount} files, ${deletedOrphanChunksCount} chunks.`
    );
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1e3;
    const cutoffDate = Date.now() - THIRTY_DAYS_MS;
    const trashFiles = db.prepare("SELECT id, name, merkleRoot FROM files WHERE deletedAt IS NOT NULL AND deletedAt < ?").all(cutoffDate);
    if (trashFiles.length > 0) {
      console.log(`[StorageGC] Auto-purging ${trashFiles.length} files from trash (older than 30 days)...`);
      for (const f of trashFiles) {
        db.prepare("DELETE FROM files WHERE id = ?").run(f.id);
        safeDeletePhysicalFile(f.id, f.merkleRoot);
        deletedTrashFilesCount++;
      }
      console.log(`[StorageGC] Trash cleanup complete. Purged: ${deletedTrashFilesCount} files.`);
    }
  } catch (e) {
    console.error("[StorageGC] Error during storage garbage collection:", e);
  }
}
runMigrations();
runStorageGarbageCollector();
setInterval(runStorageGarbageCollector, 10 * 60 * 1e3);
function autoPromoteMeshBlocks() {
  try {
    const usersToRebuildSet = /* @__PURE__ */ new Set();
    let totalPromoted = 0;
    const orphans = db.prepare(
      `
      SELECT s.* FROM mesh_shadow_blocks s
      LEFT JOIN files f ON s.dagHash = f.dagHash
      LEFT JOIN mesh_tombstones t ON s.dagHash = t.dagHash
      WHERE f.id IS NULL AND t.dagHash IS NULL
    `
    ).all();
    for (const shadow of orphans) {
      try {
        const meta = JSON.parse(shadow.metadata);
        if (!meta || !meta.name) continue;
        if (meta.name.includes("stress_test_") || meta.name.includes("simulation_"))
          continue;
        let shadowOwnerId = 0;
        const shadowSeedId = shadow.vaultSeedId || meta.vaultSeedId;
        if (shadowSeedId) {
          const matchingLocalUser = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(shadowSeedId);
          if (matchingLocalUser) {
            shadowOwnerId = matchingLocalUser.id;
          } else {
            continue;
          }
        } else {
          continue;
        }
        const userRow = db.prepare("SELECT vaultSeedId FROM users WHERE id = ?").get(shadowOwnerId);
        if (!userRow) continue;
        const insertRes = db.prepare(
          `
          INSERT INTO files (userId, name, type, size, folderPath, isFolder, isShared, lastModified, clientEncrypted, shareNote, dagHash, previousDagHash, dagSignature, merkleRoot, vaultSeedId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          shadowOwnerId,
          meta.name,
          meta.type || "application/octet-stream",
          meta.size || shadow.encryptedContent.length,
          meta.folderPath || "/",
          0,
          0,
          meta.lastModified || Date.now(),
          1,
          "FETCHED - Automatically synchronized from decentralized mesh",
          shadow.dagHash,
          meta.previousDagHash || null,
          meta.dagSignature || null,
          meta.merkleRoot || null,
          userRow.vaultSeedId
        );
        const newFileId = Number(insertRes.lastInsertRowid);
        const filePath = getSecureFilePath(newFileId, meta.merkleRoot);
        if (!import_fs.default.existsSync(filePath)) {
          import_fs.default.writeFileSync(filePath, shadow.encryptedContent);
          import_fs.default.writeFileSync(
            filePath + ".meta",
            JSON.stringify({
              ...meta,
              ownerId: shadowOwnerId,
              vaultSeedId: userRow.vaultSeedId,
              recoveredAt: Date.now()
            })
          );
        } else {
          console.log(
            `[CAS] Deduplicated mesh synchronized block ${shadow.dagHash}. Physical content already exists.`
          );
        }
        usersToRebuildSet.add(shadowOwnerId);
        totalPromoted++;
      } catch (err) {
        console.error(
          `[MeshSync] Failed to promote shadow block ${shadow.dagHash}:`,
          err.message
        );
      }
    }
    if (totalPromoted > 0) {
      for (const uid of usersToRebuildSet) {
        rebuildUserDag(uid);
      }
    }
  } catch (err) {
    console.error("[MeshSync] Error in auto-promotion engine:", err);
  }
}
setInterval(autoPromoteMeshBlocks, 1e4);
function healExistingFilesAndShadowBlocks() {
  try {
    const users = db.prepare("SELECT id, username, vaultSeedId FROM users").all();
    const userMap = /* @__PURE__ */ new Map();
    for (const u of users) {
      if (u.vaultSeedId) {
        userMap.set(u.id, u.vaultSeedId);
      }
    }
    const dbFiles = db.prepare("SELECT id, userId, name, vaultSeedId, isShared FROM files").all();
    let purgedCount = 0;
    for (const f of dbFiles) {
      if (f.isShared) continue;
      const correctSeedId = userMap.get(f.userId);
      if (correctSeedId && f.vaultSeedId && f.vaultSeedId !== correctSeedId) {
        console.log(
          `[CleanUp] Indexing mismatch: ${f.name} (File ID: ${f.id}) mapped to userId: ${f.userId} but meta has vaultSeedId: ${f.vaultSeedId}. Checking re-mapping...`
        );
        const actualOwner = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(f.vaultSeedId);
        if (actualOwner && actualOwner.id !== f.userId) {
          console.log(
            `[CleanUp] Re-mapping file ${f.id} to correct owner ${actualOwner.id}`
          );
          db.prepare("UPDATE files SET userId = ? WHERE id = ?").run(
            actualOwner.id,
            f.id
          );
        } else {
          db.prepare("DELETE FROM files WHERE id = ?").run(f.id);
          purgedCount++;
        }
      }
    }
    if (purgedCount > 0) {
      console.log(
        `[CleanUp] Successfully purged ${purgedCount} mismatched file indices.`
      );
    }
  } catch (err) {
    console.error("[CleanUp] Error during mismatched files purging:", err);
  }
  try {
    const files = db.prepare("SELECT * FROM files WHERE isFolder = 0 AND size > 0").all();
    for (const file of files) {
      const blockContent = getFileDataBuffer(file.id);
      if (!blockContent) {
        console.warn(
          `[Heal] File ID ${file.id} lacks readable physical/chunk copy as of now. Skipping registration validation.`
        );
        continue;
      }
      if (file.dagHash) {
        try {
          const shadow = db.prepare(
            "SELECT length(encryptedContent) as len, COUNT(*) as count FROM mesh_shadow_blocks WHERE dagHash = ?"
          ).get(file.dagHash);
          const needsUpdate = !shadow || shadow.count === 0 || shadow.len !== blockContent.length;
          if (needsUpdate) {
            const userVaultSeedId = getVaultSeedIdForUser(file.userId);
            db.prepare(
              `
              INSERT OR REPLACE INTO mesh_shadow_blocks (ownerId, dagHash, metadata, encryptedContent, syncedAt, vaultSeedId)
              VALUES (?, ?, ?, ?, ?, ?)
            `
            ).run(
              file.userId,
              file.dagHash,
              JSON.stringify({
                userId: file.userId,
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified,
                dagHash: file.dagHash,
                previousDagHash: file.previousDagHash,
                dagSignature: file.dagSignature,
                merkleRoot: file.merkleRoot,
                vaultSeedId: userVaultSeedId
              }),
              blockContent,
              Date.now(),
              userVaultSeedId
            );
            console.log(
              `[Heal] Updated empty or incorrect length shadow block for file ID ${file.id} (${file.name}) with vaultSeedId ${userVaultSeedId}.`
            );
          }
        } catch (shErr) {
          console.error(
            `[Heal] Failed to update shadow block for file ID ${file.id}:`,
            shErr
          );
        }
      }
    }
  } catch (err) {
    console.error("Failed to run active database DAG healing:", err);
  }
}
healExistingFilesAndShadowBlocks();
function computeBlockDagMetadata(userId, currentItem) {
  const lastFile = db.prepare(
    "SELECT dagHash FROM files WHERE userId = ? ORDER BY id DESC LIMIT 1"
  ).get(userId);
  const previousDagHash = lastFile?.dagHash || "GENESIS_BLOCK_000000000000000000000000000000";
  let mRoot = "GENESIS_MERKLE_ROOT_000000000000000000";
  if (currentItem.buffer) {
    mRoot = computeMerkleRoot(currentItem.buffer);
  } else if (currentItem.filePath && import_fs.default.existsSync(currentItem.filePath)) {
    try {
      mRoot = computeMerkleRoot(import_fs.default.readFileSync(currentItem.filePath));
    } catch (e) {
    }
  } else if (currentItem.id) {
    const filePath = getSecureFilePath(currentItem.id);
    if (import_fs.default.existsSync(filePath)) {
      try {
        mRoot = computeMerkleRoot(import_fs.default.readFileSync(filePath));
      } catch (e) {
      }
    }
  }
  const payloadToHash = `${previousDagHash}::${currentItem.name}::${currentItem.size}::${currentItem.type}::${currentItem.lastModified}::${mRoot}`;
  const dagHash = import_crypto.default.createHash("sha256").update(payloadToHash).digest("hex");
  const dagSignature = import_crypto.default.createHmac("sha256", VAULT_MASTER_KEY).update(dagHash).digest("hex");
  return {
    previousDagHash,
    dagHash,
    dagSignature,
    merkleRoot: mRoot,
    sigAlgorithm: "HMAC-SHA256"
  };
}
function getFileDataBuffer(fileId) {
  try {
    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
    if (!file) return null;
    if (file.isFolder) return Buffer.alloc(0);
    const fileChunks = db.prepare(
      "SELECT chunkHash FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC"
    ).all(fileId);
    if (fileChunks.length > 0) {
      const buffers = [];
      for (const chunk of fileChunks) {
        const chunkPath = getSecureChunkPath(chunk.chunkHash);
        if (import_fs.default.existsSync(chunkPath)) {
          buffers.push(import_fs.default.readFileSync(chunkPath));
        } else {
          console.warn(
            `[getFileDataBuffer] Missing chunk file: ${chunk.chunkHash} for file ID ${fileId}`
          );
          return null;
        }
      }
      return Buffer.concat(buffers);
    }
    const filePath = getSecureFilePath(fileId);
    if (import_fs.default.existsSync(filePath)) {
      return import_fs.default.readFileSync(filePath);
    }
    if (file.dagHash) {
      const shadowBlock = db.prepare(
        "SELECT encryptedContent FROM mesh_shadow_blocks WHERE dagHash = ?"
      ).get(file.dagHash);
      if (shadowBlock && shadowBlock.encryptedContent && shadowBlock.encryptedContent.length > 0) {
        return shadowBlock.encryptedContent;
      }
    }
  } catch (err) {
    console.error(
      `[getFileDataBuffer] Error reading file buffer for ${fileId}:`,
      err
    );
  }
  return null;
}
function registerMeshShadowBlock(fileId) {
  try {
    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
    if (!file || file.isFolder) return;
    if (!file.dagHash) return;
    const blockContent = getFileDataBuffer(fileId);
    if (!blockContent) {
      console.warn(
        `[MeshShadow] Could not retrieve file data buffer for ${fileId} during registration.`
      );
      return;
    }
    const userVaultSeedId = getVaultSeedIdForUser(file.userId);
    db.prepare(
      `
      INSERT OR REPLACE INTO mesh_shadow_blocks (ownerId, dagHash, metadata, encryptedContent, syncedAt, vaultSeedId)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      file.userId,
      file.dagHash,
      JSON.stringify({
        userId: file.userId,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        dagHash: file.dagHash,
        previousDagHash: file.previousDagHash,
        dagSignature: file.dagSignature,
        merkleRoot: file.merkleRoot,
        vaultSeedId: userVaultSeedId,
        encryptionKey: file.encryptionKey || null
      }),
      blockContent,
      Date.now(),
      userVaultSeedId
    );
    console.log(
      `[MeshShadow] Registered file ID ${fileId} (${file.name}) to mesh_shadow_blocks. Size: ${blockContent.length} bytes.`
    );
  } catch (err) {
    console.error(
      `[MeshShadow] Failed to register file ID ${fileId} into mesh_shadow_blocks:`,
      err.message
    );
  }
}
function rebuildUserDag(userId) {
  const files = db.prepare("SELECT * FROM files WHERE userId = ? ORDER BY id ASC").all(userId);
  let currentPreviousHash = "GENESIS_BLOCK_000000000000000000000000000000";
  const updateStmt = db.prepare(
    "UPDATE files SET previousDagHash = ?, dagHash = ?, dagSignature = ?, merkleRoot = ? WHERE id = ?"
  );
  const transaction = db.transaction((items) => {
    for (const currentItem of items) {
      const filePath = getSecureFilePath(currentItem.id);
      let fileBuffer = null;
      if (import_fs.default.existsSync(filePath)) {
        try {
          fileBuffer = import_fs.default.readFileSync(filePath);
        } catch (e) {
        }
      }
      let mRoot = "GENESIS_MERKLE_ROOT_000000000000000000";
      if (currentItem.isFolder) {
        mRoot = "FOLDER_ROOT_000000000000000000000000000000";
      } else {
        const chunks = db.prepare(
          "SELECT chunkHash FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC"
        ).all(currentItem.id);
        if (chunks.length > 0) {
          const combinedHashes = chunks.map((c) => c.chunkHash).join("");
          mRoot = import_crypto.default.createHash("sha256").update(combinedHashes).digest("hex");
        } else {
          mRoot = computeMerkleRoot(fileBuffer) || "GENESIS_MERKLE_ROOT_000000000000000000";
        }
      }
      const payloadToHash = `${currentPreviousHash}::${currentItem.name}::${currentItem.size}::${currentItem.type}::${currentItem.lastModified}::${mRoot}`;
      const computedDagHash = import_crypto.default.createHash("sha256").update(payloadToHash).digest("hex");
      const computedDagSignature = import_crypto.default.createHmac("sha256", VAULT_MASTER_KEY).update(computedDagHash).digest("hex");
      updateStmt.run(
        currentPreviousHash,
        computedDagHash,
        computedDagSignature,
        mRoot,
        currentItem.id
      );
      currentPreviousHash = computedDagHash;
    }
  });
  transaction(files);
  return files.length;
}
async function startServer() {
  const app = (0, import_express.default)();
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });
  const PORT = 3e3;
  app.use(
    (0, import_compression.default)({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        const contentType = res.getHeader("Content-Type");
        if (contentType && (contentType.includes("application/octet-stream") || contentType.includes("image/") || contentType.includes("video/") || contentType.includes("audio/"))) {
          return false;
        }
        return import_compression.default.filter(req, res);
      }
    })
  );
  app.post("/api/files/upload-raw", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Missing X-User-Id header" });
    }
    const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(headerUserId);
    if (!userExists) {
      return res.status(401).json({
        error: "User session invalid or database reset. Please register/login again."
      });
    }
    const metadataHeader = req.header("X-File-Metadata");
    if (!metadataHeader) {
      return res.status(400).json({ error: "Missing metadata header" });
    }
    let metadata;
    try {
      metadata = JSON.parse(decodeURIComponent(metadataHeader));
    } catch (err) {
      return res.status(400).json({ error: "Invalid metadata header" });
    }
    const VAULT_DATA_DIR = import_path.default.join(process.cwd(), "vault_data");
    if (!import_fs.default.existsSync(VAULT_DATA_DIR)) {
      import_fs.default.mkdirSync(VAULT_DATA_DIR, { recursive: true });
    }
    const clientEncrypted = metadata.clientEncrypted !== false;
    let fileKeyBuffer = getUserEncryptionKey(headerUserId);
    let localEncryptionKeyStr = null;
    if (!clientEncrypted) {
      fileKeyBuffer = import_crypto.default.randomBytes(32);
      localEncryptionKeyStr = fileKeyBuffer.toString("base64");
    }
    const tempFileId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const tempFilePath = import_path.default.join(
      VAULT_DATA_DIR,
      `temp_upload_${tempFileId}.tmp`
    );
    const writeStream = import_fs.default.createWriteStream(tempFilePath, {
      highWaterMark: 1024 * 1024
    });
    req.on("aborted", () => {
      try {
        if (import_fs.default.existsSync(tempFilePath)) {
          writeStream.destroy();
          import_fs.default.unlinkSync(tempFilePath);
        }
      } catch (e) {
      }
    });
    if (!clientEncrypted) {
      const layeredEncrypt = new LayeredEncryptTransform(fileKeyBuffer);
      req.pipe(layeredEncrypt).pipe(writeStream);
    } else {
      req.pipe(writeStream);
    }
    writeStream.on("error", (err) => {
      console.error("Write stream error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Stream write error" });
    });
    writeStream.on("finish", () => {
      try {
        const argUserId = Number(metadata.userId);
        const argName = metadata.name;
        const argType = metadata.type || "application/octet-stream";
        const argSize = typeof metadata.size === "number" ? metadata.size : 0;
        const userKey = getUserEncryptionKey(argUserId);
        if (isCorruptOrVirusVideo(
          argName,
          argType,
          argSize,
          tempFilePath,
          userKey
        )) {
          try {
            if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
          } catch (e) {
          }
          return res.status(400).json({
            error: "Upload blocked: File is suspected to be a corrupt video or malware/virus."
          });
        }
        const argFolderPath = metadata.folderPath || "/";
        const argIsFolder = metadata.isFolder ? 1 : 0;
        const argIsShared = metadata.isShared ? 1 : 0;
        const argSenderName = metadata.senderName ?? null;
        const argShareNote = metadata.shareNote ?? null;
        const argLastModified = metadata.lastModified || Date.now();
        const dagMetadata = computeBlockDagMetadata(argUserId, {
          name: argName,
          size: argSize,
          type: argType,
          lastModified: argLastModified,
          filePath: tempFilePath
        });
        const userVaultSeedId = getVaultSeedIdForUser(argUserId);
        const stmt = db.prepare(`
          INSERT INTO files (userId, name, data, type, size, folderPath, isFolder, isShared, senderName, shareNote, lastModified, clientEncrypted, previousDagHash, dagHash, dagSignature, merkleRoot, vaultSeedId, encryptionKey) 
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          argUserId,
          argName,
          argType,
          argSize,
          argFolderPath,
          argIsFolder,
          argIsShared,
          argSenderName,
          argShareNote,
          argLastModified,
          clientEncrypted ? 1 : 0,
          dagMetadata.previousDagHash,
          dagMetadata.dagHash,
          dagMetadata.dagSignature,
          dagMetadata.merkleRoot,
          userVaultSeedId,
          localEncryptionKeyStr
        );
        const insertedId = Number(info.lastInsertRowid);
        const finalFilePath = getSecureFilePath(
          insertedId,
          dagMetadata.merkleRoot
        );
        if (import_fs.default.existsSync(finalFilePath)) {
          console.log(
            `[CAS] Deduplicated raw file upload. Content already exists under hash: ${dagMetadata.merkleRoot}`
          );
          try {
            if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
          } catch (e) {
          }
        } else {
          import_fs.default.renameSync(tempFilePath, finalFilePath);
        }
        const metaPath = finalFilePath + ".meta";
        const metaData = {
          name: argName,
          type: argType,
          size: argSize,
          userId: argUserId,
          receiverId: argUserId,
          // sync peer receiver id context
          folderPath: argFolderPath,
          isFolder: argIsFolder === 1,
          isShared: argIsShared === 1,
          senderName: argSenderName,
          clientEncrypted,
          lastModified: argLastModified,
          ownerHint: getCurrentUserUsername(argUserId),
          vaultSeedId: userVaultSeedId
        };
        if (localEncryptionKeyStr) {
          metaData.encryptionKey = localEncryptionKeyStr;
        }
        if (metadata.originalId) metaData.originalId = metadata.originalId;
        import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
        registerMeshShadowBlock(insertedId);
        scheduleMeshReplication(argUserId, insertedId);
        res.json({ id: insertedId, vaultSeedId: userVaultSeedId });
      } catch (err) {
        console.error("Server raw upload completion error:", err);
        try {
          if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
        } catch (e) {
        }
        if (!res.headersSent)
          res.status(500).json({ error: "Storage error: " + err.message });
      }
    });
    writeStream.on("error", (err) => {
      console.error("Write stream error during raw upload:", err);
      try {
        if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
      } catch (e) {
      }
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to stream upload contents to disk" });
    });
    req.on("error", (err) => {
      console.error("Request read error during raw upload:", err);
      try {
        if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
      } catch (e) {
      }
      if (!res.headersSent)
        res.status(500).json({ error: "Upload read error" });
    });
  });
  app.post("/api/files/chunked/init", import_express.default.json(), (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Missing X-User-Id header" });
    }
    const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(headerUserId);
    if (!userExists) {
      return res.status(401).json({
        error: "User session invalid or database reset. Please register/login again."
      });
    }
    const {
      name,
      size,
      type,
      folderPath,
      clientEncrypted,
      lastModified,
      chunkHashes
    } = req.body;
    if (size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "File exceeds 50MB limit" });
    }
    if (!name || !chunkHashes || !Array.isArray(chunkHashes)) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    const combinedHashes = chunkHashes.join("");
    const mRoot = import_crypto.default.createHash("sha256").update(combinedHashes).digest("hex");
    const userVaultSeedId = getVaultSeedIdForUser(headerUserId);
    const existingFile = db.prepare(
      "SELECT id, name FROM files WHERE userId = ? AND folderPath = ? AND merkleRoot = ? AND deletedAt IS NULL"
    ).get(headerUserId, folderPath || "/", mRoot);
    if (existingFile) {
      const fileId = existingFile.id;
      const finalName2 = existingFile.name;
      const existingChunks = db.prepare(
        "SELECT chunkIndex, chunkHash, isUploaded FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC"
      ).all(fileId);
      if (existingChunks.length === chunkHashes.length) {
        const missingChunks = chunkHashes.filter((hash, idx) => {
          const matchingDbChunk = existingChunks[idx];
          const hasDisk = import_fs.default.existsSync(getSecureChunkPath(hash));
          if (!hasDisk && matchingDbChunk?.isUploaded) {
            db.prepare(
              "UPDATE file_chunks SET isUploaded = 0 WHERE fileId = ? AND chunkIndex = ?"
            ).run(fileId, idx);
          }
          return !hasDisk;
        });
        const finalFilePath = getSecureFilePath(fileId, mRoot);
        const metaPath = finalFilePath + ".meta";
        const existingFileKey = db.prepare("SELECT encryptionKey FROM files WHERE id = ?").get(fileId);
        const metaData = {
          name: finalName2,
          type: type || "application/octet-stream",
          size,
          userId: headerUserId,
          folderPath: folderPath || "/",
          isFolder: false,
          isShared: false,
          clientEncrypted: !!clientEncrypted,
          lastModified: lastModified || Date.now(),
          ownerHint: getCurrentUserUsername(headerUserId),
          vaultSeedId: userVaultSeedId,
          chunkHashes,
          encryptionKey: (existingFileKey ? existingFileKey.encryptionKey : null) || null
        };
        try {
          import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
        } catch (e) {
        }
        return res.json({
          fileId,
          missingChunks,
          chunkHashes,
          merkleRoot: mRoot,
          resumed: true
        });
      } else {
        db.prepare("DELETE FROM file_chunks WHERE fileId = ?").run(fileId);
      }
    }
    const checkDup = db.prepare(
      "SELECT name FROM files WHERE folderPath = ? AND name = ? AND userId = ? AND deletedAt IS NULL"
    ).get(folderPath || "/", name, headerUserId);
    const finalName = checkDup ? `${Date.now()}_${name}` : name;
    const previousBlock = db.prepare(
      "SELECT dagHash FROM files WHERE userId = ? ORDER BY id DESC LIMIT 1"
    ).get(headerUserId);
    const expectedPrevHash = previousBlock ? previousBlock.dagHash : "GENESIS_BLOCK_000000000000000000000000000000";
    const finalLastModified = lastModified || Date.now();
    const payloadToHash = `${expectedPrevHash}::${finalName}::${size}::${type}::${finalLastModified}::${mRoot}`;
    const computedDagHash = import_crypto.default.createHash("sha256").update(payloadToHash).digest("hex");
    const computedDagSignature = import_crypto.default.createHmac("sha256", VAULT_MASTER_KEY).update(computedDagHash).digest("hex");
    let fileKeyStr = null;
    if (!clientEncrypted) {
      fileKeyStr = import_crypto.default.randomBytes(32).toString("base64");
    }
    try {
      const info = db.prepare(
        `
        INSERT INTO files (userId, name, data, type, size, folderPath, isFolder, isShared, senderName, shareNote, lastModified, clientEncrypted, previousDagHash, dagHash, dagSignature, merkleRoot, vaultSeedId, encryptionKey) 
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        headerUserId,
        finalName,
        type || "application/octet-stream",
        size,
        folderPath || "/",
        0,
        // isFolder
        0,
        // isShared
        null,
        // senderName
        null,
        // shareNote
        finalLastModified,
        clientEncrypted ? 1 : 0,
        expectedPrevHash,
        computedDagHash,
        computedDagSignature,
        mRoot,
        userVaultSeedId,
        fileKeyStr
      );
      const fileId = Number(info.lastInsertRowid);
      const insertChunk = db.prepare(
        "INSERT INTO file_chunks (fileId, chunkIndex, chunkHash, isUploaded) VALUES (?, ?, ?, ?)"
      );
      const transaction = db.transaction((hashes) => {
        hashes.forEach((hash, index) => {
          const chunkPath = getSecureChunkPath(hash);
          const alreadyUploaded = import_fs.default.existsSync(chunkPath) ? 1 : 0;
          insertChunk.run(fileId, index, hash, alreadyUploaded);
        });
      });
      transaction(chunkHashes);
      const missingChunks = chunkHashes.filter((hash) => {
        return !import_fs.default.existsSync(getSecureChunkPath(hash));
      });
      const finalFilePath = getSecureFilePath(fileId, mRoot);
      const metaPath = finalFilePath + ".meta";
      const metaData = {
        name: finalName,
        type: type || "application/octet-stream",
        size,
        userId: headerUserId,
        folderPath: folderPath || "/",
        isFolder: false,
        isShared: false,
        clientEncrypted: !!clientEncrypted,
        lastModified: lastModified || Date.now(),
        ownerHint: getCurrentUserUsername(headerUserId),
        vaultSeedId: userVaultSeedId,
        chunkHashes,
        encryptionKey: fileKeyStr || null
      };
      import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
      res.json({
        fileId,
        missingChunks,
        chunkHashes,
        merkleRoot: mRoot
      });
    } catch (err) {
      console.error("Failed to initialize chunked upload:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/files/chunked/upload", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Missing X-User-Id header" });
    }
    const fileId = Number(req.header("X-File-Id"));
    const chunkIndex = Number(req.header("X-Chunk-Index"));
    const chunkHash = req.header("X-Chunk-Hash");
    if (!fileId || isNaN(chunkIndex) || !chunkHash) {
      return res.status(400).json({ error: "Missing required chunk headers" });
    }
    const file = db.prepare(
      "SELECT clientEncrypted, userId, encryptionKey FROM files WHERE id = ?"
    ).get(fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    if (file.userId !== headerUserId) {
      return res.status(403).json({ error: "Unauthorized file chunk upload" });
    }
    const chunkPath = getSecureChunkPath(chunkHash);
    const tempChunkId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const tempChunkPath = `${chunkPath}.${tempChunkId}.tmp`;
    const writeStream = import_fs.default.createWriteStream(tempChunkPath, {
      highWaterMark: 1024 * 1024
    });
    req.on("aborted", () => {
      try {
        if (import_fs.default.existsSync(tempChunkPath)) {
          writeStream.destroy();
          import_fs.default.unlinkSync(tempChunkPath);
        }
      } catch (e) {
      }
    });
    const isClientEncrypted = file.clientEncrypted !== 0;
    if (!isClientEncrypted) {
      const fKey = file.encryptionKey ? Buffer.from(file.encryptionKey, "base64") : getUserEncryptionKey(file.userId);
      const layeredEncrypt = new LayeredEncryptTransform(fKey);
      req.pipe(layeredEncrypt).pipe(writeStream);
    } else {
      req.pipe(writeStream);
    }
    writeStream.on("error", (err) => {
      console.error("Write stream error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Stream write error" });
    });
    writeStream.on("finish", () => {
      try {
        if (!import_fs.default.existsSync(chunkPath)) {
          import_fs.default.renameSync(tempChunkPath, chunkPath);
        } else {
          try {
            import_fs.default.unlinkSync(tempChunkPath);
          } catch (e) {
          }
        }
        db.prepare(
          "UPDATE file_chunks SET isUploaded = 1 WHERE fileId = ? AND chunkIndex = ?"
        ).run(fileId, chunkIndex);
        const incomplete = db.prepare(
          "SELECT COUNT(*) as count FROM file_chunks WHERE fileId = ? AND isUploaded = 0"
        ).get(fileId);
        const isComplete = incomplete.count === 0;
        if (isComplete) {
          const fullBuffer = getFileDataBuffer(fileId);
          if (fullBuffer) {
            const newMerkleRoot = computeMerkleRoot(fullBuffer) || "GENESIS_MERKLE_ROOT_000000000000000000";
            const chunkHashes = db.prepare("SELECT chunkHash FROM file_chunks WHERE fileId = ?").all(fileId);
            for (const ch of chunkHashes) {
              const cp = getSecureChunkPath(ch.chunkHash);
              try {
                if (import_fs.default.existsSync(cp)) import_fs.default.unlinkSync(cp);
              } catch (e) {
              }
            }
            db.prepare("DELETE FROM file_chunks WHERE fileId = ?").run(fileId);
            db.prepare("UPDATE files SET merkleRoot = ? WHERE id = ?").run(
              newMerkleRoot,
              fileId
            );
            const finalFilePath = getSecureFilePath(fileId, newMerkleRoot);
            import_fs.default.writeFileSync(finalFilePath, fullBuffer);
            const fileContext = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
            if (fileContext) {
              const metaPath = finalFilePath + ".meta";
              const userVaultSeedId = getVaultSeedIdForUser(headerUserId);
              const metaData = {
                name: fileContext.name,
                type: fileContext.type,
                size: fileContext.size,
                userId: fileContext.userId,
                receiverId: fileContext.userId,
                folderPath: fileContext.folderPath || "/",
                isFolder: fileContext.isFolder === 1,
                isShared: fileContext.isShared === 1,
                senderName: fileContext.senderName || null,
                clientEncrypted: fileContext.clientEncrypted === 1,
                lastModified: fileContext.lastModified || Date.now(),
                ownerHint: getCurrentUserUsername(headerUserId),
                vaultSeedId: userVaultSeedId,
                merkleRoot: newMerkleRoot
              };
              import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
            }
          }
          rebuildUserDag(headerUserId);
          registerMeshShadowBlock(fileId);
          scheduleMeshReplication(headerUserId, fileId);
        }
        res.json({ success: true, chunkHash, chunkIndex, isComplete });
      } catch (err) {
        console.error("Chunk upload completion error:", err);
        try {
          if (import_fs.default.existsSync(tempChunkPath)) import_fs.default.unlinkSync(tempChunkPath);
        } catch (e) {
        }
        if (!res.headersSent)
          res.status(500).json({ error: "Storage error: " + err.message });
      }
    });
    writeStream.on("error", (err) => {
      console.error("Chunk write stream error:", err);
      try {
        if (import_fs.default.existsSync(tempChunkPath)) import_fs.default.unlinkSync(tempChunkPath);
      } catch (e) {
      }
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to stream chunk to disk" });
    });
    req.on("error", (err) => {
      console.error("Request read error during chunk upload:", err);
      try {
        if (import_fs.default.existsSync(tempChunkPath)) import_fs.default.unlinkSync(tempChunkPath);
      } catch (e) {
      }
      if (!res.headersSent) res.status(500).json({ error: "Chunk read error" });
    });
  });
  app.post("/api/kaspa/anchor", import_express.default.json(), (req, res) => {
    const { fileId, merkleRoot, signature } = req.body;
    if (!fileId || !merkleRoot) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    try {
      db.prepare(
        `
          INSERT INTO kaspa_anchors (fileId, txId, timestamp, merkleRoot, signature, status)
          VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        fileId,
        `mock_tx_${Date.now()}`,
        Date.now(),
        merkleRoot,
        signature || "mock_sig",
        "ANCHORED"
      );
      res.json({ success: true, status: "ANCHORED" });
    } catch (e) {
      res.status(500).json({ error: "Failed to anchor" });
    }
  });
  app.get("/api/files/chunked/status/:id", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({ error: "Missing identity headers" });
    }
    const fileId = req.params.id;
    const file = db.prepare("SELECT userId FROM files WHERE id = ?").get(fileId);
    if (!file) {
      return res.status(404).json({ error: "File session not found" });
    }
    if (file.userId !== headerUserId) {
      return res.status(403).json({ error: "Unauthorized access" });
    }
    const chunks = db.prepare(
      "SELECT chunkIndex, chunkHash, isUploaded FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC"
    ).all(fileId);
    res.json({
      fileId,
      chunks: chunks.map((c) => ({
        index: c.chunkIndex,
        hash: c.chunkHash,
        isUploaded: !!c.isUploaded
      }))
    });
  });
  app.use(import_express.default.json({ limit: "100mb" }));
  app.use(import_express.default.urlencoded({ limit: "100mb", extended: true }));
  const localMdnsNodePool = /* @__PURE__ */ new Map();
  let bootstrapRelayUrl = null;
  let bootstrapRelayPeerId = null;
  let isRelayHandshakeVerified = false;
  let isRelayHubEnabled = true;
  let lastLocalNodeAnnounced = null;
  let localNodeIdentity = null;
  function getOrCreateNodeIdentity() {
    if (localNodeIdentity) return localNodeIdentity;
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS node_identity (
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL
        );
      `);
      const getStmt = db.prepare(
        "SELECT value FROM node_identity WHERE key = ?"
      );
      const privRow = getStmt.get("privateKey");
      const pubRow = getStmt.get("publicKey");
      const peerRow = getStmt.get("peerId");
      if (privRow && pubRow && peerRow) {
        localNodeIdentity = {
          privateKeyPem: privRow.value,
          publicKeyPem: pubRow.value,
          peerId: peerRow.value
        };
        return localNodeIdentity;
      }
      const { publicKey, privateKey } = import_crypto.default.generateKeyPairSync("ed25519");
      const privateKeyPem = privateKey.export({
        type: "pkcs8",
        format: "pem"
      });
      const publicKeyPem = publicKey.export({
        type: "spki",
        format: "pem"
      });
      const publicKeyDer = publicKey.export({
        type: "spki",
        format: "der"
      });
      const sha256 = import_crypto.default.createHash("sha256").update(publicKeyDer).digest();
      const multihash = Buffer.concat([Buffer.from([18, 32]), sha256]);
      const peerId = encodeBase58(multihash);
      const insertStmt = db.prepare(
        "INSERT OR REPLACE INTO node_identity (key, value) VALUES (?, ?)"
      );
      insertStmt.run("privateKey", privateKeyPem);
      insertStmt.run("publicKey", publicKeyPem);
      insertStmt.run("peerId", peerId);
      localNodeIdentity = { privateKeyPem, publicKeyPem, peerId };
      return localNodeIdentity;
    } catch (err) {
      console.error(
        "Failed to generate/load node identity, falling back to ephemeral:",
        err.message
      );
      const { publicKey, privateKey } = import_crypto.default.generateKeyPairSync("ed25519");
      const privateKeyPem = privateKey.export({
        type: "pkcs8",
        format: "pem"
      });
      const publicKeyPem = publicKey.export({
        type: "spki",
        format: "pem"
      });
      const publicKeyDer = publicKey.export({
        type: "spki",
        format: "der"
      });
      const sha256 = import_crypto.default.createHash("sha256").update(publicKeyDer).digest();
      const multihash = Buffer.concat([Buffer.from([18, 32]), sha256]);
      const peerId = encodeBase58(multihash);
      localNodeIdentity = { privateKeyPem, publicKeyPem, peerId };
      return localNodeIdentity;
    }
  }
  const relayedNodes = /* @__PURE__ */ new Map();
  const relayedQueues = /* @__PURE__ */ new Map();
  localMdnsNodePool.set("v-disp-01-secure-node", {
    id: "v-disp-01-secure-node",
    username: "virtual_display_01",
    displayName: "Virtual Display Station 01",
    avatarColor: "#ec4899",
    localIp: "v-disp-01-secure-node",
    serviceName: "Q-MESH / L-BAND",
    port: 3001,
    lastSeen: Date.now(),
    nodeType: "GLOBAL"
  });
  localMdnsNodePool.set("v-vault-02-secondary", {
    id: "v-vault-02-secondary",
    username: "vault_node_02",
    displayName: "Quantum Vault Node B",
    avatarColor: "#8b5cf6",
    localIp: "v-vault-02-secondary",
    serviceName: "TCP/IP SECURE",
    port: 3002,
    lastSeen: Date.now(),
    nodeType: "GLOBAL"
  });
  let meshEvents = [];
  function addMeshEvent(type, message) {
    meshEvents.unshift({
      id: Math.random().toString(36).substring(7),
      type,
      message,
      timestamp: Date.now()
    });
    if (meshEvents.length > 20) meshEvents.pop();
  }
  const directTransfers = /* @__PURE__ */ new Map();
  class HotBlockCache {
    constructor() {
      this.cache = /* @__PURE__ */ new Map();
      this.maxSize = 50;
    }
    // Max 50 blocks in memory to conserve resources
    get(key) {
      const entry = this.cache.get(key);
      if (entry) {
        entry.score++;
        entry.lastUsed = Date.now();
        return entry.buffer;
      }
      return null;
    }
    set(key, buffer) {
      if (this.cache.size >= this.maxSize) {
        let oldestKey = null;
        let lowestScore = Infinity;
        let oldestTime = Infinity;
        for (const [k, v] of this.cache.entries()) {
          if (v.score < lowestScore || v.score === lowestScore && v.lastUsed < oldestTime) {
            lowestScore = v.score;
            oldestTime = v.lastUsed;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
      this.cache.set(key, { buffer, score: 1, lastUsed: Date.now() });
    }
  }
  const hotBlockCache = new HotBlockCache();
  const activeRequestsPerPeer = /* @__PURE__ */ new Map();
  const MAX_CONCURRENT_PEER_REQUESTS = 3;
  const replicationBacklog = /* @__PURE__ */ new Set();
  function handleTaskFailure(task) {
    const nextRetry = task.retryCount + 1;
    if (nextRetry > 10) {
      addMeshEvent(
        "GOSSIP_PUSH",
        `Dropped block replication ${task.fileId} to peer ${task.targetPeer.substring(0, 8)} after 10 failed attempts.`
      );
      return;
    }
    let delay = 500;
    if (nextRetry >= 5) {
      delay = 6e4 + Math.random() * 3e4;
      addMeshEvent(
        "GOSSIP_PUSH",
        `Demoted file replication ${task.fileId} task for peer ${task.targetPeer.substring(0, 8)} to low-priority queue (Attempt ${nextRetry}).`
      );
    } else {
      delay = 1e3 * Math.pow(2, nextRetry) + Math.random() * 2e3;
    }
    replicationBacklog.add({
      ...task,
      retryCount: nextRetry,
      scheduledAt: Date.now() + delay
    });
  }
  function scheduleMeshReplication(userId, fileId) {
    const file = db.prepare("SELECT dagHash FROM files WHERE id = ?").get(fileId);
    const dagHash = file?.dagHash;
    const initialGossipDampeningDelay = 100 + Math.random() * 700;
    let index = 0;
    for (const [peerId, peer] of localMdnsNodePool.entries()) {
      if (dagHash) {
        let bloom = peer.bloomFilter;
        if (!bloom) {
          bloom = new ShortBloomFilter();
          peer.bloomFilter = bloom;
        }
        if (bloom.test(dagHash)) {
          continue;
        }
      }
      replicationBacklog.add({
        userId,
        fileId,
        targetPeer: peerId,
        retryCount: 0,
        scheduledAt: Date.now() + initialGossipDampeningDelay + index * 150 + Math.random() * 150
        // progressive queue stagger to prevent initial micro-burst stampedes
      });
      index++;
    }
    if (localMdnsNodePool.size > 0 && index > 0) {
      addMeshEvent(
        "GOSSIP_PUSH",
        `Scheduling replication for File ID ${fileId} across mesh (${index} target peers after bloom filter deduplication).`
      );
    }
  }
  const meshGossipEngine = setInterval(async () => {
    if (localMdnsNodePool.size === 0 || replicationBacklog.size === 0) return;
    const now = Date.now();
    const executableTasks = [];
    for (const t of replicationBacklog) {
      if (!t.scheduledAt || now >= t.scheduledAt) {
        const activeCount = activeRequestsPerPeer.get(t.targetPeer) || 0;
        if (activeCount < MAX_CONCURRENT_PEER_REQUESTS) {
          executableTasks.push(t);
          if (executableTasks.length >= 5) break;
        }
      }
    }
    if (executableTasks.length === 0) return;
    for (const task of executableTasks) {
      replicationBacklog.delete(task);
      const peer = localMdnsNodePool.get(task.targetPeer);
      if (!peer) continue;
      const peerId = task.targetPeer;
      activeRequestsPerPeer.set(
        peerId,
        (activeRequestsPerPeer.get(peerId) || 0) + 1
      );
      (async () => {
        try {
          const file = db.prepare("SELECT * FROM files WHERE id = ?").get(task.fileId);
          if (!file) return;
          let encryptedData = null;
          if (file.dagHash) {
            encryptedData = hotBlockCache.get(file.dagHash);
          }
          if (!encryptedData) {
            encryptedData = getFileDataBuffer(file.id);
            if (encryptedData && file.dagHash) {
              hotBlockCache.set(file.dagHash, encryptedData);
            }
          }
          if (!encryptedData) {
            if (file.isFolder || file.size === 0) {
              encryptedData = Buffer.alloc(0);
            } else {
              return;
            }
          }
          let peerUrl = `http://localhost:3000/api/mesh/replicate-block`;
          let isRelayed = false;
          if (peer.viaRelay && peer.relayUrl) {
            peerUrl = `${peer.relayUrl}/api/relay/route`;
            isRelayed = true;
          }
          const bodyData = isRelayed ? {
            targetNodeId: peer.id,
            type: "REPLICATE_BLOCK",
            senderId: lastLocalNodeAnnounced ? lastLocalNodeAnnounced.id : "local-seed",
            payload: {
              userId: task.userId,
              metadata: {
                name: file.name,
                type: file.type,
                size: file.size,
                dagHash: file.dagHash,
                previousDagHash: file.previousDagHash,
                dagSignature: file.dagSignature,
                sigAlgorithm: file.sigAlgorithm || "HMAC-SHA256",
                folderPath: file.folderPath,
                lastModified: file.lastModified,
                merkleRoot: file.merkleRoot,
                vaultSeedId: file.vaultSeedId || null
              },
              encryptedBlock: encryptedData.toString("base64"),
              vaultSeedId: file.vaultSeedId || null
            }
          } : {
            userId: task.userId,
            metadata: {
              name: file.name,
              type: file.type,
              size: file.size,
              dagHash: file.dagHash,
              previousDagHash: file.previousDagHash,
              dagSignature: file.dagSignature,
              sigAlgorithm: file.sigAlgorithm || "HMAC-SHA256",
              folderPath: file.folderPath,
              lastModified: file.lastModified,
              merkleRoot: file.merkleRoot,
              vaultSeedId: file.vaultSeedId || null
            },
            encryptedBlock: encryptedData.toString("base64"),
            vaultSeedId: file.vaultSeedId || null,
            gossipHop: 1
          };
          const response = await fetch(peerUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Gossip-Origin": "QuantumServer",
              "X-Sender-Id": lastLocalNodeAnnounced ? lastLocalNodeAnnounced.id : "local-seed"
            },
            body: JSON.stringify(bodyData)
          });
          if (response.ok) {
            if (file.dagHash) {
              let bloom = peer.bloomFilter;
              if (!bloom) {
                bloom = new ShortBloomFilter();
                peer.bloomFilter = bloom;
              }
              bloom.add(file.dagHash);
            }
            addMeshEvent(
              "GOSSIP_PUSH",
              isRelayed ? `Routed replication block ${file.dagHash.substring(0, 8)} for peer ${peer.displayName} via Relay Hub.` : `Replicated block ${file.dagHash.substring(0, 8)} to peer ${peer.displayName}`
            );
          } else {
            handleTaskFailure(task);
          }
        } catch (e) {
          handleTaskFailure(task);
        } finally {
          const count = activeRequestsPerPeer.get(peerId) || 0;
          if (count <= 1) {
            activeRequestsPerPeer.delete(peerId);
          } else {
            activeRequestsPerPeer.set(peerId, count - 1);
          }
        }
      })();
    }
  }, 3e3);
  async function verifyRelayHandshake(targetUrl, expectedPeerId) {
    try {
      const challenge = import_crypto.default.randomBytes(16).toString("hex");
      const res = await fetch(`${targetUrl}/api/relay/handshake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge })
      });
      if (!res.ok) {
        const errorText = await res.text();
        addMeshEvent(
          "GOSSIP_PUSH",
          `Handshake failed with relay ${targetUrl}: HTTP ${res.status} ${res.statusText}. Reason: ${errorText}`
        );
        return false;
      }
      const data = await res.json();
      if (!data.peerId || !data.publicKeyPem || !data.signature) {
        addMeshEvent(
          "GOSSIP_PUSH",
          `Handshake payload invalid from relay ${targetUrl}: Missing fields.`
        );
        return false;
      }
      if (data.peerId !== expectedPeerId) {
        addMeshEvent(
          "GOSSIP_PUSH",
          `Aborted handshake: Peer ID mismatch! Expected ${expectedPeerId}, got ${data.peerId}`
        );
        return false;
      }
      const pubKey = import_crypto.default.createPublicKey(data.publicKeyPem);
      const pubKeyDer = pubKey.export({
        type: "spki",
        format: "der"
      });
      const sha256 = import_crypto.default.createHash("sha256").update(pubKeyDer).digest();
      const multihash = Buffer.concat([Buffer.from([18, 32]), sha256]);
      const computedPeerId = encodeBase58(multihash);
      if (computedPeerId !== expectedPeerId) {
        addMeshEvent(
          "GOSSIP_PUSH",
          `Aborted handshake: Public key does not hash to expected Peer ID!`
        );
        return false;
      }
      const verified = import_crypto.default.verify(
        "sha256",
        Buffer.from(challenge),
        import_crypto.default.createPublicKey(data.publicKeyPem),
        Buffer.from(data.signature, "base64")
      );
      if (!verified) {
        addMeshEvent(
          "GOSSIP_PUSH",
          `Aborted handshake: Cryptographic signature verification failed!`
        );
        return false;
      }
      addMeshEvent(
        "PEER_UP",
        `Sovereign handshake successful with Relay Hub ${expectedPeerId.substring(0, 8)}! Secure tunnel authenticated.`
      );
      return true;
    } catch (err) {
      addMeshEvent(
        "GOSSIP_PUSH",
        `Handshake verification network error mapping to ${expectedPeerId.substring(0, 8)}: ${err.message}`
      );
      return false;
    }
  }
  const relaySyncEngine = setInterval(async () => {
    if (!bootstrapRelayUrl || !lastLocalNodeAnnounced || !isValidHttpUrl(bootstrapRelayUrl))
      return;
    try {
      if (bootstrapRelayPeerId && !isRelayHandshakeVerified) {
        const verified = await verifyRelayHandshake(
          bootstrapRelayUrl,
          bootstrapRelayPeerId
        );
        if (!verified) {
          return;
        }
        isRelayHandshakeVerified = true;
      }
      const regRes = await fetch(`${bootstrapRelayUrl}/api/relay/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastLocalNodeAnnounced)
      });
      if (regRes.ok) {
        lastLocalNodeAnnounced.lastSeen = Date.now();
      }
      const nodesRes = await fetch(`${bootstrapRelayUrl}/api/relay/nodes`);
      if (nodesRes.ok) {
        const remoteNodes = await nodesRes.json();
        if (Array.isArray(remoteNodes)) {
          for (const rn of remoteNodes) {
            if (rn.id !== lastLocalNodeAnnounced.id && rn.username !== lastLocalNodeAnnounced.username) {
              localMdnsNodePool.set(rn.id, {
                ...rn,
                nodeType: "GLOBAL",
                viaRelay: true,
                relayUrl: bootstrapRelayUrl,
                lastSeen: Date.now()
                // keep fresh
              });
            }
          }
        }
      }
      const pollRes = await fetch(
        `${bootstrapRelayUrl}/api/relay/poll/${lastLocalNodeAnnounced.id}`
      );
      if (pollRes.ok) {
        const tasks = await pollRes.json();
        if (Array.isArray(tasks) && tasks.length > 0) {
          for (const task of tasks) {
            if (task.type === "REPLICATE_BLOCK") {
              const { userId, metadata, encryptedBlock } = task.payload;
              try {
                const mRoot = metadata.merkleRoot || "GENESIS_MERKLE_ROOT_000000000000000000";
                const payloadToHash = `${metadata.previousDagHash}::${metadata.name}::${metadata.size}::${metadata.type}::${metadata.lastModified}::${mRoot}`;
                const computedHash = import_crypto.default.createHash("sha256").update(payloadToHash).digest("hex");
                if (computedHash === metadata.dagHash) {
                  const senderId = task.senderId;
                  if (senderId && senderId !== "unknown") {
                    const peer = localMdnsNodePool.get(senderId);
                    if (peer) {
                      let bloom = peer.bloomFilter;
                      if (!bloom) {
                        bloom = new ShortBloomFilter();
                        peer.bloomFilter = bloom;
                      }
                      bloom.add(metadata.dagHash);
                    }
                  }
                  let resolvedUserId = Number(userId);
                  const inboundVaultSeedId = metadata.vaultSeedId || null;
                  if (inboundVaultSeedId) {
                    const localUser = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(inboundVaultSeedId);
                    if (localUser) {
                      resolvedUserId = localUser.id;
                    }
                  }
                  const insertStmt = db.prepare(`
                    INSERT OR REPLACE INTO mesh_shadow_blocks (ownerId, dagHash, metadata, encryptedContent, syncedAt, vaultSeedId)
                    VALUES (?, ?, ?, ?, ?, ?)
                  `);
                  insertStmt.run(
                    resolvedUserId,
                    metadata.dagHash,
                    JSON.stringify({
                      ...metadata,
                      vaultSeedId: inboundVaultSeedId
                    }),
                    Buffer.from(encryptedBlock, "base64"),
                    Date.now(),
                    inboundVaultSeedId
                  );
                  addMeshEvent(
                    "BLOCK_REPLICATED",
                    `[Relayed Tunnel] Inbound block ${metadata.dagHash.substring(0, 8)} successfully committed.`
                  );
                }
              } catch (ingestErr) {
                console.warn(
                  "[Relay Ingest] Failed block write:",
                  ingestErr.message
                );
              }
            } else if (task.type === "REQUEST_BLOCK") {
              const { requesterNodeId, dagHash } = task.payload;
              try {
                const block = db.prepare("SELECT * FROM mesh_shadow_blocks WHERE dagHash = ?").get(dagHash);
                if (block) {
                  const metadata = JSON.parse(block.metadata);
                  const replyPayload = {
                    targetNodeId: requesterNodeId,
                    type: "REPLICATE_BLOCK",
                    senderId: lastLocalNodeAnnounced ? lastLocalNodeAnnounced.id : "local-seed",
                    payload: {
                      userId: block.ownerId,
                      metadata,
                      encryptedBlock: block.encryptedContent.toString("base64")
                    }
                  };
                  await fetch(`${bootstrapRelayUrl}/api/relay/route`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(replyPayload)
                  });
                  addMeshEvent(
                    "GOSSIP_PUSH",
                    `[Relay Outbox] Routed requested block ${dagHash.substring(0, 8)} back to peer ${requesterNodeId.substring(0, 8)}`
                  );
                }
              } catch (reqErr) {
                console.warn(
                  "[Relay Request Block] Failed to fulfill requested block:",
                  reqErr.message
                );
              }
            } else if (task.type === "DIRECT_TRANSFER") {
              const {
                senderUsername,
                targetUsername,
                fileName,
                fileType,
                fileSize,
                encryptedDataBase64
              } = task.payload;
              const packet = {
                id: Math.random().toString(36).substring(2, 9),
                senderUsername,
                targetUsername,
                fileName,
                fileType,
                fileSize,
                encryptedDataBase64,
                timestamp: Date.now()
              };
              if (!directTransfers.has(targetUsername)) {
                directTransfers.set(targetUsername, []);
              }
              directTransfers.get(targetUsername).push(packet);
              addMeshEvent(
                "PEER_UP",
                `[Relayed Tunnel] Inbound Direct Transfer from @${senderUsername}`
              );
              for (const [clientWs, client] of clients.entries()) {
                if (client.username === targetUsername) {
                  try {
                    clientWs.send(
                      JSON.stringify({
                        type: "mdns_direct_transfer",
                        senderUsername,
                        packet
                      })
                    );
                  } catch (wsErr) {
                  }
                }
              }
            }
          }
        }
      }
      const blocksRes = await fetch(`${bootstrapRelayUrl}/api/relay/blocks`);
      if (blocksRes.ok) {
        const remoteBlocks = await blocksRes.json();
        if (Array.isArray(remoteBlocks) && lastLocalNodeAnnounced.username) {
          const userRow = db.prepare("SELECT id FROM users WHERE username = ?").get(lastLocalNodeAnnounced.username);
          const activeUserId = userRow ? userRow.id : null;
          if (activeUserId !== null) {
            for (const rb of remoteBlocks) {
              if (rb.ownerId === activeUserId) {
                const tombstone = db.prepare("SELECT 1 FROM mesh_tombstones WHERE dagHash = ?").get(rb.dagHash);
                if (tombstone) continue;
                const localBlockExists = db.prepare("SELECT 1 FROM mesh_shadow_blocks WHERE dagHash = ?").get(rb.dagHash);
                if (!localBlockExists) {
                  const blockContentUrl = `${bootstrapRelayUrl}/api/mesh/block/${rb.dagHash}`;
                  const fetchContentRes = await fetch(blockContentUrl);
                  if (fetchContentRes.ok) {
                    const contentBuffer = await fetchContentRes.arrayBuffer();
                    let resolvedUserId = Number(rb.ownerId);
                    const inboundVaultSeedId = rb.metadata?.vaultSeedId || null;
                    if (inboundVaultSeedId) {
                      const localUser = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(inboundVaultSeedId);
                      if (localUser) {
                        resolvedUserId = localUser.id;
                      }
                    }
                    const insertStmt = db.prepare(`
                      INSERT OR REPLACE INTO mesh_shadow_blocks (ownerId, dagHash, metadata, encryptedContent, syncedAt, vaultSeedId)
                      VALUES (?, ?, ?, ?, ?, ?)
                    `);
                    insertStmt.run(
                      resolvedUserId,
                      rb.dagHash,
                      JSON.stringify({
                        ...rb.metadata,
                        vaultSeedId: inboundVaultSeedId
                      }),
                      Buffer.from(contentBuffer),
                      Date.now(),
                      inboundVaultSeedId
                    );
                    addMeshEvent(
                      "BLOCK_REPLICATED",
                      `[Relay Cache Sync] Pulled missing block ${rb.dagHash.substring(0, 8)} from Relay Hub cache.`
                    );
                    for (const [clientWs] of clients.entries()) {
                      try {
                        clientWs.send(
                          JSON.stringify({
                            type: "mdns_resolved",
                            nodes: Array.from(localMdnsNodePool.values())
                          })
                        );
                      } catch (wsErr) {
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (syncErr) {
      console.warn(
        "[Relay Sync] Bootstrap relay sync heartbeat failed:",
        syncErr.message
      );
    }
  }, 8e3);
  app.post("/api/mesh/replicate-block", (req, res) => {
    const { userId, metadata, encryptedBlock, gossipHop } = req.body;
    try {
      const userKey = getUserEncryptionKey(userId);
      if (metadata && isCorruptOrVirusVideo(
        metadata.name,
        metadata.type,
        metadata.size,
        encryptedBlock ? Buffer.from(encryptedBlock, "base64") : void 0,
        userKey
      )) {
        return res.status(400).json({
          error: "Replication rejected: Block is suspected to be a corrupt video or malware/virus."
        });
      }
      const mRoot = metadata.merkleRoot || "GENESIS_MERKLE_ROOT_000000000000000000";
      const payloadToHash = `${metadata.previousDagHash}::${metadata.name}::${metadata.size}::${metadata.type}::${metadata.lastModified}::${mRoot}`;
      const computedHash = import_crypto.default.createHash("sha256").update(payloadToHash).digest("hex");
      if (computedHash !== metadata.dagHash) {
        return res.status(400).json({ error: "Cryptographic hash mismatch. Block rejected." });
      }
      if (metadata && metadata.dagHash) {
        const tombstone = db.prepare("SELECT 1 FROM mesh_tombstones WHERE dagHash = ?").get(metadata.dagHash);
        if (tombstone) {
          console.log(
            `[Mesh] Replicate block rejected: ${metadata.dagHash} is permanently deleted (tombstoned).`
          );
          return res.json({ success: true, status: "Tombstone block ignored" });
        }
      }
      const senderId = req.header("X-Sender-Id");
      if (senderId && senderId !== "local-seed") {
        const peer = localMdnsNodePool.get(senderId);
        if (peer) {
          let bloom = peer.bloomFilter;
          if (!bloom) {
            bloom = new ShortBloomFilter();
            peer.bloomFilter = bloom;
          }
          if (metadata && metadata.dagHash) {
            bloom.add(metadata.dagHash);
          }
        }
      }
      let resolvedUserId = Number(userId);
      const inboundVaultSeedId = metadata.vaultSeedId || null;
      if (inboundVaultSeedId) {
        const localUser = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(inboundVaultSeedId);
        if (localUser) {
          resolvedUserId = localUser.id;
        }
      }
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO mesh_shadow_blocks (ownerId, dagHash, metadata, encryptedContent, syncedAt, vaultSeedId)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        resolvedUserId,
        metadata.dagHash,
        JSON.stringify({ ...metadata, vaultSeedId: inboundVaultSeedId }),
        Buffer.from(encryptedBlock, "base64"),
        Date.now(),
        inboundVaultSeedId
      );
      addMeshEvent(
        "BLOCK_REPLICATED",
        `Inbound block ${metadata.dagHash.substring(0, 8)} successfully committed to shadow storage.`
      );
      res.json({
        success: true,
        status: "Block replicated in distributed shadow storage"
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/mesh/restore/:userId", (req, res) => {
    const userId = Number(req.params.userId);
    const headerUserId = Number(req.header("X-User-Id"));
    if (userId !== headerUserId) {
      return res.status(403).json({ error: "Access denied" });
    }
    try {
      const user = db.prepare("SELECT vaultSeedId FROM users WHERE id = ?").get(userId);
      const seedId = user?.vaultSeedId || null;
      const shadowBlocks = db.prepare("SELECT * FROM mesh_shadow_blocks WHERE ownerId = ? OR vaultSeedId = ? OR originalOwnerSeedId = ?").all(userId, seedId, seedId);
      const validBlocks = [];
      for (const b of shadowBlocks) {
        try {
          validBlocks.push({
            dagHash: b.dagHash,
            metadata: JSON.parse(b.metadata),
            syncedAt: b.syncedAt
          });
        } catch (parseErr) {
          console.warn(
            `Skipping corrupted shadow block metadata for hash ${b.dagHash}`
          );
        }
      }
      res.json(validBlocks);
    } catch (e) {
      res.json([]);
    }
  });
  app.get("/api/mesh/block/:dagHash", (req, res) => {
    const dagHash = req.params.dagHash;
    try {
      const cachedBuffer = hotBlockCache.get(dagHash);
      if (cachedBuffer) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.send(cachedBuffer);
        return;
      }
      const block = db.prepare("SELECT * FROM mesh_shadow_blocks WHERE dagHash = ?").get(dagHash);
      if (!block)
        return res.status(404).json({ error: "Block not found in Mesh" });
      const metadata = JSON.parse(block.metadata);
      res.setHeader("Content-Type", metadata.type);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${metadata.name}"`
      );
      if (block.encryptedContent) {
        hotBlockCache.set(dagHash, block.encryptedContent);
      }
      res.send(block.encryptedContent);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/health", (req, res) => {
    const shadowCount = db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='mesh_shadow_blocks'"
    ).get();
    const meshStats = shadowCount.count > 0 ? db.prepare("SELECT COUNT(*) as count FROM mesh_shadow_blocks").get() : { count: 0 };
    res.json({
      status: "ok",
      db: "Secure Vault (AES-256-GCM)",
      mesh: {
        activePeers: localMdnsNodePool.size,
        shadowBlocksHeld: meshStats.count,
        backlogSize: replicationBacklog.size,
        dynamicScaling: "ENABLED"
      }
    });
  });
  app.post("/api/storage/repair", (req, res) => {
    try {
      recoverFiles();
      res.json({ success: true, message: "Storage repair completed." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/storage/master-key", (req, res) => {
    if (!req.headers.userid)
      return res.status(401).json({ error: "Unauthorized" });
    const userId = parseInt(req.headers.userid, 10);
    const seedId = getVaultSeedIdForUser(userId);
    res.json({
      masterKey: seedId,
      identityId: userId,
      masterAuthority: Buffer.from(`${userId}:${seedId}`).toString("base64")
    });
  });
  app.get("/api/admin/download-db", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({
        error: "Access denied: Missing authentication identification."
      });
    }
    try {
      const tempPath = import_path.default.join(import_os.default.tmpdir(), "vault_backup.db");
      const dbInstance = db;
      if (typeof dbInstance.backup === "function") {
        dbInstance.backup(tempPath).then(() => {
          res.download(tempPath, "quantum_secure_vault.db", (err) => {
            try {
              import_fs.default.unlinkSync(tempPath);
            } catch (e) {
            }
          });
        }).catch((backupErr) => {
          console.error(
            "SQLite backup API failed, falling back to fs copy:",
            backupErr
          );
          import_fs.default.copyFileSync("vault.db", tempPath);
          res.download(tempPath, "quantum_secure_vault.db", (err) => {
            try {
              import_fs.default.unlinkSync(tempPath);
            } catch (e) {
            }
          });
        });
      } else {
        import_fs.default.copyFileSync("vault.db", tempPath);
        res.download(tempPath, "quantum_secure_vault.db", (err) => {
          try {
            import_fs.default.unlinkSync(tempPath);
          } catch (e) {
          }
        });
      }
    } catch (err) {
      console.error("Backup file database compile failed:", err);
      res.status(500).json({
        error: "Could not compile raw virtual DB stream: " + err.message
      });
    }
  });
  app.post("/api/admin/restore-db", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({
        error: "Access denied: Active session identification required."
      });
    }
    const chunks = [];
    let totalLength = 0;
    const MAX_DB_SIZE = 100 * 1024 * 1024;
    req.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > MAX_DB_SIZE) {
        req.destroy(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const incomingDbBuffer = Buffer.concat(chunks);
        if (incomingDbBuffer.length < 512) {
          return res.status(400).json({
            error: "Uploaded stream size invalid or too small to be a database."
          });
        }
        const signature = incomingDbBuffer.subarray(0, 15).toString("ascii");
        if (signature !== "SQLite format 3") {
          return res.status(400).json({
            error: "The provided file is not a valid SQLite database backup binary."
          });
        }
        console.log(
          "Ingesting raw SQLite stream. Replacing vault.db securely."
        );
        db.close();
        import_fs.default.writeFileSync(dbPath, incomingDbBuffer);
        db = new WrappedDatabase(dbPath);
        runMigrations();
        res.json({
          success: true,
          message: "Decentralized storage layer fully mapped and restored."
        });
      } catch (err) {
        console.error("Failure restoring database via file stream input:", err);
        try {
          db = new WrappedDatabase(dbPath);
        } catch (reconnectErr) {
        }
        res.status(500).json({ error: "Recovery process failure: " + err.message });
      }
    });
    req.on("error", (err) => {
      console.error("Stream reader error during raw db restore:", err);
      res.status(500).json({
        error: "Failed to parse incoming file stream: " + err.message
      });
    });
  });
  app.get("/api/mdns/interfaces", (req, res) => {
    const interfaces = import_os.default.networkInterfaces();
    const results = [];
    for (const name of Object.keys(interfaces)) {
      const info = interfaces[name];
      if (info) {
        for (const entry of info) {
          if (entry.family === "IPv4" && !entry.internal) {
            results.push(entry.address);
          }
        }
      }
    }
    if (results.length === 0) {
      results.push("192.168.1.45");
    }
    res.json({ ips: results });
  });
  app.get("/api/relay/config", (req, res) => {
    res.json({
      bootstrapRelayUrl,
      bootstrapRelayPeerId,
      isRelayHandshakeVerified,
      isRelayHubEnabled,
      hasAnnouncedSelf: !!lastLocalNodeAnnounced,
      lastLocalNodeAnnounced,
      localPeerId: getOrCreateNodeIdentity().peerId
    });
  });
  app.post("/api/relay/handshake", (req, res) => {
    if (!isRelayHubEnabled) {
      return res.status(403).json({ error: "Sovereign Relay Hub is disabled." });
    }
    const { challenge } = req.body;
    if (!challenge) {
      return res.status(400).json({ error: "Challenge parameter is required." });
    }
    try {
      const identity = getOrCreateNodeIdentity();
      const privateKey = import_crypto.default.createPrivateKey(identity.privateKeyPem);
      const signature = import_crypto.default.sign(
        "sha256",
        Buffer.from(challenge),
        privateKey
      );
      res.json({
        peerId: identity.peerId,
        publicKeyPem: identity.publicKeyPem,
        signature: signature.toString("base64")
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/relay/blocks", (req, res) => {
    try {
      const blocks = db.prepare(
        "SELECT dagHash, metadata, ownerId, syncedAt FROM mesh_shadow_blocks"
      ).all();
      const validBlocks = [];
      for (const b of blocks) {
        try {
          validBlocks.push({
            dagHash: b.dagHash,
            metadata: JSON.parse(b.metadata),
            ownerId: b.ownerId,
            syncedAt: b.syncedAt
          });
        } catch (e) {
        }
      }
      res.json(validBlocks);
    } catch (e) {
      res.json([]);
    }
  });
  app.post("/api/relay/config", (req, res) => {
    const { url, enableRelayHub } = req.body;
    if (typeof url !== "undefined") {
      let targetUrl = url ? String(url).trim() : null;
      let targetPeerId = null;
      if (targetUrl) {
        const parsed = parseBootstrapMultiaddr(targetUrl);
        if (parsed) {
          targetUrl = parsed.url;
          targetPeerId = parsed.peerId;
        }
      }
      if (targetUrl && !isValidHttpUrl(targetUrl)) {
        console.warn("[Relay Config] Rejecting invalid target URL:", targetUrl);
        targetUrl = null;
        targetPeerId = null;
      }
      if (targetUrl !== bootstrapRelayUrl || targetPeerId !== bootstrapRelayPeerId) {
        isRelayHandshakeVerified = false;
      }
      bootstrapRelayUrl = targetUrl;
      bootstrapRelayPeerId = targetPeerId;
      if (!bootstrapRelayUrl) {
        for (const [key, val] of localMdnsNodePool.entries()) {
          if (val.viaRelay) {
            localMdnsNodePool.delete(key);
          }
        }
      }
    }
    if (typeof enableRelayHub !== "undefined") {
      isRelayHubEnabled = !!enableRelayHub;
    }
    addMeshEvent(
      "PEER_UP",
      `Network relay updated: Relay URL=${bootstrapRelayUrl || "None"} PeerID=${bootstrapRelayPeerId || "None"} HubEnabled=${isRelayHubEnabled}`
    );
    res.json({
      success: true,
      bootstrapRelayUrl,
      bootstrapRelayPeerId,
      isRelayHubEnabled
    });
  });
  app.post("/api/relay/register", (req, res) => {
    if (!isRelayHubEnabled) {
      return res.status(403).json({ error: "Sovereign Relay Hub is disabled on this node." });
    }
    const {
      id,
      username,
      displayName,
      avatarColor,
      localIp,
      serviceName,
      port
    } = req.body;
    if (!id && !username) {
      return res.status(400).json({ error: "Node credentials incomplete." });
    }
    const key = id || username;
    relayedNodes.set(key, {
      id: key,
      username,
      displayName: displayName || username,
      avatarColor,
      localIp: localIp || "relayed-nat",
      serviceName: serviceName || "_secure-vault._tcp.local",
      port: port || 3e3,
      lastSeen: Date.now(),
      nodeType: "GLOBAL"
    });
    res.json({ success: true });
  });
  app.get("/api/relay/nodes", (req, res) => {
    const now = Date.now();
    for (const [key, value] of relayedNodes.entries()) {
      if (now - value.lastSeen > 35e3) {
        relayedNodes.delete(key);
      }
    }
    res.json(Array.from(relayedNodes.values()));
  });
  app.post("/api/relay/route", (req, res) => {
    if (!isRelayHubEnabled) {
      return res.status(403).json({ error: "Bootstrap Relay Hub is disabled." });
    }
    const { targetNodeId, type, payload, senderId } = req.body;
    if (!targetNodeId || !type || !payload) {
      return res.status(400).json({ error: "Target node ID, payload type, or payload missing." });
    }
    if (!relayedQueues.has(targetNodeId)) {
      relayedQueues.set(targetNodeId, []);
    }
    if (type === "REPLICATE_BLOCK" && payload?.metadata?.dagHash) {
      const tombstone = db.prepare("SELECT 1 FROM mesh_tombstones WHERE dagHash = ?").get(payload.metadata.dagHash);
      if (tombstone) {
        console.log(
          `[Relay] Packet type REPLICATE_BLOCK ignored: ${payload.metadata.dagHash} is permanently deleted.`
        );
        return res.json({ success: true, status: "Tombstone block ignored" });
      }
    }
    relayedQueues.get(targetNodeId).push({
      id: Math.random().toString(36).substring(2, 9),
      type,
      payload,
      senderId: senderId || "unknown",
      timestamp: Date.now()
    });
    if (type === "REPLICATE_BLOCK") {
      try {
        const { userId, metadata, encryptedBlock } = payload;
        if (metadata && metadata.dagHash && encryptedBlock) {
          let resolvedUserId = Number(userId);
          const inboundVaultSeedId = metadata.vaultSeedId || null;
          if (inboundVaultSeedId) {
            const localUser = db.prepare("SELECT id FROM users WHERE vaultSeedId = ?").get(inboundVaultSeedId);
            if (localUser) {
              resolvedUserId = localUser.id;
            }
          }
          const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO mesh_shadow_blocks (ownerId, dagHash, metadata, encryptedContent, syncedAt, vaultSeedId)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          insertStmt.run(
            resolvedUserId,
            metadata.dagHash,
            JSON.stringify({ ...metadata, vaultSeedId: inboundVaultSeedId }),
            Buffer.from(encryptedBlock, "base64"),
            Date.now(),
            inboundVaultSeedId
          );
        }
      } catch (cacheErr) {
        console.warn("[Relay Cache Error]", cacheErr.message);
      }
    }
    addMeshEvent(
      "GOSSIP_PUSH",
      `Routed packet type [${type}] to NAT peer [${targetNodeId.substring(0, 8)}]`
    );
    res.json({
      success: true,
      status: "Packet queued at Bootstrap Relay Server"
    });
  });
  app.get("/api/relay/poll/:targetNodeId", (req, res) => {
    const list = relayedQueues.get(req.params.targetNodeId) || [];
    relayedQueues.set(req.params.targetNodeId, []);
    res.json(list);
  });
  app.post("/api/mdns/announce", (req, res) => {
    const {
      id,
      username,
      displayName,
      avatarColor,
      localIp,
      serviceName,
      port
    } = req.body;
    const nodeKey = id || username;
    const isNew = !localMdnsNodePool.has(nodeKey);
    if (isNew) {
      addMeshEvent(
        "PEER_UP",
        `New node discovered: ${displayName || username}`
      );
    }
    const currentAnnouncement = {
      id: nodeKey,
      username,
      displayName: displayName || username,
      avatarColor,
      localIp,
      serviceName: serviceName || "_secure-vault._tcp.local",
      port: port || 3e3,
      lastSeen: Date.now(),
      nodeType: "GLOBAL"
    };
    localMdnsNodePool.set(nodeKey, currentAnnouncement);
    if (username && !id) {
      lastLocalNodeAnnounced = currentAnnouncement;
    }
    if (isNew && localMdnsNodePool.size > 1) {
      const allFiles = db.prepare("SELECT id, userId FROM files WHERE isFolder = 0").all();
      let index = 0;
      for (const f of allFiles) {
        const baseStagger = index * 100;
        const initialJitter = Math.random() * 400;
        replicationBacklog.add({
          userId: f.userId,
          fileId: f.id,
          targetPeer: nodeKey,
          retryCount: 0,
          scheduledAt: Date.now() + baseStagger + initialJitter
        });
        index++;
      }
    }
    res.json({ success: true });
  });
  app.post("/api/mdns/deannounce", (req, res) => {
    const { id } = req.body;
    if (id) {
      const node = localMdnsNodePool.get(id);
      if (node) {
        addMeshEvent("PEER_UP", `Node offline: ${node.displayName}`);
        localMdnsNodePool.delete(id);
      }
    }
    res.json({ success: true });
  });
  app.get("/api/mdns/resolve", (req, res) => {
    const now = Date.now();
    for (const [key, node] of localMdnsNodePool.entries()) {
      if (node.viaRelay) {
        node.lastSeen = now;
      }
      if (now - node.lastSeen > 45e3) {
        addMeshEvent("PEER_UP", `Node offline: ${node.displayName}`);
        localMdnsNodePool.delete(key);
      }
    }
    res.json({
      nodes: Array.from(localMdnsNodePool.values()),
      events: meshEvents
    });
  });
  app.post("/api/mdns/direct-transfer", async (req, res) => {
    const {
      senderUsername,
      targetUsername,
      fileName,
      fileType,
      fileSize,
      encryptedDataBase64
    } = req.body;
    if (!senderUsername || !targetUsername || !fileName || !encryptedDataBase64) {
      return res.status(400).json({ error: "Direct transfer parameters are incomplete" });
    }
    let targetPeer = null;
    for (const p of localMdnsNodePool.values()) {
      if (p.username === targetUsername) {
        targetPeer = p;
        break;
      }
    }
    if (targetPeer && targetPeer.viaRelay && targetPeer.relayUrl) {
      try {
        const routeRes = await fetch(`${targetPeer.relayUrl}/api/relay/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetNodeId: targetPeer.id,
            type: "DIRECT_TRANSFER",
            senderId: lastLocalNodeAnnounced ? lastLocalNodeAnnounced.id : senderUsername,
            payload: {
              senderUsername,
              targetUsername,
              fileName,
              fileType,
              fileSize,
              encryptedDataBase64
            }
          })
        });
        if (routeRes.ok) {
          addMeshEvent(
            "GOSSIP_PUSH",
            `Routed direct transfer package for @${targetUsername} via Bootstrap Relay.`
          );
          return res.json({ success: true, routed: true });
        } else {
          return res.status(500).json({
            error: "Bootstrap Relay did not accept the routed direct transfer payload."
          });
        }
      } catch (err) {
        return res.status(500).json({
          error: `Relayed transit hub injection failed: ${err.message}`
        });
      }
    }
    const packet = {
      id: Math.random().toString(36).substring(2, 9),
      senderUsername,
      targetUsername,
      fileName,
      fileType,
      fileSize,
      encryptedDataBase64,
      timestamp: Date.now()
    };
    if (!directTransfers.has(targetUsername)) {
      directTransfers.set(targetUsername, []);
    }
    directTransfers.get(targetUsername).push(packet);
    let notified = false;
    for (const [clientWs, client] of clients.entries()) {
      if (client.username === targetUsername) {
        try {
          clientWs.send(
            JSON.stringify({
              type: "mdns_direct_transfer",
              senderUsername,
              packet
            })
          );
          notified = true;
        } catch (e) {
        }
      }
    }
    res.json({ success: true, notified, id: packet.id });
  });
  app.get("/api/mdns/transfers/:username", (req, res) => {
    try {
      const targetUser = decodeURIComponent(req.params.username);
      const list = directTransfers.get(targetUser) || [];
      directTransfers.set(targetUser, []);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch transfers" });
    }
  });
  app.get("/api/vault/verify-dag/:userId", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const paramUserId = Number(req.params.userId);
    if (!headerUserId || headerUserId !== paramUserId) {
      return res.status(403).json({ error: "Access denied: Unauthorized DAG verification." });
    }
    try {
      const files = db.prepare("SELECT * FROM files WHERE userId = ? ORDER BY id ASC").all(paramUserId);
      let isValidChain = true;
      let errors = [];
      let currentPreviousHash = "GENESIS_BLOCK_000000000000000000000000000000";
      for (const currentItem of files) {
        if (currentItem.previousDagHash !== currentPreviousHash) {
          isValidChain = false;
          errors.push({
            fileId: currentItem.id,
            fileName: currentItem.name,
            error: "Previous block linkage broken.",
            expected: currentPreviousHash,
            actual: currentItem.previousDagHash
          });
          break;
        }
        const mRoot = currentItem.merkleRoot || (currentItem.isFolder ? "FOLDER_ROOT_000000000000000000000000000000" : "GENESIS_MERKLE_ROOT_000000000000000000");
        const payloadToHash = `${currentPreviousHash}::${currentItem.name}::${currentItem.size}::${currentItem.type}::${currentItem.lastModified}::${mRoot}`;
        const computedDagHash = import_crypto.default.createHash("sha256").update(payloadToHash).digest("hex");
        const computedDagSignature = import_crypto.default.createHmac("sha256", VAULT_MASTER_KEY).update(computedDagHash).digest("hex");
        if (currentItem.dagHash !== computedDagHash || currentItem.dagSignature !== computedDagSignature) {
          isValidChain = false;
          errors.push({
            fileId: currentItem.id,
            fileName: currentItem.name,
            error: "Block DAG hash or signature payload tampered.",
            debugInfo: {
              computedHash: computedDagHash,
              storedHash: currentItem.dagHash,
              mRootUsed: mRoot,
              payloadUsed: payloadToHash
            }
          });
          break;
        }
        currentPreviousHash = computedDagHash;
      }
      res.json({ success: true, isValidChain, count: files.length, errors });
    } catch (e) {
      console.error("Verification error:", e);
      res.status(500).json({ error: e.message || "Failed to verify DAG." });
    }
  });
  app.get("/api/vault/verify-block/:id", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const fileId = req.params.id;
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Missing user identity" });
    }
    try {
      const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
      if (!file) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (Number(file.userId) !== headerUserId && !file.isShared) {
        return res.status(403).json({ error: "Access denied" });
      }
      const previousBlock = db.prepare(
        "SELECT dagHash FROM files WHERE userId = ? AND id < ? ORDER BY id DESC LIMIT 1"
      ).get(file.userId, file.id);
      const expectedPrevHash = previousBlock ? previousBlock.dagHash : "GENESIS_BLOCK_000000000000000000000000000000";
      const filePath = getSecureFilePath(file.id);
      let diskMerkleRoot = "GENESIS_MERKLE_ROOT_000000000000000000";
      if (file.isFolder) {
        diskMerkleRoot = "FOLDER_ROOT_000000000000000000000000000000";
      } else {
        const chunks = db.prepare(
          "SELECT chunkHash FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC"
        ).all(file.id);
        if (chunks.length > 0) {
          const combinedHashes = chunks.map((c) => c.chunkHash).join("");
          diskMerkleRoot = import_crypto.default.createHash("sha256").update(combinedHashes).digest("hex");
        } else if (import_fs.default.existsSync(filePath)) {
          try {
            diskMerkleRoot = computeMerkleRoot(import_fs.default.readFileSync(filePath)) || "GENESIS_MERKLE_ROOT_000000000000000000";
          } catch (e) {
          }
        }
      }
      const mRoot = file.merkleRoot || "GENESIS_MERKLE_ROOT_000000000000000000";
      const payloadToHash = `${expectedPrevHash}::${file.name}::${file.size}::${file.type}::${file.lastModified}::${mRoot}`;
      const algorithm = "sha256";
      const computedDagHash = import_crypto.default.createHash(algorithm).update(payloadToHash).digest("hex");
      const computedDagSignature = import_crypto.default.createHmac(algorithm, VAULT_MASTER_KEY).update(computedDagHash).digest("hex");
      const isValid = file.dagHash === computedDagHash && file.dagSignature === computedDagSignature && file.previousDagHash === expectedPrevHash && file.merkleRoot === diskMerkleRoot;
      res.json({
        success: true,
        isValid,
        audit: {
          storedHash: file.dagHash,
          computedHash: computedDagHash,
          storedSignature: file.dagSignature,
          computedSignature: computedDagSignature,
          sigAlgorithm: file.sigAlgorithm || "HMAC-SHA256",
          storedPrevHash: file.previousDagHash,
          expectedPrevHash,
          storedMerkleRoot: file.merkleRoot,
          diskMerkleRoot,
          merkleRootMatch: file.merkleRoot === diskMerkleRoot,
          integrityMatch: file.dagHash === computedDagHash,
          linkageMatch: file.previousDagHash === expectedPrevHash,
          signatureMatch: file.dagSignature === computedDagSignature,
          timestamp: Date.now()
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/vault/tamper-sector", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const { fileId, tamperAction } = req.body;
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Missing user identity" });
    }
    try {
      const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
      if (!file) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (Number(file.userId) !== headerUserId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (tamperAction === "bit-flip") {
        const corruptedMerkle = "CORRUPTED_MERKLE_ROOT_FLIP_" + import_crypto.default.randomBytes(4).toString("hex").toUpperCase();
        db.prepare("UPDATE files SET merkleRoot = ? WHERE id = ?").run(corruptedMerkle, fileId);
        return res.json({ success: true, action: "bit-flip" });
      } else if (tamperAction === "heal") {
        const filePath = getSecureFilePath(file.id);
        let diskMerkleRoot = "GENESIS_MERKLE_ROOT_000000000000000000";
        if (file.isFolder) {
          diskMerkleRoot = "FOLDER_ROOT_000000000000000000000000000000";
        } else {
          const chunks = db.prepare(
            "SELECT chunkHash FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC"
          ).all(file.id);
          if (chunks.length > 0) {
            const combinedHashes = chunks.map((c) => c.chunkHash).join("");
            diskMerkleRoot = import_crypto.default.createHash("sha256").update(combinedHashes).digest("hex");
          } else if (import_fs.default.existsSync(filePath)) {
            diskMerkleRoot = computeMerkleRoot(import_fs.default.readFileSync(filePath)) || "GENESIS_MERKLE_ROOT_000000000000000000";
          }
        }
        db.prepare("UPDATE files SET merkleRoot = ? WHERE id = ?").run(diskMerkleRoot, fileId);
        rebuildUserDag(headerUserId);
        return res.json({ success: true, action: "heal" });
      } else {
        return res.status(400).json({ error: "Invalid tamper action" });
      }
    } catch (e) {
      console.error("Tamper endpoint error:", e);
      return res.status(500).json({ error: e.message || "Failed to tamper sector." });
    }
  });
  app.post("/api/vault/rebuild-dag/:userId", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const paramUserId = Number(req.params.userId);
    if (!headerUserId || headerUserId !== paramUserId) {
      return res.status(403).json({ error: "Access denied: Unauthorized DAG rebuild." });
    }
    try {
      const length = rebuildUserDag(paramUserId);
      res.json({
        success: true,
        message: `Rebuilt ${length} DAG node linkages.`
      });
    } catch (e) {
      console.error("Rebuild error:", e);
      res.status(500).json({ error: e.message || "Failed to rebuild BlockDAG." });
    }
  });
  app.get("/api/vault/export-pack/:userId", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const paramUserId = Number(req.params.userId);
    if (!headerUserId || headerUserId !== paramUserId) {
      return res.status(403).json({ error: "Access denied: Unauthorized identity export." });
    }
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(paramUserId);
      if (!user) {
        return res.status(404).json({ error: "User profile not found in active database." });
      }
      const files = db.prepare("SELECT * FROM files WHERE userId = ?").all(paramUserId);
      const processedFiles = files.map((f) => {
        let fileBuffer = null;
        const filePath = getSecureFilePath(f.id);
        if (import_fs.default.existsSync(filePath)) {
          try {
            fileBuffer = import_fs.default.readFileSync(filePath);
          } catch (e) {
            console.error(`Error reading ${filePath}:`, e);
          }
        } else if (f.data && f.data.length > 0) {
          fileBuffer = decryptBuffer(f.data, getUserEncryptionKey(paramUserId));
        }
        return {
          id: f.id,
          name: f.name,
          type: f.type,
          size: f.size,
          folderPath: f.folderPath,
          isFolder: !!f.isFolder,
          isShared: f.isShared ? 1 : 0,
          senderName: f.senderName,
          shareNote: f.shareNote,
          lastModified: f.lastModified,
          deletedAt: f.deletedAt,
          originalFolderPath: f.originalFolderPath,
          clientEncrypted: f.clientEncrypted !== 0,
          previousDagHash: f.previousDagHash,
          dagHash: f.dagHash,
          dagSignature: f.dagSignature,
          encryptionKey: f.encryptionKey || null,
          data: fileBuffer ? fileBuffer.toString("base64") : null
        };
      });
      res.json({
        version: "2026.1-portable",
        profile: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          passwordHash: user.passwordHash,
          passwordSalt: user.passwordSalt,
          avatarColor: user.avatarColor,
          autoLockInterval: user.autoLockInterval,
          joinedAt: user.joinedAt,
          vaultSeedId: user.vaultSeedId
        },
        files: processedFiles
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/vault/import-pack", (req, res) => {
    console.warn(
      `[VaultImport] Received unexpected GET request to import-pack. Query:`,
      req.query
    );
    res.status(405).json({
      error: "Method Not Allowed",
      message: "This API requires a POST request with the .vault pack JSON body. Your client sent a GET request. This typically happens if a browser redirect occurred or if the client method was downgraded.",
      detectedMethod: req.method,
      requestUrl: req.url
    });
  });
  app.post("/api/vault/import-pack", (req, res) => {
    console.log(`[VaultImport] Commencing identity restoration...`);
    const { version, profile, files, systemMasterKey } = req.body;
    if (!profile || !profile.username || !profile.passwordHash || !profile.passwordSalt) {
      return res.status(400).json({
        error: "Incompatible backup structure or missing profile definition."
      });
    }
    try {
      const transaction = db.transaction(() => {
        const existingUser = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(profile.username);
        let userId;
        const derivedSeedId = profile.vaultSeedId || import_crypto.default.createHmac("sha256", profile.passwordHash).update(profile.username.toLowerCase()).digest("hex");
        const privateVaultId = profile.privateVaultId || import_crypto.default.createHash("sha256").update(derivedSeedId + "vault-id-isolation-constant").digest("hex").substring(0, 32);
        if (existingUser) {
          if (existingUser.passwordHash !== profile.passwordHash) {
            throw new Error(
              `Username matches an existing local vault context on this device but has a different password hash. Please rename or specify a unique identity.`
            );
          }
          userId = existingUser.id;
          db.prepare(
            `
            UPDATE users 
            SET displayName = ?, passwordHash = ?, passwordSalt = ?, avatarColor = ?, autoLockInterval = ?, vaultSeedId = ?, privateVaultId = ?
            WHERE id = ?
          `
          ).run(
            profile.displayName,
            profile.passwordHash,
            profile.passwordSalt,
            profile.avatarColor || existingUser.avatarColor || "#6366f1",
            profile.autoLockInterval !== void 0 ? profile.autoLockInterval : existingUser.autoLockInterval,
            profile.vaultSeedId || derivedSeedId,
            privateVaultId,
            userId
          );
        } else {
          let result;
          if (profile.id && !isNaN(Number(profile.id))) {
            const idToTry = Number(profile.id);
            const idTaken = db.prepare("SELECT id FROM users WHERE id = ?").get(idToTry);
            if (!idTaken) {
              result = db.prepare(
                `
                INSERT INTO users (id, username, displayName, passwordHash, passwordSalt, joinedAt, avatarColor, autoLockInterval, vaultSeedId, privateVaultId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `
              ).run(
                idToTry,
                profile.username,
                profile.displayName,
                profile.passwordHash,
                profile.passwordSalt,
                profile.joinedAt || Date.now(),
                profile.avatarColor || "#6366f1",
                profile.autoLockInterval || 0,
                profile.vaultSeedId || derivedSeedId,
                privateVaultId
              );
            }
          }
          if (!result) {
            result = db.prepare(
              `
              INSERT INTO users (username, displayName, passwordHash, passwordSalt, joinedAt, avatarColor, autoLockInterval, vaultSeedId, privateVaultId)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
            ).run(
              profile.username,
              profile.displayName,
              profile.passwordHash,
              profile.passwordSalt,
              profile.joinedAt || Date.now(),
              profile.avatarColor || "#6366f1",
              profile.autoLockInterval || 0,
              profile.vaultSeedId || derivedSeedId,
              privateVaultId
            );
          }
          userId = Number(result.lastInsertRowid);
        }
        if (systemMasterKey && systemMasterKey !== VAULT_MASTER_KEY) {
          const oldSystemKey = import_crypto.default.createHash("sha256").update(systemMasterKey).digest();
          const seedIdToUse = profile.vaultSeedId || derivedSeedId;
          const oldUserKey = import_crypto.default.createHmac("sha256", oldSystemKey).update(seedIdToUse).digest();
          const wrappedKey = encryptBuffer(oldUserKey, encryptionKey).toString(
            "hex"
          );
          db.prepare("UPDATE users SET migrationUserKey = ? WHERE id = ?").run(
            wrappedKey,
            userId
          );
          console.log(
            `[VaultImport] Stored wrapped migrationUserKey for user ${userId} to support server-level decryption migration.`
          );
        }
        const existingFiles = db.prepare("SELECT * FROM files WHERE userId = ?").all(userId);
        const existingFilesLookup = /* @__PURE__ */ new Map();
        for (const ef of existingFiles) {
          const key = `${(ef.folderPath || "/").toLowerCase()}:::${(ef.name || "").toLowerCase()}`;
          existingFilesLookup.set(key, ef);
        }
        if (Array.isArray(files)) {
          const userVaultSeedId2 = getVaultSeedIdForUser(userId);
          const insertFileStmt = db.prepare(`
            INSERT INTO files (userId, name, data, type, size, folderPath, isFolder, isShared, senderName, shareNote, lastModified, deletedAt, originalFolderPath, previousDagHash, dagHash, dagSignature, merkleRoot, vaultSeedId, clientEncrypted, encryptionKey, privateVaultId)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const f of files) {
            const isFolderVal = f.isFolder ? 1 : 0;
            const isSharedVal = f.isShared ? 1 : 0;
            const folderPath = f.folderPath || "/";
            const name = f.name;
            const fileBuffer = f.data ? Buffer.from(f.data, "base64") : null;
            const clientEncryptedVal = f.clientEncrypted !== false ? 1 : 0;
            f.lastModified = f.lastModified || Date.now();
            f.type = f.type || "application/octet-stream";
            f.size = typeof f.size === "number" ? f.size : 0;
            const backupLastModified = f.lastModified;
            const dagMetadata = computeBlockDagMetadata(userId, {
              ...f,
              buffer: fileBuffer
            });
            const resolvedSeedId = f.vaultSeedId || userVaultSeedId2;
            const lookupKey = `${folderPath.toLowerCase()}:::${name.toLowerCase()}`;
            const existingFile = existingFilesLookup.get(lookupKey);
            if (existingFile) {
              if (fileBuffer && fileBuffer.length > 0) {
                const filePath = getSecureFilePath(
                  existingFile.id,
                  dagMetadata.merkleRoot
                );
                try {
                  if (!import_fs.default.existsSync(filePath)) {
                    import_fs.default.writeFileSync(filePath, fileBuffer);
                    console.log(
                      `[ImportPack] Restored missing physical content for existing file record: ${name} (${existingFile.id})`
                    );
                  }
                  const metaPath = filePath + ".meta";
                  const metaData = {
                    name,
                    type: f.type,
                    size: f.size,
                    userId,
                    originalId: f.userId || userId,
                    receiverId: userId,
                    folderPath,
                    isFolder: isFolderVal === 1,
                    isShared: isSharedVal === 1,
                    senderName: f.senderName || null,
                    lastModified: f.lastModified,
                    clientEncrypted: clientEncryptedVal === 1,
                    vaultSeedId: resolvedSeedId,
                    encryptionKey: f.encryptionKey || null
                  };
                  import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
                } catch (e) {
                  console.error(
                    `Failed to write file physical content during restore: ${filePath}`,
                    e
                  );
                }
              }
              if (f.lastModified > existingFile.lastModified) {
                db.prepare(
                  `
                  UPDATE files 
                  SET type = ?, size = ?, isFolder = ?, isShared = ?, senderName = ?, shareNote = ?, lastModified = ?, deletedAt = ?, originalFolderPath = ?, previousDagHash = ?, dagHash = ?, dagSignature = ?, merkleRoot = ?, vaultSeedId = ?, clientEncrypted = ?, encryptionKey = ?, privateVaultId = ?
                  WHERE id = ?
                `
                ).run(
                  f.type,
                  f.size,
                  isFolderVal,
                  isSharedVal,
                  f.senderName || null,
                  f.shareNote || null,
                  backupLastModified,
                  f.deletedAt || null,
                  f.originalFolderPath || null,
                  dagMetadata.previousDagHash,
                  dagMetadata.dagHash,
                  dagMetadata.dagSignature,
                  dagMetadata.merkleRoot,
                  resolvedSeedId,
                  clientEncryptedVal,
                  f.encryptionKey || null,
                  privateVaultId,
                  existingFile.id
                );
              }
            } else {
              const info = insertFileStmt.run(
                userId,
                name,
                f.type,
                f.size,
                folderPath,
                isFolderVal,
                isSharedVal,
                f.senderName || null,
                f.shareNote || null,
                f.lastModified,
                f.deletedAt || null,
                f.originalFolderPath || null,
                dagMetadata.previousDagHash,
                dagMetadata.dagHash,
                dagMetadata.dagSignature,
                dagMetadata.merkleRoot,
                resolvedSeedId,
                clientEncryptedVal,
                f.encryptionKey || null,
                privateVaultId
              );
              const insertedId = Number(info.lastInsertRowid);
              if (fileBuffer && fileBuffer.length > 0) {
                const filePath = getSecureFilePath(
                  insertedId,
                  dagMetadata.merkleRoot
                );
                try {
                  if (!import_fs.default.existsSync(filePath)) {
                    import_fs.default.writeFileSync(filePath, fileBuffer);
                  } else {
                    console.log(
                      `[CAS] Deduplicated backup import new. Content already exists.`
                    );
                  }
                  const metaPath = filePath + ".meta";
                  const metaData = {
                    name,
                    type: f.type,
                    size: f.size,
                    userId,
                    originalId: f.userId || userId,
                    receiverId: userId,
                    folderPath,
                    isFolder: isFolderVal === 1,
                    isShared: isSharedVal === 1,
                    senderName: f.senderName || null,
                    lastModified: f.lastModified,
                    clientEncrypted: clientEncryptedVal === 1,
                    vaultSeedId: resolvedSeedId,
                    encryptionKey: f.encryptionKey || null
                  };
                  import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
                } catch (e) {
                  console.error(`Failed to write new file ${filePath}:`, e);
                }
              }
            }
          }
        }
        return userId;
      });
      const restoredUserId = transaction();
      const userVaultSeedId = getVaultSeedIdForUser(restoredUserId);
      let recoveryStats = {
        recovered: 0,
        total_scanned: 0,
        ownership_mismatches: 0
      };
      try {
        recoveryStats = performDeepRecovery(restoredUserId);
      } catch (e) {
        console.error(
          "[Recovery] performDeepRecovery failed during keypack import:",
          e
        );
      }
      let meshStats = 0;
      try {
        if (userVaultSeedId) {
          const shadowBlocks = db.prepare("SELECT * FROM mesh_shadow_blocks WHERE vaultSeedId = ?").all(userVaultSeedId);
          for (const shadow of shadowBlocks) {
            try {
              const meta = JSON.parse(shadow.metadata);
              const shadowFileName = meta.name || `Recovered_File`;
              const shadowFolderPath = meta.folderPath || "/";
              const isExisting = db.prepare(
                "SELECT id FROM files WHERE userId = ? AND (dagHash = ? OR (name = ? AND folderPath = ?))"
              ).get(
                restoredUserId,
                shadow.dagHash,
                shadowFileName,
                shadowFolderPath
              );
              if (!isExisting) {
                db.prepare(
                  `
                  INSERT INTO files (userId, name, type, size, folderPath, isFolder, isShared, lastModified, clientEncrypted, shareNote, dagHash, previousDagHash, dagSignature, merkleRoot, vaultSeedId, encryptionKey)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
                ).run(
                  restoredUserId,
                  shadowFileName,
                  meta.type || "application/octet-stream",
                  meta.size || 0,
                  shadowFolderPath,
                  meta.isFolder || meta.type === "directory" || meta.type === "folder" ? 1 : 0,
                  0,
                  meta.lastModified || Date.now(),
                  meta.clientEncrypted ? 1 : 0,
                  "HEALED - Synchronized from Decentralized Mesh Shadow Index",
                  shadow.dagHash,
                  meta.previousDagHash || null,
                  meta.dagSignature || null,
                  shadow.merkleRoot || meta.merkleRoot || null,
                  userVaultSeedId,
                  meta.encryptionKey || null
                );
                meshStats++;
              }
            } catch (innerShadowErr) {
              console.error(
                "[Recovery] Failed to restore single file index from shadow block:",
                innerShadowErr
              );
            }
          }
        }
      } catch (e) {
        console.error(
          "[Recovery] Failed to scan mesh shadow blocks during keypack import:",
          e
        );
      }
      const updatedUser = db.prepare(
        "SELECT id, username, displayName, joinedAt, avatarColor, autoLockInterval, vaultSeedId FROM users WHERE id = ?"
      ).get(restoredUserId);
      res.json({
        success: true,
        user: updatedUser,
        recovery: recoveryStats,
        mesh_recovery: meshStats
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/users", (req, res) => {
    try {
      const users = db.prepare("SELECT id, username, displayName, joinedAt FROM users").all();
      console.log(`[Auth] Serving metadata for ${users.length} workspace users.`);
      res.json(users);
    } catch (e) {
      console.error("Error fetching users:", e);
      res.status(500).json({ error: "Internal server error fetching users" });
    }
  });
  app.post("/api/register", (req, res) => {
    const {
      username,
      displayName,
      passwordHash,
      passwordSalt,
      joinedAt,
      autoLockInterval,
      privateVaultId
    } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username is required" });
    }
    const colors = [
      "#6366f1",
      "#8b5cf6",
      "#ec4899",
      "#f43f5e",
      "#f59e0b",
      "#10b981",
      "#06b6d4",
      "#3b82f6"
    ];
    const charSum = username.toLowerCase().split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const deterministicColor = colors[charSum % colors.length];
    try {
      const derivedSeedId = import_crypto.default.createHmac("sha256", passwordHash).update(username.toLowerCase()).digest("hex");
      const computedPrivateVaultId = privateVaultId || import_crypto.default.createHash("sha256").update(derivedSeedId + "vault-id-isolation-constant").digest("hex").substring(0, 32);
      const stmt = db.prepare(
        "INSERT INTO users (username, displayName, passwordHash, passwordSalt, joinedAt, avatarColor, autoLockInterval, vaultSeedId, privateVaultId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      const info = stmt.run(
        username,
        displayName,
        passwordHash,
        passwordSalt,
        joinedAt,
        deterministicColor,
        autoLockInterval || 0,
        derivedSeedId,
        computedPrivateVaultId
      );
      res.json({ id: info.lastInsertRowid, vaultSeedId: derivedSeedId });
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT") {
        res.status(400).json({ error: "Username already exists" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });
  function computeDeterministicSaltHex(username) {
    const hash = import_crypto.default.createHash("sha256").update(username.toLowerCase()).digest();
    return hash.subarray(0, 16).toString("hex");
  }
  app.post("/api/login", (req, res) => {
    const { username, passwordHash, passwordSalt } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username is required" });
    }
    let user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
    if (!user) {
      try {
        const resolvedSalt = passwordSalt || computeDeterministicSaltHex(username);
        const derivedSeedId = import_crypto.default.createHmac("sha256", passwordHash).update(username.toLowerCase()).digest("hex");
        const privateVaultId = import_crypto.default.createHash("sha256").update(derivedSeedId + "vault-id-isolation-constant").digest("hex").substring(0, 32);
        const stmt = db.prepare(
          "INSERT INTO users (username, displayName, passwordHash, passwordSalt, joinedAt, avatarColor, autoLockInterval, vaultSeedId, privateVaultId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        const colors = [
          "#6366f1",
          "#8b5cf6",
          "#ec4899",
          "#f43f5e",
          "#f59e0b",
          "#10b981",
          "#06b6d4",
          "#3b82f6"
        ];
        const charSum = username.toLowerCase().split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const deterministicColor = colors[charSum % colors.length];
        const info = stmt.run(
          username,
          username,
          passwordHash,
          resolvedSalt,
          Date.now(),
          deterministicColor,
          0,
          derivedSeedId,
          privateVaultId
        );
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
        console.log(
          `[Identity Recovery] Dynamically restored seed sovereign user identity for "${username}" (ID: ${user.id}) with vaultSeedId: ${derivedSeedId}`
        );
        try {
          performDeepRecovery(user.id);
        } catch (recoverErr) {
          console.error(
            "[Identity Recovery] performDeepRecovery failed during dynamic login:",
            recoverErr
          );
        }
        try {
          rebuildUserDag(user.id);
        } catch (dagErr) {
          console.error(
            "[Identity Recovery] Failed to rebuild user DAG during dynamic login:",
            dagErr
          );
        }
      } catch (err) {
        return res.status(500).json({ error: `Dynamic login recovery failed: ${err.message}` });
      }
    }
    if (user && user.passwordHash === passwordHash) {
      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
    } else if (user) {
      res.status(401).json({ error: "Invalid password" });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });
  app.post("/api/get-salt", (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username is required" });
    }
    const user = db.prepare(
      "SELECT passwordSalt FROM users WHERE username = ? COLLATE NOCASE"
    ).get(username);
    if (user) {
      res.json({ passwordSalt: user.passwordSalt });
    } else {
      const deterministicSalt = computeDeterministicSaltHex(username);
      res.json({ passwordSalt: deterministicSalt });
    }
  });
  app.post("/api/users/update", (req, res) => {
    const {
      id,
      displayName,
      passwordHash,
      passwordSalt,
      avatarColor,
      autoLockInterval
    } = req.body;
    try {
      if (passwordHash && passwordSalt) {
        db.prepare(
          "UPDATE users SET displayName = ?, passwordHash = ?, passwordSalt = ?, avatarColor = ?, autoLockInterval = ? WHERE id = ?"
        ).run(
          displayName,
          passwordHash,
          passwordSalt,
          avatarColor,
          autoLockInterval,
          id
        );
      } else {
        db.prepare(
          "UPDATE users SET displayName = ?, avatarColor = ?, autoLockInterval = ? WHERE id = ?"
        ).run(displayName, avatarColor, autoLockInterval, id);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/files/shared", (req, res) => {
    try {
      const files = db.prepare(
        `
        SELECT f.id, f.userId, f.name, f.type, f.size, f.folderPath, f.isFolder, f.isShared, f.senderName, f.shareNote, f.lastModified, f.deletedAt, f.originalFolderPath, f.clientEncrypted, f.previousDagHash, f.dagHash, f.dagSignature, f.sigAlgorithm, f.cryptoBlockNumber, f.originalOwnerSeedId, f.peerReceiverSeedId,
               u.displayName as ownerDisplayName, u.username as ownerUsername
        FROM files f 
        JOIN users u ON f.userId = u.id 
        WHERE f.isShared = 1
      `
      ).all();
      const processedFiles = files.map((f) => {
        return {
          ...f,
          isFolder: !!f.isFolder,
          isShared: !!f.isShared,
          clientEncrypted: !!f.clientEncrypted,
          data: null
          // Omit heavy payload from listing index
        };
      });
      res.json(processedFiles);
    } catch (err) {
      console.error("Error fetching shared files:", err);
      res.status(500).json({ error: "Failed to fetch shared files: " + err.message });
    }
  });
  app.get("/api/files/:userId", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const paramUserId = Number(req.params.userId);
    if (!headerUserId || headerUserId !== paramUserId) {
      return res.status(403).json({
        error: "Access denied: Unauthorized access to someone else's files"
      });
    }
    const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(paramUserId);
    if (!userExists) {
      return res.status(401).json({
        error: "User session invalid or database reset. Please register/login again."
      });
    }
    try {
      const files = db.prepare(
        `
        SELECT id, userId, name, type, size, folderPath, isFolder, isShared, senderName, shareNote, lastModified, deletedAt, originalFolderPath, previousDagHash, dagHash, dagSignature, sigAlgorithm, clientEncrypted, cryptoBlockNumber, originalOwnerSeedId, peerReceiverSeedId 
        FROM files 
        WHERE userId = ?
      `
      ).all(paramUserId);
      const processedFiles = files.map((f) => {
        return {
          ...f,
          isFolder: !!f.isFolder,
          isShared: !!f.isShared,
          clientEncrypted: !!f.clientEncrypted,
          data: null
          // Omit heavy payload from listing index
        };
      });
      res.json(processedFiles);
    } catch (err) {
      console.error("Critical error in /api/files/:userId:", err);
      res.status(500).json({
        error: `Database fetch failed: ${err.message}. This may indicate a schema corruption or missing BlockDAG columns.`
      });
    }
  });
  app.get("/api/files/:id/versions", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) return res.status(401).json({ error: "Access denied" });
    try {
      const fileId = req.params.id;
      const file = db.prepare("SELECT userId FROM files WHERE id = ?").get(fileId);
      if (!file || file.userId !== headerUserId) {
        return res.status(404).json({ error: "File not found" });
      }
      const versions = db.prepare(
        "SELECT id, fileId, merkleRoot, name, type, size, lastModified, savedAt FROM file_versions WHERE fileId = ? ORDER BY savedAt DESC"
      ).all(fileId);
      res.json(versions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/files/:id/versions/:versionId/restore", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) return res.status(401).json({ error: "Access denied" });
    try {
      const fileId = req.params.id;
      const versionId = req.params.versionId;
      const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
      if (!file || file.userId !== headerUserId)
        return res.status(404).json({ error: "File not found" });
      const version = db.prepare("SELECT * FROM file_versions WHERE id = ? AND fileId = ?").get(versionId, fileId);
      if (!version) return res.status(404).json({ error: "Version not found" });
      db.prepare(
        `
        INSERT INTO file_versions (fileId, merkleRoot, name, type, size, lastModified, savedAt, encryptionKey)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        fileId,
        file.merkleRoot,
        file.name,
        file.type,
        file.size,
        file.lastModified,
        Date.now(),
        file.encryptionKey
      );
      db.prepare(
        `
        UPDATE files 
        SET name = ?, type = ?, size = ?, lastModified = ?, merkleRoot = ?, encryptionKey = ?
        WHERE id = ?
      `
      ).run(
        version.name,
        version.type,
        version.size,
        Date.now(),
        version.merkleRoot,
        version.encryptionKey,
        fileId
      );
      scheduleMeshReplication(headerUserId, file.id);
      rebuildUserDag(headerUserId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.all("/api/files/download/:id", (req, res) => {
    const fileId = req.params.id;
    const headerUserId = Number(req.header("X-User-Id")) || Number(req.query.userId);
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: User identification missing" });
    }
    try {
      const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
      if (!file) {
        return res.status(404).json({ error: "Requested file entity was not found" });
      }
      if (Number(file.userId) !== headerUserId && !file.isShared) {
        return res.status(403).json({
          error: "Access denied: Unauthorized access to metadata or payload"
        });
      }
      const user = db.prepare("SELECT vaultSeedId, username FROM users WHERE id = ?").get(headerUserId);
      const username = user?.username;
      const isSyncedPeerFile = file.senderName && file.senderName !== username;
      if (isSyncedPeerFile) {
        return res.status(403).json({
          error: "Privacy Lock: This file was synchronized from another peer and is restricted from download or deletion by other users on the mesh network for privacy."
        });
      }
      if (req.method === "HEAD") {
        res.setHeader("Content-Type", file.type || "application/octet-stream");
        res.setHeader("Content-Length", file.size);
        res.setHeader("Accept-Ranges", "bytes");
        return res.status(200).end();
      }
      const range = req.headers.range;
      const fileSize = file.size;
      let start = 0;
      let end = fileSize - 1;
      let isPartial = false;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const partialstart = parts[0];
        const partialend = parts[1];
        start = parseInt(partialstart, 10);
        end = partialend ? parseInt(partialend, 10) : fileSize - 1;
        if (start < 0) start = 0;
        if (end >= fileSize) end = fileSize - 1;
        if (start <= end) {
          isPartial = true;
        }
      }
      res.setHeader("Content-Type", file.type || "application/octet-stream");
      res.setHeader("Accept-Ranges", "bytes");
      const isMedia = file.type?.startsWith("image/") || file.type?.startsWith("video/") || file.type?.startsWith("audio/") || file.type === "application/pdf";
      const forceDownload = req.query.download === "1" || req.query.download === "true";
      if (isMedia && !forceDownload) {
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(file.name)}"`
        );
      } else {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(file.name)}"`
        );
      }
      if (isPartial) {
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", end - start + 1);
      } else {
        res.setHeader("Content-Length", fileSize);
      }
      const filePath = getSecureFilePath(fileId);
      const isClientEncrypted = file.clientEncrypted !== 0;
      const fileChunks = db.prepare(
        "SELECT chunkHash FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC"
      ).all(fileId);
      if (fileChunks.length > 0) {
        const CHUNK_SIZE = 1024 * 1024;
        for (let i = 0; i < fileChunks.length; i++) {
          const chunkPlainSize = i === fileChunks.length - 1 ? file.size - i * CHUNK_SIZE : CHUNK_SIZE;
          const chunkStart = i * CHUNK_SIZE;
          const chunkEnd = chunkStart + chunkPlainSize - 1;
          const intersectStart = Math.max(start, chunkStart);
          const intersectEnd = Math.min(end, chunkEnd);
          if (intersectStart <= intersectEnd) {
            const h = fileChunks[i].chunkHash;
            const chunkPath = getSecureChunkPath(h);
            if (!import_fs.default.existsSync(chunkPath)) {
              console.error(
                `Missing physical file chunk ${h} for file ${fileId}`
              );
              if (!res.headersSent) {
                res.status(500).write("Streaming error: Missing chunk payload on disk");
              }
              res.end();
              return;
            }
            let decryptedChunk;
            if (!isClientEncrypted) {
              try {
                const fileData = import_fs.default.readFileSync(chunkPath);
                const fKey = file.encryptionKey ? Buffer.from(file.encryptionKey, "base64") : encryptionKey;
                if (fileData.length >= 56) {
                  try {
                    decryptedChunk = layeredDecryptBufferSync(fileData, fKey);
                  } catch (e) {
                    const ivBuffer = fileData.subarray(0, 16);
                    const cipherText = fileData.subarray(16);
                    const decipher = import_crypto.default.createDecipheriv(
                      "aes-256-cbc",
                      fKey,
                      ivBuffer
                    );
                    decryptedChunk = Buffer.concat([
                      decipher.update(cipherText),
                      decipher.final()
                    ]);
                  }
                } else {
                  const ivBuffer = fileData.subarray(0, 16);
                  const cipherText = fileData.subarray(16);
                  const decipher = import_crypto.default.createDecipheriv(
                    "aes-256-cbc",
                    fKey,
                    ivBuffer
                  );
                  decryptedChunk = Buffer.concat([
                    decipher.update(cipherText),
                    decipher.final()
                  ]);
                }
              } catch (decryptErr) {
                console.error("Chunk decrypt error:", decryptErr);
                res.end();
                return;
              }
            } else {
              decryptedChunk = import_fs.default.readFileSync(chunkPath);
            }
            const relativeStart = intersectStart - chunkStart;
            const relativeEnd = intersectEnd - chunkStart;
            const sliceToSend = decryptedChunk.subarray(
              relativeStart,
              relativeEnd + 1
            );
            res.write(sliceToSend);
          }
        }
        res.end();
        return;
      }
      if (!import_fs.default.existsSync(filePath) && !file.isFolder && file.size > 0) {
        try {
          const shadowBlock = file.dagHash ? db.prepare(
            "SELECT encryptedContent FROM mesh_shadow_blocks WHERE dagHash = ?"
          ).get(file.dagHash) : void 0;
          if (shadowBlock && shadowBlock.encryptedContent && shadowBlock.encryptedContent.length > 0) {
            import_fs.default.writeFileSync(filePath, shadowBlock.encryptedContent);
          }
        } catch (healErr) {
        }
      }
      if (import_fs.default.existsSync(filePath)) {
        if (!isClientEncrypted) {
          try {
            const fileData = import_fs.default.readFileSync(filePath);
            const fKey = file.encryptionKey ? Buffer.from(file.encryptionKey, "base64") : getUserEncryptionKey(file.userId);
            let decryptedFile;
            if (fileData.length >= 56) {
              try {
                decryptedFile = layeredDecryptBufferSync(fileData, fKey);
              } catch (e) {
                const ivBuffer = fileData.subarray(0, 16);
                const cipherText = fileData.subarray(16);
                const decipher = import_crypto.default.createDecipheriv(
                  "aes-256-cbc",
                  fKey,
                  ivBuffer
                );
                decryptedFile = Buffer.concat([
                  decipher.update(cipherText),
                  decipher.final()
                ]);
              }
            } else {
              const ivBuffer = fileData.subarray(0, 16);
              const cipherText = fileData.subarray(16);
              const decipher = import_crypto.default.createDecipheriv(
                "aes-256-cbc",
                fKey,
                ivBuffer
              );
              decryptedFile = Buffer.concat([
                decipher.update(cipherText),
                decipher.final()
              ]);
            }
            const sliceToSend = decryptedFile.subarray(start, end + 1);
            res.write(sliceToSend);
            res.end();
          } catch (streamErr) {
            console.error(
              "Failed to initialize system streaming decryption pipeline:",
              streamErr
            );
            if (!res.headersSent)
              res.status(500).send("Decryption stream failure");
          }
        } else {
          if (isPartial) {
            const fileStream = import_fs.default.createReadStream(filePath, { start, end });
            fileStream.on("error", (err) => {
              console.error("Range stream send failed:", err);
              if (!res.headersSent) res.status(500).end();
            });
            fileStream.pipe(res);
          } else {
            res.sendFile(filePath, { maxAge: 0, dotfiles: "allow" }, (err) => {
              if (err) {
                console.error("Direct sendfile failed:", err);
                if (!res.headersSent) res.status(500).end();
              }
            });
          }
        }
      } else {
        if (file.data && file.data.length > 0) {
          const decryptedData = decryptBuffer(
            file.data,
            getUserEncryptionKey(file.userId)
          );
          const sliceToSend = decryptedData.subarray(start, end + 1);
          res.send(sliceToSend);
        } else {
          res.status(404).json({
            error: "File payload missing correctly on disk or in database"
          });
        }
      }
    } catch (err) {
      console.error("Server-side file stream decrypt failed:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/files/update-raw/:id", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Missing X-User-Id header" });
    }
    try {
      const fileId = req.params.id;
      const file = db.prepare(
        "SELECT userId, name, senderName, vaultSeedId, clientEncrypted, encryptionKey FROM files WHERE id = ?"
      ).get(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      if (file.userId !== headerUserId) {
        return res.status(403).json({
          error: "Access denied: Unauthorized access to update this file"
        });
      }
      const user = db.prepare("SELECT vaultSeedId, username FROM users WHERE id = ?").get(headerUserId);
      const userSeed = user?.vaultSeedId;
      const username = user?.username;
      const isSyncedPeerFile = file.senderName && file.senderName !== username;
      if (isSyncedPeerFile) {
        return res.status(403).json({
          error: "Privacy Lock: This file was synchronized from another peer and is restricted from modification by other users on the mesh network for privacy."
        });
      }
      const metadataHeader = req.header("X-File-Metadata");
      if (!metadataHeader) {
        return res.status(400).json({ error: "Missing metadata header" });
      }
      let metadata;
      try {
        metadata = JSON.parse(decodeURIComponent(metadataHeader));
      } catch (err) {
        return res.status(400).json({ error: "Invalid metadata header" });
      }
      const VAULT_DATA_DIR = import_path.default.join(process.cwd(), "vault_data");
      if (!import_fs.default.existsSync(VAULT_DATA_DIR)) {
        import_fs.default.mkdirSync(VAULT_DATA_DIR, { recursive: true });
      }
      const clientEncrypted = metadata.clientEncrypted !== false;
      let finalKeyBuffer = getUserEncryptionKey(headerUserId);
      let finalKeyStr = file.encryptionKey || null;
      if (!clientEncrypted) {
        if (file.encryptionKey) {
          finalKeyBuffer = Buffer.from(file.encryptionKey, "base64");
        } else {
          finalKeyBuffer = import_crypto.default.randomBytes(32);
          finalKeyStr = finalKeyBuffer.toString("base64");
        }
      }
      const tempFileId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const tempFilePath = import_path.default.join(
        VAULT_DATA_DIR,
        `temp_update_${tempFileId}.tmp`
      );
      const writeStream = import_fs.default.createWriteStream(tempFilePath);
      if (!clientEncrypted) {
        const layeredEncrypt = new LayeredEncryptTransform(finalKeyBuffer);
        req.pipe(layeredEncrypt).pipe(writeStream);
      } else {
        req.pipe(writeStream);
      }
      writeStream.on("error", (err) => {
        console.error("Write stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Stream write error" });
      });
      writeStream.on("finish", () => {
        try {
          const existingFile = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
          if (!existingFile) {
            try {
              if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
            } catch (e) {
            }
            return res.status(404).json({ error: "File not found" });
          }
          const updateName = metadata.name !== void 0 ? metadata.name : existingFile.name;
          const updateType = metadata.type !== void 0 ? metadata.type : existingFile.type;
          const updateSize = metadata.size !== void 0 ? metadata.size : existingFile.size;
          const updateFolderPath = metadata.folderPath !== void 0 ? metadata.folderPath : existingFile.folderPath;
          const updateIsShared = metadata.isShared !== void 0 ? metadata.isShared ? 1 : 0 : existingFile.isShared;
          const updateShareNote = metadata.shareNote !== void 0 ? metadata.shareNote : existingFile.shareNote;
          const updateLastModified = metadata.lastModified !== void 0 ? metadata.lastModified : existingFile.lastModified;
          let updateDeletedAt = metadata.deletedAt !== void 0 ? metadata.deletedAt : existingFile.deletedAt;
          let updateOriginalFolderPath = metadata.originalFolderPath !== void 0 ? metadata.originalFolderPath : existingFile.originalFolderPath;
          let updateClientEncrypted = metadata.clientEncrypted !== void 0 ? metadata.clientEncrypted ? 1 : 0 : existingFile.clientEncrypted;
          if (updateFolderPath && !updateFolderPath.startsWith("/Trash")) {
            updateDeletedAt = null;
            updateOriginalFolderPath = null;
          }
          const newMerkleRoot = existingFile.isFolder ? "FOLDER_ROOT_000000000000000000000000000000" : computeMerkleRoot(import_fs.default.readFileSync(tempFilePath)) || "GENESIS_MERKLE_ROOT_000000000000000000";
          if (existingFile.merkleRoot && newMerkleRoot !== existingFile.merkleRoot && !existingFile.isFolder) {
            db.prepare(
              `
              INSERT INTO file_versions (fileId, merkleRoot, name, type, size, lastModified, savedAt, encryptionKey)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `
            ).run(
              fileId,
              existingFile.merkleRoot,
              existingFile.name,
              existingFile.type,
              existingFile.size,
              existingFile.lastModified,
              Date.now(),
              existingFile.encryptionKey
            );
          }
          db.prepare(
            `
            UPDATE files 
            SET name = ?, type = ?, size = ?, folderPath = ?, isShared = ?, shareNote = ?, data = NULL, lastModified = ?, deletedAt = ?, originalFolderPath = ?, clientEncrypted = ?, merkleRoot = ?, encryptionKey = ?
            WHERE id = ?
          `
          ).run(
            updateName,
            updateType,
            updateSize,
            updateFolderPath,
            updateIsShared,
            updateShareNote,
            updateLastModified,
            updateDeletedAt,
            updateOriginalFolderPath,
            updateClientEncrypted,
            newMerkleRoot,
            finalKeyStr,
            fileId
          );
          const finalFilePath = getSecureFilePath(fileId, newMerkleRoot);
          const metaPath = finalFilePath + ".meta";
          const stats = import_fs.default.statSync(tempFilePath);
          const metaData = {
            name: updateName,
            type: updateType,
            size: updateSize,
            userId: headerUserId,
            receiverId: headerUserId,
            // sync peer receiver id context
            folderPath: updateFolderPath || "/",
            isFolder: !!metadata.isFolder,
            isShared: !!updateIsShared,
            senderName: metadata.senderName || existingFile.senderName || null,
            clientEncrypted: !!updateClientEncrypted,
            lastModified: updateLastModified || Date.now(),
            ownerHint: getCurrentUserUsername(headerUserId)
          };
          if (metadata.originalId || existingFile.originalId) {
            metaData.originalId = metadata.originalId || existingFile.originalId;
          }
          import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
          if (import_fs.default.existsSync(finalFilePath)) {
            console.log(
              `[CAS] Deduplicated raw file update (2). Content already exists under hash: ${newMerkleRoot}`
            );
            try {
              if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
            } catch (e) {
            }
          } else {
            import_fs.default.renameSync(tempFilePath, finalFilePath);
          }
          rebuildUserDag(headerUserId);
          registerMeshShadowBlock(Number(fileId));
          scheduleMeshReplication(headerUserId, Number(fileId));
          res.json({ success: true });
        } catch (err) {
          console.error("Server raw update completion error:", err);
          try {
            if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
          } catch (e) {
          }
          res.status(500).json({ error: "Update logic error: " + err.message });
        }
      });
      writeStream.on("error", (err) => {
        console.error("Write stream error during raw update:", err);
        try {
          if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
        } catch (e) {
        }
        res.status(500).json({ error: "Failed to stream update contents to disk" });
      });
      req.on("error", (err) => {
        console.error("Request read error during raw update:", err);
        try {
          if (import_fs.default.existsSync(tempFilePath)) import_fs.default.unlinkSync(tempFilePath);
        } catch (e) {
        }
        res.status(500).json({ error: "Update read error" });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/files", (req, res) => {
    const {
      userId,
      name,
      data,
      type,
      size,
      folderPath,
      isFolder,
      isShared,
      senderName,
      shareNote,
      lastModified,
      clientEncrypted,
      privateVaultId
    } = req.body;
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId || headerUserId !== Number(userId)) {
      return res.status(403).json({
        error: "Access denied: Cannot upload files for another user workspace"
      });
    }
    const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(headerUserId);
    if (!userExists) {
      return res.status(401).json({
        error: "User session invalid or database reset. Please register/login again."
      });
    }
    try {
      let buffer = data ? Buffer.from(data, "base64") : null;
      const argUserId = Number(userId);
      const argName = name;
      const argType = type || "application/octet-stream";
      const argSize = typeof size === "number" ? size : 0;
      const argClientEncrypted = clientEncrypted !== false;
      const userKey = getUserEncryptionKey(argUserId);
      if (isCorruptOrVirusVideo(
        argName,
        argType,
        argSize,
        buffer || void 0,
        userKey
      )) {
        return res.status(400).json({
          error: "Upload blocked: File is suspected to be a corrupt video or malware/virus."
        });
      }
      const argFolderPath = folderPath || "/";
      const isFolderVal = isFolder ? 1 : 0;
      const isSharedVal = isShared ? 1 : 0;
      const argSenderName = senderName ?? null;
      const argShareNote = shareNote ?? null;
      const argLastModified = lastModified || Date.now();
      const dagMetadata = computeBlockDagMetadata(argUserId, {
        name: argName,
        size: argSize,
        type: argType,
        lastModified: argLastModified,
        buffer
      });
      const userVaultSeedId = getVaultSeedIdForUser(argUserId);
      const stmt = db.prepare(`
        INSERT INTO files (userId, name, data, type, size, folderPath, isFolder, isShared, senderName, shareNote, lastModified, previousDagHash, dagHash, dagSignature, merkleRoot, vaultSeedId, clientEncrypted, privateVaultId) 
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        argUserId,
        argName,
        argType,
        argSize,
        argFolderPath,
        isFolderVal,
        isSharedVal,
        argSenderName,
        argShareNote,
        argLastModified,
        dagMetadata.previousDagHash,
        dagMetadata.dagHash,
        dagMetadata.dagSignature,
        dagMetadata.merkleRoot,
        userVaultSeedId,
        argClientEncrypted ? 1 : 0,
        privateVaultId || null
      );
      const insertedId = Number(info.lastInsertRowid);
      const filePath = getSecureFilePath(insertedId, dagMetadata.merkleRoot);
      const metaPath = filePath + ".meta";
      if (buffer && buffer.length > 0) {
        if (!import_fs.default.existsSync(filePath)) {
          import_fs.default.writeFileSync(filePath, buffer);
        } else {
          console.log(
            `[CAS] Deduplicated files POST upload. Content already exists: ${filePath}`
          );
        }
      }
      const metaData = {
        name: argName,
        type: argType,
        size: argSize,
        userId: argUserId,
        receiverId: argUserId,
        // sync peer receiver id context
        folderPath: argFolderPath,
        isFolder: isFolderVal === 1,
        isShared: isSharedVal === 1,
        senderName: argSenderName,
        clientEncrypted: argClientEncrypted,
        lastModified: argLastModified,
        ownerHint: getCurrentUserUsername(argUserId),
        vaultSeedId: userVaultSeedId,
        privateVaultId
      };
      if (req.body.originalId) metaData.originalId = req.body.originalId;
      import_fs.default.writeFileSync(metaPath, JSON.stringify(metaData));
      scheduleMeshReplication(argUserId, insertedId);
      res.json({ id: insertedId, vaultSeedId: userVaultSeedId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/files/:id", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Authentication header is required" });
    }
    try {
      const file = db.prepare(
        "SELECT userId, name, senderName, vaultSeedId FROM files WHERE id = ?"
      ).get(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      if (file.userId !== headerUserId) {
        return res.status(403).json({
          error: "Access denied: Unauthorized access to update this file"
        });
      }
      const user = db.prepare("SELECT vaultSeedId, username FROM users WHERE id = ?").get(headerUserId);
      const userSeed = user?.vaultSeedId;
      const username = user?.username;
      const isSyncedPeerFile = file.senderName && file.senderName !== username;
      if (isSyncedPeerFile) {
        if (req.body.deletedAt !== void 0 || req.body.folderPath && req.body.folderPath.startsWith("/Trash")) {
          return res.status(403).json({
            error: "Privacy Lock: This file was synchronized from another peer and is restricted from deletion/trash by other users on the mesh network for privacy."
          });
        }
      }
      const {
        name,
        type,
        size,
        folderPath,
        isShared,
        data,
        lastModified,
        deletedAt,
        originalFolderPath,
        shareNote
      } = req.body;
      console.log(
        "DEBUG: update file - received deletedAt:",
        deletedAt,
        "for file:",
        req.params.id
      );
      const existingFile = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
      if (!existingFile) {
        return res.status(404).json({ error: "File not found" });
      }
      const updateName = name !== void 0 ? name : existingFile.name;
      const updateType = type !== void 0 ? type : existingFile.type;
      const updateSize = size !== void 0 ? size : existingFile.size;
      const updateFolderPath = folderPath !== void 0 ? folderPath : existingFile.folderPath;
      const updateIsShared = isShared !== void 0 ? isShared ? 1 : 0 : existingFile.isShared;
      const updateShareNote = shareNote !== void 0 ? shareNote : existingFile.shareNote;
      const updateLastModified = lastModified !== void 0 ? lastModified : existingFile.lastModified;
      let updateDeletedAt = deletedAt !== void 0 ? deletedAt : existingFile.deletedAt;
      let updateOriginalFolderPath = originalFolderPath !== void 0 ? originalFolderPath : existingFile.originalFolderPath;
      let updateClientEncrypted = req.body.clientEncrypted !== void 0 ? req.body.clientEncrypted ? 1 : 0 : existingFile.clientEncrypted;
      if (updateFolderPath && !updateFolderPath.startsWith("/Trash")) {
        updateDeletedAt = null;
        updateOriginalFolderPath = null;
      }
      if (data !== void 0) {
        let buffer = data ? Buffer.from(data, "base64") : null;
        const newMerkleRoot = buffer && buffer.length > 0 ? computeMerkleRoot(buffer) || "GENESIS_MERKLE_ROOT_000000000000000000" : "GENESIS_MERKLE_ROOT_000000000000000000";
        if (existingFile.merkleRoot && newMerkleRoot !== existingFile.merkleRoot && !existingFile.isFolder) {
          db.prepare(
            `
            INSERT INTO file_versions (fileId, merkleRoot, name, type, size, lastModified, savedAt, encryptionKey)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            req.params.id,
            existingFile.merkleRoot,
            existingFile.name,
            existingFile.type,
            existingFile.size,
            existingFile.lastModified,
            Date.now(),
            existingFile.encryptionKey
          );
        }
        db.prepare(
          `
          UPDATE files 
          SET name = ?, type = ?, size = ?, folderPath = ?, isShared = ?, shareNote = ?, data = NULL, lastModified = ?, deletedAt = ?, originalFolderPath = ?, clientEncrypted = ?, merkleRoot = ?
          WHERE id = ?
        `
        ).run(
          updateName,
          updateType,
          updateSize,
          updateFolderPath,
          updateIsShared,
          updateShareNote,
          updateLastModified,
          updateDeletedAt,
          updateOriginalFolderPath,
          updateClientEncrypted,
          newMerkleRoot,
          req.params.id
        );
        const filePath = getSecureFilePath(req.params.id, newMerkleRoot);
        if (buffer && buffer.length > 0) {
          if (!import_fs.default.existsSync(filePath)) {
            import_fs.default.writeFileSync(filePath, buffer);
          } else {
            console.log(
              `[CAS] Deduplicated files PUT update. Content already exists: ${filePath}`
            );
          }
        } else {
          safeDeletePhysicalFile(req.params.id, newMerkleRoot);
        }
        scheduleMeshReplication(headerUserId, Number(req.params.id));
      } else {
        db.prepare(
          `
          UPDATE files 
          SET name = ?, folderPath = ?, isShared = ?, shareNote = ?, lastModified = ?, deletedAt = ?, originalFolderPath = ? 
          WHERE id = ?
        `
        ).run(
          updateName,
          updateFolderPath,
          updateIsShared,
          updateShareNote,
          updateLastModified,
          updateDeletedAt,
          updateOriginalFolderPath,
          req.params.id
        );
      }
      rebuildUserDag(headerUserId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/files/empty-trash/:userId", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const paramUserId = Number(req.params.userId);
    if (!headerUserId || headerUserId !== paramUserId) {
      return res.status(403).json({
        error: "Access denied: Cannot empty trash of other user accounts"
      });
    }
    try {
      const user = db.prepare("SELECT vaultSeedId, username FROM users WHERE id = ?").get(paramUserId);
      const userSeed = user?.vaultSeedId;
      const username = user?.username;
      const rawFiles = db.prepare(
        "SELECT id, name, dagHash, senderName, vaultSeedId, merkleRoot FROM files WHERE userId = ? AND deletedAt IS NOT NULL"
      ).all(paramUserId);
      const filesToDelete = [];
      for (const f of rawFiles) {
        const isSyncedPeerFile = f.senderName && f.senderName !== username;
        if (!isSyncedPeerFile) {
          filesToDelete.push(f);
        }
      }
      console.log(
        `[DIAGNOSTIC] [FILE_DELETION] Source: EMPTY_TRASH, UserID: ${req.params.userId}, Files to delete: ${JSON.stringify(filesToDelete)}`
      );
      for (const f of filesToDelete) {
        db.prepare("DELETE FROM files WHERE id = ?").run(f.id);
        if (f.dagHash) {
          db.prepare(
            "INSERT OR IGNORE INTO mesh_tombstones (dagHash, ownerId, deletedAt) VALUES (?, ?, ?)"
          ).run(f.dagHash, paramUserId, Date.now());
          db.prepare(
            "DELETE FROM mesh_shadow_blocks WHERE dagHash = ? AND ownerId = ?"
          ).run(f.dagHash, paramUserId);
        }
        safeDeletePhysicalFile(f.id, f.merkleRoot);
      }
      rebuildUserDag(headerUserId);
      setTimeout(runStorageGarbageCollector, 0);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/files/:id", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    if (!headerUserId) {
      return res.status(401).json({ error: "Access denied: Authentication header is required" });
    }
    try {
      const fileId = req.params.id;
      const file = db.prepare(
        "SELECT userId, name, dagHash, senderName, vaultSeedId, merkleRoot FROM files WHERE id = ?"
      ).get(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      if (file.userId !== headerUserId) {
        return res.status(403).json({
          error: "Access denied: Unauthorized access to delete this file"
        });
      }
      const user = db.prepare("SELECT vaultSeedId, username FROM users WHERE id = ?").get(headerUserId);
      const userSeed = user?.vaultSeedId;
      const username = user?.username;
      const isSyncedPeerFile = file.senderName && file.senderName !== username;
      if (isSyncedPeerFile) {
        return res.status(403).json({
          error: "Privacy Lock: This file was synchronized from another peer and is restricted from download or deletion by other users on the mesh network for privacy."
        });
      }
      console.log(
        `[DIAGNOSTIC] [FILE_DELETION] Source: MANUAL_DELETE, UserID: ${headerUserId}, FileID: ${fileId}, Name: ${file.name || "unknown"}`
      );
      db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
      if (file.dagHash) {
        db.prepare(
          "INSERT OR IGNORE INTO mesh_tombstones (dagHash, ownerId, deletedAt) VALUES (?, ?, ?)"
        ).run(file.dagHash, headerUserId, Date.now());
        db.prepare(
          "DELETE FROM mesh_shadow_blocks WHERE dagHash = ? AND ownerId = ?"
        ).run(file.dagHash, headerUserId);
      }
      safeDeletePhysicalFile(fileId, file.merkleRoot);
      rebuildUserDag(headerUserId);
      setTimeout(runStorageGarbageCollector, 0);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/system/deep-recover/:userId", (req, res) => {
    const headerUserId = Number(req.header("X-User-Id"));
    const paramUserId = Number(req.params.userId);
    if (!headerUserId || headerUserId !== paramUserId) {
      return res.status(403).json({ error: "Unauthorized access to system recovery" });
    }
    const result = performDeepRecovery(paramUserId);
    res.json(result);
  });
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  const httpServer = (0, import_http.createServer)(app);
  const io = new import_socket.Server(httpServer);
  io.on("connection", (socket) => {
    console.log("Socket.io connected:", socket.id);
    socket.on("offer", (data) => {
      console.log("Socket.io relaying offer from", socket.id);
      socket.broadcast.emit("offer", data);
    });
    socket.on("answer", (data) => {
      console.log("Socket.io relaying answer from", socket.id);
      socket.broadcast.emit("answer", data);
    });
    socket.on("candidate", (data) => socket.broadcast.emit("candidate", data));
    socket.on("disconnect", () => {
      console.log("Socket.io disconnected:", socket.id);
    });
  });
  httpServer.setTimeout(6e5);
  httpServer.keepAliveTimeout = 65e3;
  httpServer.headersTimeout = 66e3;
  const wss = new import_ws.WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url && request.url.startsWith("/socket.io/")) {
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
  const clients = /* @__PURE__ */ new Map();
  wss.on("connection", (ws) => {
    const cid = Math.random().toString(36).substring(2, 10);
    ws.on("message", (messageStr) => {
      try {
        const msg = JSON.parse(messageStr.toString());
        if (msg.type === "register") {
          clients.set(ws, {
            ws,
            cid,
            username: msg.username,
            displayName: msg.displayName
          });
          ws.send(JSON.stringify({ type: "welcome", cid }));
          broadcastActiveUsers();
        } else if (msg.type === "signal") {
          const sender = clients.get(ws);
          if (sender) {
            for (const [clientWs, client] of clients.entries()) {
              if (client.cid === msg.targetCid || msg.targetUsername && client.username === msg.targetUsername && client.cid !== sender.cid) {
                clientWs.send(
                  JSON.stringify({
                    type: "signal",
                    senderUsername: sender.username,
                    senderCid: sender.cid,
                    token: msg.token
                  })
                );
                if (msg.targetCid) break;
              }
            }
          }
        } else if (msg.type === "webrtc") {
          const sender = clients.get(ws);
          if (sender) {
            for (const [clientWs, client] of clients.entries()) {
              if (client.cid === msg.targetCid || msg.targetUsername && client.username === msg.targetUsername && client.cid !== sender.cid) {
                clientWs.send(
                  JSON.stringify({
                    type: "webrtc",
                    senderUsername: sender.username,
                    senderCid: sender.cid,
                    payload: msg.payload
                  })
                );
                if (msg.targetCid) break;
              }
            }
          }
        } else if (msg.type === "share_request" || msg.type === "share_response") {
          const sender = clients.get(ws);
          if (sender) {
            for (const [clientWs, client] of clients.entries()) {
              if (client.cid === msg.targetCid || msg.targetUsername && client.username === msg.targetUsername) {
                clientWs.send(
                  JSON.stringify({
                    ...msg,
                    senderUsername: sender.username,
                    senderCid: sender.cid
                  })
                );
                if (msg.targetCid) break;
              }
            }
          }
        } else if (msg.type === "broadcast_refresh") {
          for (const [clientWs] of clients.entries()) {
            if (clientWs !== ws) {
              clientWs.send(JSON.stringify({ type: "broadcast_refresh" }));
            }
          }
        }
      } catch (err) {
        console.error("Error processing websocket message", err);
      }
    });
    ws.on("close", () => {
      clients.delete(ws);
      broadcastActiveUsers();
    });
    function broadcastActiveUsers() {
      const list = Array.from(clients.values()).map((c) => ({
        cid: c.cid,
        username: c.username,
        displayName: c.displayName
      }));
      for (const [clientWs, client] of clients.entries()) {
        try {
          clientWs.send(
            JSON.stringify({
              type: "presence",
              yourCid: client.cid,
              users: list
            })
          );
        } catch (e) {
        }
      }
    }
  });
  const startListen = (port) => {
    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${port}`);
    }).on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${port} is busy, retrying...`);
        setTimeout(() => startListen(port), 1e3);
      } else {
        console.error(err);
      }
    });
  };
  startListen(PORT);
  const gracefulShutdown = () => {
    console.log("Shutting down gracefully...");
    try {
      db.close();
      console.log("Database closed.");
    } catch (e) {
      console.error("Error closing DB:", e);
    }
    httpServer.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  };
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}
startServer();
//# sourceMappingURL=server.cjs.map
