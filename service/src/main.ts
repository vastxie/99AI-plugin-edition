import { TypeOrmQueryFailedFilter } from '@/common/filters/typeOrmQueryFailed.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { CustomLoggerService } from '@/common/logger/custom-logger.service';
import { FastXmlMiddleware } from '@/common/middleware/fast-xml-middleware';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import { randomBytes } from 'crypto';
import * as Dotenv from 'dotenv';
import * as express from 'express';
import helmet from 'helmet';
import Redis from 'ioredis';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/allExceptions.filter';
import { ChatLogService } from './modules/chatLog/chatLog.service';

Dotenv.config({ path: '.env' });

async function ensureJwtSecret(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
  });

  try {
    const existingSecret = await redis.get('JWT_SECRET');
    if (!existingSecret) {
      await redis.set('JWT_SECRET', randomBytes(64).toString('base64url'));
      Logger.log('已生成并保存 JWT_SECRET', 'Bootstrap');
    }
  } finally {
    redis.disconnect();
  }
}

async function bootstrap(): Promise<void> {
  await ensureJwtSecret();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.useLogger(app.get(CustomLoggerService));
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    helmet({
      // 富文本预览和支付回调仍依赖内联内容；CSP 应由部署者结合实际域名在反代层配置。
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const customLogger = app.get(CustomLoggerService);
  const originalLog = customLogger.log.bind(customLogger);
  customLogger.log = function (message: string, context?: string) {
    if (
      context &&
      [
        'RoutesResolver',
        'RouterExplorer',
        'Router',
        'InstanceLoader',
        'NestFactory',
        'RedisCacheModule',
        'NestApplication',
      ].includes(context)
    ) {
      return;
    }
    originalLog(message, context);
  };

  app.use('/api/pay/stripe/webhook', express.raw({ type: 'application/json', limit: '2mb' }));
  app.use(
    express.json({
      limit: process.env.REQUEST_BODY_LIMIT || '50mb',
      verify: (req: any, _res, buf) => {
        if (req.originalUrl?.split('?')[0] === '/api/pay/notify') {
          req.rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use(
    express.urlencoded({
      limit: process.env.REQUEST_BODY_LIMIT || '50mb',
      extended: true,
      parameterLimit: 1000,
    }),
  );

  const xmlMiddleware = new FastXmlMiddleware();
  app.use(xmlMiddleware.use.bind(xmlMiddleware));
  app.use(
    compression({
      filter: (req, res) => {
        if (req.path.includes('/api/chatgpt/chat-process')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  const configuredOrigins = process.env.CORS_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !configuredOrigins?.length) {
    throw new Error('生产环境必须显式设置 CORS_ORIGINS');
  }
  app.enableCors({
    origin: configuredOrigins?.length ? configuredOrigins : '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // exclude 的 path:'*' 只匹配 SpaController 的 @Get('*')，不会去掉其它 GET 的 /api 前缀。
  app.setGlobalPrefix('/api', {
    exclude: [{ path: '*', method: RequestMethod.GET }],
  });
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new TypeOrmQueryFailedFilter());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.getHttpAdapter().getInstance().set('views', 'templates/pages');
  app.getHttpAdapter().getInstance().set('view engine', 'hbs');

  const port = Number(process.env.PORT || 9520);
  const server = await app.listen(port);

  try {
    await app.get(ChatLogService).cleanupPendingTasks();
  } catch (error) {
    Logger.error(`启动时清理任务失败: ${error.message}`, error?.stack, 'Bootstrap');
  }

  const requestTimeout = 10 * 60 * 1000;
  server.timeout = requestTimeout;
  server.requestTimeout = requestTimeout;
  server.headersTimeout = 60 * 1000;
  server.keepAliveTimeout = 5 * 1000;

  if (process.env.ISDEV === 'true') {
    const config = new DocumentBuilder()
      .setTitle('99AI Plugin Edition API')
      .setDescription('99AI Plugin Edition 服务 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);

    const responseSchema = {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        data: { type: 'object' },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: '请求成功' },
      },
    };

    Object.values(document.paths).forEach(path => {
      Object.values(path).forEach(method => {
        method.responses = {
          ...method.responses,
          '200': {
            description: '成功响应',
            content: { 'application/json': { schema: responseSchema } },
          },
        };
      });
    });

    SwaggerModule.setup('api-docs', app, document);
    Logger.debug(`Swagger API 文档已启用: http://localhost:${port}/api-docs`, 'Bootstrap');
  }

  Logger.log(`服务已启动: http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch(error => {
  Logger.error(`服务启动失败: ${error.message}`, error?.stack, 'Bootstrap');
  process.exitCode = 1;
});
