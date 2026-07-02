import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth.js';

describe('password', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});
