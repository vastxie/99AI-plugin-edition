import { maskContact } from './maskContact';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('maskContact', () => {
  it('masks email local parts', () => {
    expect(maskContact('private.user@example.com')).toBe('pr**********@example.com');
  });

  it('masks phone numbers', () => {
    expect(maskContact('13800138000')).toBe('138******00');
  });
});
