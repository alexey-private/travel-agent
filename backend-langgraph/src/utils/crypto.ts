import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * Marks ciphertext whose AES key was derived with scrypt. Rows written before
 * the derivation existed carry no prefix and are read with `legacyKey`; nothing
 * writes that scheme any more. The prefix lives in the ciphertext column rather
 * than a new one so that reading a row never depends on a migration having run.
 */
const VERSION_PREFIX = 'v2:';

/**
 * One fixed salt for the whole application. A per-row salt would be stronger,
 * but it needs a column of its own and makes the derivation impossible to
 * cache; with a single long-lived key the salt's remaining job is domain
 * separation — the same `ENCRYPTION_KEY` used elsewhere does not yield this
 * AES key.
 */
const SCRYPT_SALT = 'travel-agent/icloud-tokens/v2';

const derivedKeys = new Map<string, Buffer>();

/**
 * scrypt is slow on purpose — that is what makes a guessed `ENCRYPTION_KEY`
 * expensive to test — so the result is memoised. The process holds one key for
 * its whole life; without the cache every save and every calendar read would
 * pay the derivation again.
 */
function deriveKey(passphrase: string): Buffer {
  let key = derivedKeys.get(passphrase);
  if (!key) {
    key = scryptSync(passphrase, SCRYPT_SALT, KEY_LENGTH);
    derivedKeys.set(passphrase, key);
  }
  return key;
}

/**
 * The pre-`v2` scheme: the passphrase's UTF-8 bytes copied into a zeroed
 * 32-byte buffer, so a short key was padded with zeros and a long one silently
 * truncated. Read-only — kept so rows written before the change still open, and
 * `isLegacyCiphertext` is what lets a caller retire them.
 */
function legacyKey(passphrase: string): Buffer {
  const buf = Buffer.alloc(KEY_LENGTH);
  Buffer.from(passphrase, 'utf8').copy(buf);
  return buf;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * True when the stored ciphertext predates the scrypt derivation. Such a row is
 * still readable, but its key is the weak one: re-encrypt it on the next read.
 */
export function isLegacyCiphertext(encrypted: string): boolean {
  return !encrypted.startsWith(VERSION_PREFIX);
}

export function encrypt(text: string, key: string): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return {
    encrypted: VERSION_PREFIX + encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt(data: EncryptedData, key: string): string {
  const legacy = isLegacyCiphertext(data.encrypted);
  const ciphertext = legacy ? data.encrypted : data.encrypted.slice(VERSION_PREFIX.length);
  const decipher = createDecipheriv(
    ALGORITHM,
    legacy ? legacyKey(key) : deriveKey(key),
    Buffer.from(data.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
