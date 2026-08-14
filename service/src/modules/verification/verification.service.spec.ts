import { HttpException } from '@nestjs/common';
import { VerificationUseStatusEnum } from '../../common/constants/status.constant';
import { VerificationService } from './verification.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('VerificationService verifyCode', () => {
  const createService = (verification: any, affected = 1) => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(verification),
      update: jest.fn().mockResolvedValue({ affected }),
    };
    const service = new VerificationService(repository as any, {} as any, {} as any);
    return { service, repository };
  };

  it('does not consume a code when the submitted value is wrong', async () => {
    const { service, repository } = createService({
      id: 4,
      code: 123456,
      used: VerificationUseStatusEnum.UNUSED,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyCode({ id: 4, code: 654321 }, 1 as any)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('atomically consumes a valid code exactly once', async () => {
    const verification = {
      id: 4,
      code: 123456,
      used: VerificationUseStatusEnum.UNUSED,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { service, repository } = createService(verification);

    await expect(service.verifyCode({ id: 4, code: 123456 }, 1 as any)).resolves.toMatchObject({
      used: VerificationUseStatusEnum.USED,
    });
    expect(repository.update).toHaveBeenCalledWith(
      { id: 4, used: VerificationUseStatusEnum.UNUSED },
      { used: VerificationUseStatusEnum.USED },
    );
  });

  it('rejects a race when another request already consumed the code', async () => {
    const { service } = createService(
      {
        id: 4,
        code: 123456,
        used: VerificationUseStatusEnum.UNUSED,
        expiresAt: new Date(Date.now() + 60_000),
      },
      0,
    );

    await expect(service.verifyCode({ id: 4, code: 123456 }, 1 as any)).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
