import crypto from 'crypto';
import { Transform } from 'stream';

// Derive keys for AES-GCM and ChaCha20-Poly1305 from a single master key
export function deriveKeys(masterKey: Buffer) {
  const aesKey = crypto.createHash('sha256').update(masterKey).update('aes').digest();
  const chachaKey = crypto.createHash('sha256').update(masterKey).update('chacha').digest();
  return { aesKey, chachaKey };
}

export class LayeredEncryptTransform extends Transform {
  private aesCipher: crypto.CipherGCM;
  private chachaCipher: crypto.CipherCCM;
  private aesIv: Buffer;
  private chachaIv: Buffer;
  private headerWritten = false;

  constructor(masterKey: Buffer) {
    super();
    const { aesKey, chachaKey } = deriveKeys(masterKey);
    this.aesIv = crypto.randomBytes(12);
    this.chachaIv = crypto.randomBytes(12);
    this.aesCipher = crypto.createCipheriv('aes-256-gcm', aesKey, this.aesIv);
    
    // Type cast required since @types/node might not fully support chacha20-poly1305 specific options yet in all versions
    this.chachaCipher = crypto.createCipheriv('chacha20-poly1305', chachaKey, this.chachaIv, { authTagLength: 16 } as any);
  }

  _transform(chunk: any, encoding: string, callback: Function) {
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

  _flush(callback: Function) {
    try {
      if (!this.headerWritten) {
        this.push(Buffer.concat([this.aesIv, this.chachaIv]));
        this.headerWritten = true;
      }
      const layer1Final = this.aesCipher.final();
      const layer2Final = this.chachaCipher.update(layer1Final);
      const layer2End = this.chachaCipher.final();
      this.push(Buffer.concat([layer2Final, layer2End]));
      
      // Get Auth Tags
      const aesTag = this.aesCipher.getAuthTag();
      const chachaTag = this.chachaCipher.getAuthTag();
      
      // Append tags at the end (16 bytes each = 32 bytes)
      this.push(Buffer.concat([aesTag, chachaTag]));
      callback();
    } catch (e) {
      callback(e);
    }
  }
}

export function layeredDecryptBufferSync(buffer: Buffer, masterKey: Buffer): Buffer {
  if (buffer.length < 24 + 32) {
    throw new Error("Buffer too short for layered decryption");
  }

  const { aesKey, chachaKey } = deriveKeys(masterKey);
  
  const aesIv = buffer.subarray(0, 12);
  const chachaIv = buffer.subarray(12, 24);
  
  const aesTag = buffer.subarray(buffer.length - 32, buffer.length - 16);
  const chachaTag = buffer.subarray(buffer.length - 16);
  
  const cipherText = buffer.subarray(24, buffer.length - 32);

  const chachaDecipher = crypto.createDecipheriv('chacha20-poly1305', chachaKey, chachaIv, { authTagLength: 16 } as any);
  chachaDecipher.setAuthTag(chachaTag);
  const layer1Decrypted = Buffer.concat([chachaDecipher.update(cipherText), chachaDecipher.final()]);

  const aesDecipher = crypto.createDecipheriv('aes-256-gcm', aesKey, aesIv);
  aesDecipher.setAuthTag(aesTag);
  const plainText = Buffer.concat([aesDecipher.update(layer1Decrypted), aesDecipher.final()]);

  return plainText;
}
