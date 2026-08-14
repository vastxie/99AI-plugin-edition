import { randomBytes } from 'crypto';

export function createRandomUniqueString(length: number = 32): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}
