import { hash, verify } from 'argon2';

export async function hashPassword(password: string) {
  return hash(password);
}

export async function verifyPassword(password: string, hashValue: string) {
  return verify(hashValue, password);
}
