import { HttpStatus } from '@nestjs/common';
import { ChatGroupService } from './chatGroup.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChatGroupService group ownership', () => {
  const createService = () => {
    const chatGroupEntity = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const service = new ChatGroupService(chatGroupEntity as any, {} as any, {} as any);
    return { service, chatGroupEntity };
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('allows a user to read their own group without exposing pdf text content', async () => {
    const { service, chatGroupEntity } = createService();
    chatGroupEntity.findOne.mockResolvedValueOnce({
      id: 10,
      userId: 7,
      title: 'mine',
      pdfTextContent: 'private pdf text',
    });

    await expect(
      service.getOwnedGroupInfoFromId(10, { user: { id: 7, role: 'user' } } as any),
    ).resolves.toEqual({
      id: 10,
      userId: 7,
      title: 'mine',
    });

    expect(chatGroupEntity.findOne).toHaveBeenCalledWith({
      where: { id: 10, userId: 7, isDelete: false },
    });
  });

  it('rejects a user reading another user group', async () => {
    const { service, chatGroupEntity } = createService();
    chatGroupEntity.findOne.mockResolvedValueOnce(null);

    await expect(
      service.getOwnedGroupInfoFromId(10, { user: { id: 8, role: 'user' } } as any),
    ).rejects.toMatchObject({
      response: '非法操作、您无权访问该对话！',
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('uses visitorId as the owner boundary for visitor groups', async () => {
    const { service, chatGroupEntity } = createService();
    chatGroupEntity.findOne.mockResolvedValueOnce({
      id: 20,
      visitorId: 'visitor-a',
      title: 'visitor chat',
    });

    await expect(
      service.getOwnedGroupInfoFromId(20, { user: { id: 'visitor-a', role: 'visitor' } } as any),
    ).resolves.toMatchObject({
      id: 20,
      visitorId: 'visitor-a',
    });

    expect(chatGroupEntity.findOne).toHaveBeenCalledWith({
      where: { id: 20, visitorId: 'visitor-a', isDelete: false },
    });
  });

  it('updates group time only inside the authenticated owner boundary', async () => {
    const { service, chatGroupEntity } = createService();
    chatGroupEntity.update.mockResolvedValueOnce({ affected: 1 });

    await expect(
      service.updateOwnedTime(10, { user: { id: 7, role: 'user' } } as any),
    ).resolves.toBeUndefined();

    expect(chatGroupEntity.update).toHaveBeenCalledWith(
      { id: 10, userId: 7, isDelete: false },
      { updatedAt: expect.any(Date) },
    );
  });
});
