import { encrypt, decrypt } from '@/utils/crypto';

describe('crypto utility', () => {
  const key = 'test-key-32-chars-long-padding!!';
  const plaintext = 'super-secret-app-specific-password';

  it('encrypts and decrypts round-trip', () => {
    const encrypted = encrypt(plaintext, key);
    const result = decrypt(encrypted, key);
    expect(result).toBe(plaintext);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
  });

  it('fails to decrypt with a wrong key', () => {
    const encrypted = encrypt(plaintext, key);
    expect(() => decrypt(encrypted, 'different-key-32-chars-padded!!!!')).toThrow();
  });

  it('returns non-empty hex strings', () => {
    const { encrypted, iv, authTag } = encrypt(plaintext, key);
    expect(encrypted).toMatch(/^[0-9a-f]+$/);
    expect(iv).toMatch(/^[0-9a-f]+$/);
    expect(authTag).toMatch(/^[0-9a-f]+$/);
  });

  it('handles unicode text', () => {
    const unicode = 'пароль-тест-🔑';
    const encrypted = encrypt(unicode, key);
    expect(decrypt(encrypted, key)).toBe(unicode);
  });
});
