import { createCipheriv, randomBytes } from 'crypto';
import { EncryptedData } from '@/utils/crypto';

/**
 * Seals a value the way the application did before the AES key was derived: the
 * passphrase's UTF-8 bytes copied into a zeroed 32-byte buffer, and no version
 * marker on the ciphertext. Tests need it to write a row the way production
 * wrote one, which is the only way to prove such a row still opens.
 */
export function encryptLegacy(text: string, key: string): EncryptedData {
  const keyBuf = Buffer.alloc(32);
  Buffer.from(key, 'utf8').copy(keyBuf);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
  const out = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return {
    encrypted: out.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}
