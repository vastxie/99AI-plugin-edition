import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { XMLParser } from 'fast-xml-parser';
import * as getRawBody from 'raw-body';

@Injectable()
export class FastXmlMiddleware implements NestMiddleware {
  private xmlParser: XMLParser;

  constructor() {
    // 配置XML解析器
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseAttributeValue: true,
      trimValues: true,
      processEntities: false, // 显式禁用实体解析，防止 XXE 攻击
      isArray: name => {
        // 使所有元素都成为数组，与express-xml-bodyparser行为一致
        return true;
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    // 只处理XML内容类型的请求
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/xml') && !contentType.includes('text/xml')) {
      return next();
    }

    Logger.debug(`收到 XML 请求 - Content-Type: ${contentType}`, 'FastXmlMiddleware');

    // 使用Promise处理异步操作
    getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: true,
    })
      .then(rawBody => {
        try {
          // 解析XML
          const parsedXml = this.xmlParser.parse(rawBody);

          // 修正: 直接将解析后的结构赋值给req.body
          // 检查是否有xml属性，如果有则直接使用解析后的xml结构，否则保持整个结构
          req.body = parsedXml.xml ? { xml: parsedXml.xml } : parsedXml;

          Logger.debug('XML 请求体解析完成', 'FastXmlMiddleware');

          next();
        } catch (parseError) {
          Logger.error(`XML解析错误: ${parseError.message}`, 'FastXmlMiddleware');
          next(parseError);
        }
      })
      .catch(error => {
        Logger.error(`获取请求体错误: ${error.message}`, 'FastXmlMiddleware');
        next(error);
      });
  }
}
