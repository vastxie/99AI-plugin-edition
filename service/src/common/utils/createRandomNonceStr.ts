import { randomInt } from 'crypto';

export function createRandomNonceStr(len: number): string {
  const data = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let str = '';
  for (let i = 0; i < len; i++) {
    str += data.charAt(randomInt(0, data.length));
  }
  return str;
}
