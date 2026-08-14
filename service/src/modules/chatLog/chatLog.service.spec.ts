import axios from 'axios';
import { ChatLogService } from './chatLog.service';

const mockSharpMetadata = jest.fn();
const mockSharp = jest.fn(() => ({
  metadata: mockSharpMetadata,
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('sharp', () => ({
  __esModule: true,
  default: mockSharp,
}));

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const mockedAxiosGet = axios.get as any;

describe('ChatLogService.getMediaDimensions', () => {
  const createService = () => new ChatLogService({} as any, {} as any, {} as any, {} as any);

  beforeEach(() => {
    mockedAxiosGet.mockReset();
    mockSharp.mockClear();
    mockSharpMetadata.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not request private media URLs from chat history', async () => {
    const service = createService();

    await expect(
      (service as any).getMediaDimensions('http://169.254.169.254/latest'),
    ).resolves.toEqual({});

    expect(mockedAxiosGet).not.toHaveBeenCalled();
    expect(mockSharp).not.toHaveBeenCalled();
  });

  it('uses guarded remote fetch for public media dimensions', async () => {
    const service = createService();
    mockedAxiosGet.mockResolvedValueOnce({
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '8',
      },
      data: Buffer.from('png-data'),
    });
    mockSharpMetadata.mockResolvedValueOnce({ width: 800, height: 600 });

    await expect(
      (service as any).getMediaDimensions('https://93.184.216.34/image.png'),
    ).resolves.toEqual({
      width: 800,
      height: 600,
      aspectRatio: '4:3',
    });

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://93.184.216.34/image.png',
      expect.objectContaining({
        httpsAgent: expect.any(Object),
        maxRedirects: 0,
        maxContentLength: 1024 * 500,
      }),
    );
    expect(mockSharp).toHaveBeenCalledWith(Buffer.from('png-data'));
  });
});

describe('ChatLogService.chatHistory', () => {
  const createService = () => {
    const chatLogEntity = {
      find: jest.fn(),
    };
    const service = new ChatLogService(chatLogEntity as any, {} as any, {} as any, {} as any);
    return { service, chatLogEntity };
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('adds userId to group history queries when an authenticated user owner is provided', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.find.mockResolvedValueOnce([]);

    await service.chatHistory(10, 3, { userId: 7 });

    expect(chatLogEntity.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDelete: false, groupId: 10, userId: 7 },
        take: 6,
      }),
    );
  });

  it('rejects history queries without an explicit owner boundary', async () => {
    const { service, chatLogEntity } = createService();

    await expect((service as any).chatHistory(10, 3)).rejects.toMatchObject({
      response: '缺少聊天历史归属边界，拒绝查询！',
      status: 403,
    });

    expect(chatLogEntity.find).not.toHaveBeenCalled();
  });

  it('adds visitorId to group history queries for visitor owners', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.find.mockResolvedValueOnce([]);

    await service.chatHistory(20, 2, { visitorId: 'visitor-a' });

    expect(chatLogEntity.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDelete: false, groupId: 20, visitorId: 'visitor-a' },
        take: 4,
      }),
    );
  });

  it('passes the owner boundary into formatted FC history queries', async () => {
    const { service } = createService();
    const chatHistorySpy = jest.spyOn(service, 'chatHistory').mockResolvedValueOnce([]);

    await service.getFormattedHistoryForFC(30, 5, { userId: 7 });

    expect(chatHistorySpy).toHaveBeenCalledWith(30, 10, { userId: 7 });
  });
});

describe('ChatLogService.querySingleChat', () => {
  const createService = () => {
    const chatLogEntity = {
      findOne: jest.fn(),
    };
    const service = new ChatLogService(chatLogEntity as any, {} as any, {} as any, {} as any);
    return { service, chatLogEntity };
  };

  const makeReq = (id: number, role = 'user') =>
    ({ user: { id, role } }) as any;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns message content when chat belongs to the requesting user', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce({
      id: 42,
      role: 'assistant',
      content: 'hello',
      userId: 7,
      visitorId: null,
      type: 1,
      status: 3,
    });

    const result = await service.querySingleChat(makeReq(7), { chatId: 42 });

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({
      where: { id: 42, userId: 7 },
    });
    expect(result.chatId).toBe(42);
    expect(result.content).toBe('hello');
  });

  it('rejects query when chat belongs to a different user', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce(null);

    const result = await service.querySingleChat(makeReq(99), { chatId: 42 });

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({
      where: { id: 42, userId: 99 },
    });
    expect(result).toBe('未找到该消息');
  });

  it('uses visitorId for visitor role users', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce({
      id: 55,
      role: 'assistant',
      content: 'visitor-msg',
      userId: null,
      visitorId: 'fp-123',
      type: 1,
      status: 3,
    });

    const result = await service.querySingleChat(makeReq(123, 'visitor'), { chatId: 55 });

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({
      where: { id: 55, visitorId: '123' },
    });
    expect(result.chatId).toBe(55);
  });
});

describe('ChatLogService owned updates', () => {
  const createService = () => {
    const chatLogEntity = { findOne: jest.fn(), update: jest.fn() };
    const service = new ChatLogService(chatLogEntity as any, {} as any, {} as any, {} as any);
    return { service, chatLogEntity };
  };

  it('loads and updates a registered user chat with the owner in both queries', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce({ id: 9, userId: 7 });
    chatLogEntity.update.mockResolvedValueOnce({ affected: 1 });

    await expect(service.requireOwnedChatLog(9, { userId: 7 })).resolves.toMatchObject({ id: 9 });
    await expect(
      service.updateOwnedChatLog(9, { userId: 7 }, { ttsUrl: '/audio/a.mp3' }),
    ).resolves.toBeUndefined();

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({ where: { id: 9, userId: 7 } });
    expect(chatLogEntity.update).toHaveBeenCalledWith(
      { id: 9, userId: 7 },
      { ttsUrl: '/audio/a.mp3' },
    );
  });

  it('rejects records that do not belong to the visitor', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce(null);

    await expect(service.requireOwnedChatLog(9, { visitorId: 'visitor:a' })).rejects.toMatchObject({
      status: 404,
    });
    expect(chatLogEntity.update).not.toHaveBeenCalled();
  });

  it('rejects a raced owner change during the final update', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.update.mockResolvedValueOnce({ affected: 0 });

    await expect(
      service.updateOwnedChatLog(9, { userId: 7 }, { ttsUrl: '/audio/a.mp3' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('ChatLogService.deleteChatLog', () => {
  const createService = () => {
    const chatLogEntity = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const service = new ChatLogService(chatLogEntity as any, {} as any, {} as any, {} as any);
    return { service, chatLogEntity };
  };

  const makeReq = (id: number, role = 'user') =>
    ({ user: { id, role } }) as any;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes own chat log for registered user', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce({ id: 10, userId: 5 });
    chatLogEntity.update.mockResolvedValueOnce({ affected: 1 });

    const result = await service.deleteChatLog(makeReq(5), { id: 10 });

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({
      where: { id: 10, userId: 5 },
    });
    expect(result).toBe('删除对话记录成功！');
  });

  it('deletes own chat log for visitor using visitorId', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce({ id: 20, visitorId: '99' });
    chatLogEntity.update.mockResolvedValueOnce({ affected: 1 });

    const result = await service.deleteChatLog(makeReq(99, 'visitor'), { id: 20 });

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({
      where: { id: 20, visitorId: '99' },
    });
    expect(result).toBe('删除对话记录成功！');
  });

  it('rejects deletion when chat belongs to another user', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce(null);

    await expect(service.deleteChatLog(makeReq(5), { id: 10 })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('ChatLogService.delByGroupId', () => {
  const createService = () => {
    const chatLogEntity = { update: jest.fn() };
    const chatGroupEntity = { findOne: jest.fn() };
    const service = new ChatLogService(
      chatLogEntity as any,
      {} as any,
      chatGroupEntity as any,
      {} as any,
    );
    return { service, chatLogEntity, chatGroupEntity };
  };

  const makeReq = (id: number, role = 'user') =>
    ({ user: { id, role } }) as any;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes group for registered user', async () => {
    const { service, chatLogEntity, chatGroupEntity } = createService();
    chatGroupEntity.findOne.mockResolvedValueOnce({ id: 1, userId: 5 });
    chatLogEntity.update.mockResolvedValueOnce({ affected: 2 });

    const result = await service.delByGroupId(makeReq(5), { groupId: 1 });

    expect(chatGroupEntity.findOne).toHaveBeenCalledWith({
      where: { id: 1, userId: 5 },
    });
    expect(result).toBe('删除对话记录成功！');
  });

  it('deletes group for visitor using visitorId', async () => {
    const { service, chatLogEntity, chatGroupEntity } = createService();
    chatGroupEntity.findOne.mockResolvedValueOnce({ id: 2, visitorId: '88' });
    chatLogEntity.update.mockResolvedValueOnce({ affected: 1 });

    const result = await service.delByGroupId(makeReq(88, 'visitor'), { groupId: 2 });

    expect(chatGroupEntity.findOne).toHaveBeenCalledWith({
      where: { id: 2, visitorId: '88' },
    });
    expect(result).toBe('删除对话记录成功！');
  });
});

describe('ChatLogService.deleteChatsAfterId', () => {
  const createService = () => {
    const chatLogEntity = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const service = new ChatLogService(chatLogEntity as any, {} as any, {} as any, {} as any);
    return { service, chatLogEntity };
  };

  const makeReq = (id: number, role = 'user') =>
    ({ user: { id, role } }) as any;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes chats after id for registered user', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce({ id: 100, userId: 5, groupId: 3 });
    chatLogEntity.update.mockResolvedValueOnce({ affected: 3 });

    const result = await service.deleteChatsAfterId(makeReq(5), { id: 100 });

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({
      where: { id: 100, userId: 5 },
    });
    expect(result).toBe('删除对话记录成功！');
  });

  it('deletes chats after id for visitor using visitorId', async () => {
    const { service, chatLogEntity } = createService();
    chatLogEntity.findOne.mockResolvedValueOnce({ id: 200, visitorId: '77', groupId: 4 });
    chatLogEntity.update.mockResolvedValueOnce({ affected: 1 });

    const result = await service.deleteChatsAfterId(makeReq(77, 'visitor'), { id: 200 });

    expect(chatLogEntity.findOne).toHaveBeenCalledWith({
      where: { id: 200, visitorId: '77' },
    });
    expect(result).toBe('删除对话记录成功！');
  });
});
