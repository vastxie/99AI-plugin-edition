import { BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { CreateShareDto } from './dto/createShare.dto';
import { ShareService } from './share.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ShareService.createShareFromGroup', () => {
  const createService = () => {
    const shareRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const chatLogRepository = {
      find: jest.fn(),
    };
    const chatGroupRepository = {
      findOne: jest.fn(),
    };
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue({ siteUrl: 'https://chat.example' }),
    };

    const service = new ShareService(
      shareRepository as any,
      chatLogRepository as any,
      chatGroupRepository as any,
      globalConfigService as any,
    );

    return { service, shareRepository, chatLogRepository, chatGroupRepository };
  };

  it('rejects sharing a group that does not belong to the current user', async () => {
    const { service, chatLogRepository, chatGroupRepository } = createService();
    chatGroupRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.createShareFromGroup(20, { id: 1, role: 'user' })).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
    expect(chatGroupRepository.findOne).toHaveBeenCalledWith({
      where: { id: 20, userId: 1, isDelete: false },
    });
    expect(chatLogRepository.find).not.toHaveBeenCalled();
  });

  it('creates a share for a group owned by the current user', async () => {
    const { service, shareRepository, chatLogRepository, chatGroupRepository } = createService();
    chatGroupRepository.findOne.mockResolvedValueOnce({ id: 11, userId: 1, isDelete: false });
    chatLogRepository.find.mockResolvedValueOnce([
      { id: 101, groupId: 11, userId: 1 },
      { id: 102, groupId: 11, userId: 1 },
    ]);

    await expect(service.createShareFromGroup(11, { id: 1, role: 'user' })).resolves.toMatchObject({
      shareUrl: expect.stringContaining('/share/'),
    });

    expect(chatLogRepository.find).toHaveBeenCalledWith({
      where: { groupId: 11, userId: 1, isDelete: false },
      order: { createdAt: 'ASC' },
    });
    expect(shareRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 11,
        messageIds: [101, 102],
        userId: 1,
      }),
    );
  });

  it('uses visitorId ownership for visitor shares', async () => {
    const { service, shareRepository, chatLogRepository, chatGroupRepository } = createService();
    chatGroupRepository.findOne.mockResolvedValueOnce({
      id: 12,
      visitorId: '2000000001',
      isDelete: false,
    });
    chatLogRepository.find.mockResolvedValueOnce([
      { id: 201, groupId: 12, visitorId: '2000000001' },
    ]);

    await service.createShareFromGroup(12, { id: 2000000001, role: 'visitor' });

    expect(chatGroupRepository.findOne).toHaveBeenCalledWith({
      where: { id: 12, visitorId: '2000000001', isDelete: false },
    });
    expect(chatLogRepository.find).toHaveBeenCalledWith({
      where: { groupId: 12, visitorId: '2000000001', isDelete: false },
      order: { createdAt: 'ASC' },
    });
    expect(shareRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 12,
        messageIds: [201],
        userId: null,
      }),
    );
  });

  it('does not include empty assistant failures in a new share', async () => {
    const { service, shareRepository, chatLogRepository, chatGroupRepository } = createService();
    chatGroupRepository.findOne.mockResolvedValueOnce({ id: 11, userId: 1, isDelete: false });
    chatLogRepository.find.mockResolvedValueOnce([
      { id: 101, groupId: 11, userId: 1, role: 'user', content: '问题' },
      { id: 102, groupId: 11, userId: 1, role: 'assistant', content: null, status: 5 },
    ]);

    await service.createShareFromGroup(11, { id: 1, role: 'user' });

    expect(shareRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: [101] }),
    );
  });

  it('rejects invalid create share body at the DTO validation layer', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          groupId: 'not-a-number',
          unexpected: true,
        },
        { type: 'body', metatype: CreateShareDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects the retired arbitrary JSON share payload', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          shareData: {
            messages: [
              {
                role: 'assistant',
                pluginParam: 'mermaid',
                content: '```mermaid\nflowchart TD\nA-->B\n```',
              },
            ],
          },
        },
        { type: 'body', metatype: CreateShareDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('projects group shares onto an explicit public field allowlist', async () => {
    const { service, shareRepository, chatLogRepository, chatGroupRepository } = createService();
    const createdAt = new Date('2026-08-12T00:00:00.000Z');
    const updatedAt = new Date('2026-08-12T01:00:00.000Z');

    shareRepository.findOne.mockResolvedValueOnce({
      shareCode: 'AbCd1234',
      groupId: 11,
      messageIds: [101],
    });
    chatGroupRepository.findOne.mockResolvedValueOnce({
      id: 11,
      userId: 1,
      visitorId: 'visitor-secret',
      title: '公开标题',
      createdAt,
      updatedAt,
      config: '{"private":true}',
      params: 'private-params',
      fileUrl: '/file/private.pdf',
      pdfTextContent: 'private document text',
    });
    chatLogRepository.find.mockResolvedValueOnce([
      {
        id: 101,
        groupId: 11,
        userId: 1,
        visitorId: 'visitor-secret',
        createdAt,
        content: '允许公开的回复',
        model: 'model-id',
        modelName: 'Model',
        role: 'assistant',
        imageUrl: '/file/image.png',
        videoUrl: null,
        audioUrl: null,
        fileUrl: '/file/attachment.pdf',
        ttsUrl: null,
        type: 1,
        curIp: '203.0.113.10',
        reasoning_content: 'private reasoning',
        agent_content: '{"private":true}',
        pluginParam: 'mermaid',
        totalTokens: 123,
        taskId: 'private-task',
        taskData: '{"secret":true}',
      },
    ]);

    await expect(service.getShareByCode('AbCd1234')).resolves.toEqual({
      type: 'group',
      groupInfo: {
        title: '公开标题',
        createdAt,
        updatedAt,
      },
      messages: [
        {
          createdAt,
          content: '允许公开的回复',
          modelName: 'Model',
          role: 'assistant',
          imageUrl: '/file/image.png',
          videoUrl: null,
          audioUrl: null,
          fileUrl: '/file/attachment.pdf',
          ttsUrl: null,
          type: 1,
          renderType: 'mermaid',
        },
      ],
      shareCode: 'AbCd1234',
    });
  });

  it('does not serve legacy arbitrary JSON shares', async () => {
    const { service, shareRepository } = createService();
    shareRepository.findOne.mockResolvedValueOnce({
      shareCode: 'Legacy01',
      shareData: {
        messages: [{ role: 'assistant', pluginParam: 'mermaid', content: 'unsafe' }],
      },
    });

    await expect(service.getShareByCode('Legacy01')).resolves.toBeNull();
  });

  it('continues serving sandboxed HTML shares', async () => {
    const { service, shareRepository } = createService();
    shareRepository.findOne.mockResolvedValueOnce({
      shareCode: 'Html0001',
      htmlContent: '<h1>公开内容</h1>',
      shareData: null,
    });

    await expect(service.getShareByCode('Html0001')).resolves.toEqual({
      type: 'html',
      htmlContent: '<h1>公开内容</h1>',
      shareCode: 'Html0001',
    });
  });
});
