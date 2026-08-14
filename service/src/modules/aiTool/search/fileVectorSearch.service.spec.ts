import * as mammoth from 'mammoth';
import { FileVectorSearchService } from './fileVectorSearch.service';

jest.mock('mammoth', () => ({
  __esModule: true,
  convertToHtml: jest.fn(),
}));

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('FileVectorSearchService.extractWordText', () => {
  const createService = () => new FileVectorSearchService({} as any, {} as any);

  beforeEach(() => {
    (mammoth.convertToHtml as any).mockReset();
  });

  it('converts Word HTML through Turndown without constructor import errors', async () => {
    const service = createService();
    const buffer = Buffer.from('fake-docx-buffer');
    jest.spyOn(service as any, 'downloadRemoteBuffer').mockResolvedValueOnce(buffer);
    (mammoth.convertToHtml as any).mockResolvedValueOnce({
      value: '<h1>标题</h1><p>第一段内容</p><ul><li>项目一</li></ul>',
    });

    const text = await (service as any).extractWordText('https://example.test/report.docx');

    expect(text).toContain('标题');
    expect(text).toContain('第一段内容');
    expect(text).toContain('项目一');
    expect(mammoth.convertToHtml).toHaveBeenCalledWith({ buffer });
  });
});
