import { encrypt, decrypt, isLegacyCiphertext } from '@/utils/crypto';
import { encryptLegacy } from '../../helpers/legacyCrypto';

const KEY = 'a-32-character-key-for-tests-012';

describe('encrypt / decrypt', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('app-specific-password', KEY), KEY)).toBe('app-specific-password');
  });

  it('gives every encryption its own IV', () => {
    const a = encrypt('same text', KEY);
    const b = encrypt('same text', KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.encrypted).not.toBe(b.encrypted);
  });

  it('rejects ciphertext that was tampered with', () => {
    const data = encrypt('app-specific-password', KEY);
    const flipped = data.encrypted.slice(0, -2) + (data.encrypted.endsWith('00') ? '11' : '00');
    expect(() => decrypt({ ...data, encrypted: flipped }, KEY)).toThrow();
  });

  it('rejects a wrong key', () => {
    expect(() => decrypt(encrypt('secret', KEY), 'a-different-32-character-key-012')).toThrow();
  });
});

describe('key derivation', () => {
  it('marks what it writes as derived', () => {
    expect(isLegacyCiphertext(encrypt('secret', KEY).encrypted)).toBe(false);
  });

  it('uses the whole key, not its first 32 characters', () => {
    // The old scheme copied the passphrase into a fixed 32-byte buffer, so
    // everything past the 32nd character was dropped and two different keys
    // opened each other's data. The second assertion is the bug, kept so the
    // first one cannot pass vacuously.
    const long = 'x'.repeat(32);
    expect(() => decrypt(encrypt('secret', `${long}A`), `${long}B`)).toThrow();
    expect(decrypt(encryptLegacy('secret', `${long}A`), `${long}B`)).toBe('secret');
  });

  it('does not open derived ciphertext with the old key', () => {
    // Dropping the version marker forces the legacy path. Under the same
    // passphrase it must still fail — that is what makes the marker meaningful
    // rather than decorative.
    const data = encrypt('secret', KEY);
    expect(() => decrypt({ ...data, encrypted: data.encrypted.slice(3) }, KEY)).toThrow();
  });
});

describe('rows written before the derivation', () => {
  it('are recognised', () => {
    expect(isLegacyCiphertext(encryptLegacy('secret', KEY).encrypted)).toBe(true);
  });

  it('still decrypt', () => {
    expect(decrypt(encryptLegacy('app-specific-password', KEY), KEY)).toBe('app-specific-password');
  });
});
