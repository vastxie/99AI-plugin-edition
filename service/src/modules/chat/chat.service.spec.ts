import { HttpException } from '@nestjs/common';
import { ChatService } from './chat.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChatService group history ownership', () => {
  const createService = () =>
    new ChatService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('passes the authenticated owner boundary into chat history queries', async () => {
    const service = createService();
    const chatLogService = {
      chatHistory: jest.fn().mockResolvedValueOnce([
        {
          id: 1,
          role: 'user',
          content: 'hello',
          createdAt: new Date('2026-05-17T00:00:00.000Z'),
        },
      ]),
    };

    await service.buildMessageFromParentMessageId(
      {
        groupId: 10,
        maxRounds: 2,
        historyOwner: { userId: 7 },
        skipTokenCheck: true,
      },
      chatLogService,
    );

    expect(chatLogService.chatHistory).toHaveBeenCalledWith(10, 2, { userId: 7 });
  });

  it('rejects invalid group ids before history lookup', () => {
    const service = createService() as any;

    expect(() => service.normalizeGroupId('not-a-number')).toThrow(HttpException);
    expect(() => service.normalizeGroupId(-1)).toThrow(HttpException);
  });
});
