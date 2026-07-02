import argon2 from 'argon2';

const OPTS = { type: argon2.argon2id } as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try { return await argon2.verify(hash, plain); }
  catch { return false; }
}
