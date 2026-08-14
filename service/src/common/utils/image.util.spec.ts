import axios from 'axios';
import { convertImageToBase64 } from './image.util';

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

describe('convertImageToBase64', () => {
  beforeEach(() => {
    mockedAxiosGet.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects private image URLs before issuing a request', async () => {
    await expect(convertImageToBase64('http://127.0.0.1/image.png')).rejects.toThrow(
      '无法转换图片',
    );
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  it('downloads public image URLs through the guarded remote fetch path', async () => {
    mockedAxiosGet.mockResolvedValueOnce({
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '3',
      },
      data: Buffer.from('abc'),
    });

    await expect(convertImageToBase64('https://93.184.216.34/image.png')).resolves.toBe(
      'data:image/png;base64,YWJj',
    );
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://93.184.216.34/image.png',
      expect.objectContaining({
        httpsAgent: expect.any(Object),
        maxRedirects: 0,
        maxContentLength: 10 * 1024 * 1024,
      }),
    );
  });
});
