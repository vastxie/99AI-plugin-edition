import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeMessageKey } from '../constants/errorCode.constant';

/**
 * 业务异常类
 * 用于返回带有错误码的异常
 */
export class BusinessException extends HttpException {
  public readonly errorCode: ErrorCode;
  public readonly messageKey: string;
  public readonly data?: any;

  constructor(errorCode: ErrorCode, httpStatus: HttpStatus = HttpStatus.BAD_REQUEST, data?: any) {
    const messageKey = ErrorCodeMessageKey[errorCode];

    super(
      {
        code: errorCode,
        messageKey,
        data,
        success: false,
      },
      httpStatus,
    );

    this.errorCode = errorCode;
    this.messageKey = messageKey;
    this.data = data;
  }

  /**
   * 创建一个带有额外数据的业务异常
   */
  static withData(
    errorCode: ErrorCode,
    data: any,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ): BusinessException {
    return new BusinessException(errorCode, httpStatus, data);
  }

  /**
   * 创建一个未授权异常
   */
  static unauthorized(errorCode: ErrorCode = ErrorCode.LOGIN_REQUIRED): BusinessException {
    return new BusinessException(errorCode, HttpStatus.UNAUTHORIZED);
  }

  /**
   * 创建一个禁止访问异常
   */
  static forbidden(errorCode: ErrorCode = ErrorCode.PERMISSION_DENIED): BusinessException {
    return new BusinessException(errorCode, HttpStatus.FORBIDDEN);
  }

  /**
   * 创建一个未找到资源异常
   */
  static notFound(errorCode: ErrorCode = ErrorCode.RESOURCE_NOT_FOUND): BusinessException {
    return new BusinessException(errorCode, HttpStatus.NOT_FOUND);
  }

  /**
   * 创建一个请求过于频繁异常
   */
  static tooManyRequests(errorCode: ErrorCode = ErrorCode.RATE_LIMIT_EXCEEDED): BusinessException {
    return new BusinessException(errorCode, HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * 创建一个服务器内部错误异常
   */
  static internalError(errorCode: ErrorCode = ErrorCode.SYSTEM_ERROR): BusinessException {
    return new BusinessException(errorCode, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
