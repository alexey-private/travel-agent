import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function normalizeKey(key: string): Buffer {
  const buf = Buffer.alloc(KEY_LENGTH);
  Buffer.from(key, 'utf8').copy(buf);
  return buf;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export function encrypt(text: string, key: string): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, normalizeKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt(data: EncryptedData, key: string): string {
  const decipher = createDecipheriv(ALGORITHM, normalizeKey(key), Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(data.encrypted, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
