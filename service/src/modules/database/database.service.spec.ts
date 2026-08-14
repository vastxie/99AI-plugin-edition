import { DatabaseService } from './database.service';

declare const afterAll: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('DatabaseService initial administrator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does nothing when a super administrator already exists', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([{ id: 1 }]),
      transaction: jest.fn(),
    };
    const service = new DatabaseService(connection as any);

    await expect(service.checkSuperAdmin()).resolves.toBeUndefined();
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('refuses first boot without an explicit strong password', async () => {
    delete process.env.INITIAL_ADMIN_PASSWORD;
    const connection = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(),
    };
    const service = new DatabaseService(connection as any);

    await expect(service.checkSuperAdmin()).rejects.toThrow('INITIAL_ADMIN_PASSWORD');
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it.each([
    '123456',
    'CHANGE_ME_REQUIRED',
    'replace-with-at-least-12-characters',
    'aaaaaaaaaaaa',
  ])('refuses a documented or trivial placeholder password: %s', async password => {
    process.env.INITIAL_ADMIN_PASSWORD = password;
    const connection = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(),
    };
    const service = new DatabaseService(connection as any);

    await expect(service.checkSuperAdmin()).rejects.toThrow('INITIAL_ADMIN_PASSWORD');
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('creates the administrator and balance in one transaction without logging the password', async () => {
    process.env.INITIAL_ADMIN_PASSWORD = 'a-strong-initial-password';
    process.env.INITIAL_ADMIN_USERNAME = 'root_admin';
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ insertId: 42 })
        .mockResolvedValueOnce(undefined),
    };
    const connection = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async callback => callback(manager)),
    };
    const service = new DatabaseService(connection as any);

    await service.checkSuperAdmin();

    expect(connection.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('VALUES (?, ?, ?, ?, ?)'),
      expect.arrayContaining(['root_admin', 1, 'admin@localhost.invalid', 'super']),
    );
    expect(manager.query.mock.calls[0][1][1]).not.toBe(process.env.INITIAL_ADMIN_PASSWORD);
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('VALUES (?, 0, 1000, 100)'),
      [42],
    );
  });
});
