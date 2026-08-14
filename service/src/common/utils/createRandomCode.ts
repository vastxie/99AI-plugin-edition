import { randomInt } from 'crypto';

export function createRandomCode(): number {
  return randomInt(100000, 1000000);
}
