import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class TypeOrmQueryFailedFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    if ((exception as any).code === 'ER_DUP_ENTRY') {
      throw new BadRequestException('该记录已经存在，请勿重复添加！');
    } else {
      Logger.error(
        `数据库查询失败: path=${request.path || 'unknown'}, code=${(exception as any).code || 'unknown'}`,
        undefined,
        'TypeOrmQueryFailedFilter',
      );
    }

    response.status(500).json({
      statusCode: 500,
      timestamp: new Date().toISOString(),
      path: request.path,
      message: '数据库查询失败',
    });
  }
}
