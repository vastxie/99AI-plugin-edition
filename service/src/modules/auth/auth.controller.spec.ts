import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { AuthController, authBodyValidationPipe } from './auth.controller';
import { UserLoginDto } from './dto/authLogin.dto';
import { RefreshTokenDto } from './dto/refreshToken.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { SendCodeDto } from './dto/sendCode.dto';
import { SendPhoneCodeDto } from './dto/sendPhoneCode.dto';
import { UpdatePassByOtherDto } from './dto/updatePassByOther.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';
import { VerifyIdentityDto } from './dto/verifyIdentity.dto';
import { VerifyPhoneIdentityDto } from './dto/verifyPhoneIdentity.dto';
import { VerifyResetCodeDto } from './dto/verifyResetCode.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

const strictBodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validateBody<T>(metatype: new () => T, body: Record<string, unknown>) {
  return strictBodyPipe.transform(body, { type: 'body', metatype });
}

function getBodyMetadata(methodName: string, parameterIndex: number) {
  const routeArgs = Reflect.getMetadata(ROUTE_ARGS_METADATA, AuthController, methodName) || {};
  return routeArgs[`${RouteParamtypes.BODY}:${parameterIndex}`];
}

describe('AuthController local body validation', () => {
  const bodyBindings: Array<[string, number, new () => unknown]> = [
    ['login', 0, UserLoginDto],
    ['refreshToken', 0, RefreshTokenDto],
    ['updatePassword', 1, UpdatePasswordDto],
    ['updatePassByOther', 1, UpdatePassByOtherDto],
    ['sendCode', 0, SendCodeDto],
    ['sendPhoneCode', 0, SendPhoneCodeDto],
    ['verifyIdentity', 1, VerifyIdentityDto],
    ['verifyPhoneIdentity', 1, VerifyPhoneIdentityDto],
    ['verifyResetCode', 0, VerifyResetCodeDto],
    ['resetPassword', 0, ResetPasswordDto],
  ];

  it('wires DTO metatypes and the local strict ValidationPipe on auth body params', () => {
    for (const [methodName, parameterIndex, dto] of bodyBindings) {
      const bodyMetadata = getBodyMetadata(methodName, parameterIndex);
      const paramTypes = Reflect.getMetadata(
        'design:paramtypes',
        AuthController.prototype,
        methodName,
      );

      expect(bodyMetadata).toBeDefined();
      expect(bodyMetadata.pipes).toContain(authBodyValidationPipe);
      expect(bodyMetadata.pipes[0]).toBeInstanceOf(ValidationPipe);
      expect(paramTypes[parameterIndex]).toBe(dto);
    }
  });

  it('rejects extra resetPassword fields with 400', async () => {
    await expect(
      validateBody(ResetPasswordDto, {
        contact: 'user@example.com',
        code: '123456',
        password: 'a-strong-reset-password',
        unexpected: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects extra login fields with 400', async () => {
    await expect(
      validateBody(UserLoginDto, {
        username: 'cooper',
        password: '123456',
        unexpected: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects refresh without refreshToken and with extra fields with 400', async () => {
    await expect(validateBody(RefreshTokenDto, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateBody(RefreshTokenDto, {
        refreshToken: 'refresh-token',
        unexpected: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects resetPassword passwords shorter than 12 characters with 400', async () => {
    await expect(
      validateBody(ResetPasswordDto, {
        contact: 'user@example.com',
        code: '123456',
        password: 'short-pass',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows sendPhoneCode with only phone in the body', async () => {
    await expect(validateBody(SendPhoneCodeDto, { phone: '19999999999' })).resolves.toMatchObject({
      phone: '19999999999',
    });
  });

  it('rejects verifyPhoneIdentity when code is missing with 400', async () => {
    await expect(
      validateBody(VerifyPhoneIdentityDto, {
        phone: '19999999999',
        username: 'cooper',
        password: 'a-strong-phone-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces updatePassword and updatePassByOther password DTO rules', async () => {
    await expect(validateBody(UpdatePasswordDto, { password: '123456' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      validateBody(UpdatePasswordDto, { oldPassword: '123456', password: 'short-pass' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(validateBody(UpdatePassByOtherDto, { password: 'short-pass' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(
      validateBody(UpdatePasswordDto, {
        oldPassword: 'old123',
        password: 'a-strong-new-password',
      }),
    ).resolves.toMatchObject({
      oldPassword: 'old123',
      password: 'a-strong-new-password',
    });
    await expect(
      validateBody(UpdatePassByOtherDto, { password: 'a-strong-new-password' }),
    ).resolves.toMatchObject({ password: 'a-strong-new-password' });
  });
});
