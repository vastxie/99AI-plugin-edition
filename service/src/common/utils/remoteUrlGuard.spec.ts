import axios from 'axios';
import { promises as dns } from 'dns';
import {
  assertSafeRemoteUrl,
  fetchRemoteUrlBuffer,
  RemoteUrlSecurityError,
} from './remoteUrlGuard';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const mockedAxiosGet = axios.get as any;

describe('remoteUrlGuard', () => {
  beforeEach(() => {
    mockedAxiosGet.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects localhost and loopback URLs before issuing a request', async () => {
    await expect(assertSafeRemoteUrl('http://localhost/file.txt')).rejects.toBeInstanceOf(
      RemoteUrlSecurityError,
    );
    await expect(assertSafeRemoteUrl('http://127.0.0.1/file.txt')).rejects.toBeInstanceOf(
      RemoteUrlSecurityError,
    );
    await expect(assertSafeRemoteUrl('http://[::1]/file.txt')).rejects.toBeInstanceOf(
      RemoteUrlSecurityError,
    );
    await expect(assertSafeRemoteUrl('http://[::ffff:127.0.0.1]/file.txt')).rejects.toBeInstanceOf(
      RemoteUrlSecurityError,
    );

    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  it('rejects private DNS results and cloud metadata addresses', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '10.0.0.12', family: 4 }] as any);

    await expect(assertSafeRemoteUrl('https://files.example.test/a.pdf')).rejects.toBeInstanceOf(
      RemoteUrlSecurityError,
    );
    await expect(
      assertSafeRemoteUrl('http://169.254.169.254/latest/meta-data'),
    ).rejects.toBeInstanceOf(RemoteUrlSecurityError);
  });

  it('rejects redirects to protected addresses', async () => {
    mockedAxiosGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'http://127.0.0.1/internal' },
      data: Buffer.alloc(0),
    });

    await expect(fetchRemoteUrlBuffer('https://93.184.216.34/file.txt')).rejects.toBeInstanceOf(
      RemoteUrlSecurityError,
    );
    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
  });

  it('downloads a legal public URL with size and redirect limits', async () => {
    mockedAxiosGet.mockResolvedValueOnce({
      status: 200,
      headers: {
        'content-type': 'text/plain',
        'content-length': '2',
      },
      data: Buffer.from('ok'),
    });

    await expect(fetchRemoteUrlBuffer('https://93.184.216.34/file.txt')).resolves.toMatchObject({
      buffer: Buffer.from('ok'),
      mimeType: 'text/plain',
      finalUrl: 'https://93.184.216.34/file.txt',
    });
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://93.184.216.34/file.txt',
      expect.objectContaining({
        maxRedirects: 0,
        maxContentLength: 25 * 1024 * 1024,
        timeout: 30000,
      }),
    );
  });

  it('pins the actual request lookup to the DNS results that passed validation', async () => {
    const lookupSpy = jest
      .spyOn(dns, 'lookup')
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);

    mockedAxiosGet.mockImplementationOnce(async (_url: string, config: any) => {
      await new Promise<void>((resolve, reject) => {
        config.httpsAgent.options.lookup('safe.example.test', {}, (error, address, family) => {
          if (error) {
            reject(error);
            return;
          }
          expect(address).toBe('93.184.216.34');
          expect(family).toBe(4);
          resolve();
        });
      });

      return {
        status: 200,
        headers: {
          'content-type': 'text/plain',
          'content-length': '2',
        },
        data: Buffer.from('ok'),
      };
    });

    await expect(fetchRemoteUrlBuffer('https://safe.example.test/file.txt')).resolves.toMatchObject(
      {
        buffer: Buffer.from('ok'),
        finalUrl: 'https://safe.example.test/file.txt',
      },
    );

    expect(lookupSpy).toHaveBeenCalledTimes(1);
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://safe.example.test/file.txt',
      expect.objectContaining({
        httpsAgent: expect.any(Object),
        maxRedirects: 0,
      }),
    );
  });
});
