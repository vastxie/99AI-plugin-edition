import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GetQrCodeDto } from '../../official/dto/getQrCode.dto';
import { ChatProcessDto } from './chatProcess.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

const whitelistPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
});

function validateBody<T>(metatype: new () => T, body: Record<string, unknown>) {
  return whitelistPipe.transform(body, { type: 'body', metatype });
}

describe('ChatProcessDto', () => {
  it('keeps the chat-process fields used by the frontend and service when whitelist is enabled', async () => {
    const result: any = await validateBody(ChatProcessDto, {
      prompt: '生成一份PPT',
      model: 'gpt-4.1',
      modelName: 'GPT-4.1',
      modelType: 1,
      usingPluginId: 12,
      fileUrl: 'https://example.com/file.pdf',
      imageUrl: 'https://example.com/image.png',
      videoUrl: 'https://example.com/video.mp4',
      extraParam: { size: '1024x1024' },
      drawId: 'draw-1',
      customId: 'custom-1',
      taskId: 'task-1',
      action: 'generate_ppt',
      pptOutline: { title: 'outline' },
      pptMode: 'creative',
      selectedTheme: { id: 'theme-1' },
      appId: 3,
      options: {
        groupId: 9,
        usingTool: true,
        usingDeepThinking: false,
        useKnowledgeBase: true,
        fileParsing: '',
      },
      editorContent: {
        markdown: '# 标题',
        version: 1,
      },
      unexpected: 'strip-me',
    });

    expect(result).toMatchObject({
      prompt: '生成一份PPT',
      model: 'gpt-4.1',
      modelName: 'GPT-4.1',
      modelType: 1,
      usingPluginId: 12,
      fileUrl: 'https://example.com/file.pdf',
      imageUrl: 'https://example.com/image.png',
      videoUrl: 'https://example.com/video.mp4',
      extraParam: { size: '1024x1024' },
      drawId: 'draw-1',
      customId: 'custom-1',
      taskId: 'task-1',
      action: 'generate_ppt',
      pptOutline: { title: 'outline' },
      pptMode: 'creative',
      selectedTheme: { id: 'theme-1' },
      appId: 3,
      options: {
        groupId: 9,
        usingTool: true,
        usingDeepThinking: false,
        useKnowledgeBase: true,
        fileParsing: '',
      },
      editorContent: {
        markdown: '# 标题',
        version: 1,
      },
    });
    expect(result.unexpected).toBeUndefined();
  });
});

describe('GetQrCodeDto', () => {
  it('rejects sceneStr values longer than the documented 64 character limit', async () => {
    await expect(
      validateBody(GetQrCodeDto, {
        sceneStr: 'x'.repeat(65),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
