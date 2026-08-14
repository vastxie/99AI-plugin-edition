import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { formatUrl } from '@/common/utils';
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateMenuDto } from './dto/createMenu.dto';
import { GetQrCodeDto } from './dto/getQrCode.dto';
import { OfficialService } from './official.service';

@ApiTags('official')
@Controller('official')
export class OfficialController {
  constructor(private readonly officialService: OfficialService) {}

  @Get('notify')
  @ApiOperation({ summary: '公众号通知接口GET' })
  async notify(@Query() query) {
    Logger.debug('收到公众号 GET 验证请求', 'OfficialController');
    const result = await this.officialService.verify(query.signature, query.nonce, query.timestamp);
    return result ? query.echostr : '';
  }

  @Post('notify')
  @ApiOperation({ summary: '公众号通知接口POST' })
  async notifyPost(@Query() query, @Body() xmlData, @Res() res) {
    Logger.debug('收到公众号 POST 通知', 'OfficialController');

    /* 验签：校验请求是否来自微信服务器 */
    const { signature, nonce, timestamp } = query || {};
    const isValid = await this.officialService.verify(signature, nonce, timestamp);
    if (!isValid) {
      Logger.warn('POST通知验签失败，拒绝处理', 'OfficialController');
      return res.status(200).send('');
    }

    if (!xmlData || !xmlData.xml) {
      Logger.warn('xmlData结构异常，缺少xml字段', 'OfficialController');
      return res.status(200).send('');
    }

    let xmlObject = xmlData.xml;

    // 处理可能的嵌套情况，确保xmlObject是一个对象而不是数组
    if (Array.isArray(xmlObject)) {
      Logger.debug('XML解析为数组，取第一个元素', 'OfficialController');
      xmlObject = xmlObject[0];
    } else if (xmlObject.xml && Array.isArray(xmlObject.xml)) {
      Logger.debug('XML存在嵌套结构，使用内部xml数组的第一个元素', 'OfficialController');
      xmlObject = xmlObject.xml[0];
    }

    // 辅助函数，安全地访问XML字段
    const getXmlValue = field => {
      if (!xmlObject[field]) return null;
      return Array.isArray(xmlObject[field]) ? xmlObject[field][0] : xmlObject[field];
    };

    const msgType = getXmlValue('MsgType') || getXmlValue('msgtype');
    const event = getXmlValue('Event') || getXmlValue('event');
    const eventKey = getXmlValue('EventKey') || getXmlValue('eventkey');
    const fromUserName = getXmlValue('FromUserName') || getXmlValue('fromusername');
    const content = getXmlValue('Content') || getXmlValue('content');

    Logger.debug(
      `公众号消息类型: ${msgType || 'unknown'}, 事件: ${event || 'none'}`,
      'OfficialController',
    );

    /* 扫码 */
    if (msgType === 'event') {
      Logger.log(`接收到事件类型消息: ${event}`, 'OfficialController');

      // 处理 VIEW 事件（跳转网页）
      if (event === 'VIEW') {
        return res.status(200).send('');
      }

      // 处理 CLICK 事件（菜单点击）
      if (event === 'CLICK') {
        Logger.log('接收到公众号菜单点击事件', 'OfficialController');

        // 根据 EventKey 获取回复内容
        const menuContent = await this.officialService.getMenuContentByKey(eventKey);

        if (menuContent) {
          // 返回配置的回复内容
          const xmlMsg = await this.officialService.genXmlMsg(xmlObject, menuContent);
          Logger.log('已回复公众号菜单内容', 'OfficialController');
          return res.status(200).send(xmlMsg);
        } else {
          // 如果没有配置回复内容，返回空
          Logger.warn('公众号菜单未配置回复内容', 'OfficialController');
          return res.status(200).send('');
        }
      }

      /* 扫码 */
      if (event === 'SCAN') {
        Logger.log('接收到公众号扫码事件', 'OfficialController');
        const sceneStr = eventKey;
        /* 绑定微信以/区分 */
        if (sceneStr.includes('/')) {
          const bindResult = await this.officialService.scanBindWx(fromUserName, sceneStr);
          const xmlMsg = bindResult.status
            ? await this.officialService.genXmlMsg(xmlObject, bindResult.prompt)
            : await this.officialService.genXmlMsgByConfig(
                xmlObject,
                'officialBindAccountFailText',
              );
          return res.status(200).send(xmlMsg);
        }
        /* 旧账号迁移以#区分 */
        if (sceneStr.includes('#')) {
          const prompt = await this.officialService.scanOldWechat(fromUserName, sceneStr);
          const xmlMsg = await this.officialService.genXmlMsg(xmlObject, prompt);
          return res.status(200).send(xmlMsg);
        }
        const prompt = await this.officialService.scan(fromUserName, sceneStr);
        const xmlMsg = await this.officialService.genXmlMsg(xmlObject, prompt);
        return res.status(200).send(xmlMsg);
      }

      /* 订阅 */
      if (event === 'subscribe') {
        Logger.log('接收到公众号订阅事件', 'OfficialController');
        const sceneStr = eventKey ? eventKey.split('qrscene_')[1] : null;

        /* 没有场景str则是单纯关注了直接返回 */
        if (!sceneStr) {
          const xmlMsg = await this.officialService.genXmlMsgByConfig(
            xmlObject,
            'officialSubscribeText',
          );
          return res.status(200).send(xmlMsg);
        }
        /* 绑定微信以/区分 */
        if (sceneStr.includes('/')) {
          const bindResult = await this.officialService.scanBindWx(fromUserName, sceneStr);
          const xmlMsg = bindResult.status
            ? await this.officialService.genXmlMsg(xmlObject, bindResult.prompt)
            : await this.officialService.genXmlMsgByConfig(
                xmlObject,
                'officialBindAccountFailText',
              );
          return res.status(200).send(xmlMsg);
        }
        /* 旧账号迁移以#区分 */
        if (sceneStr.includes('#')) {
          Logger.log('接收到旧账号迁移事件', 'OfficialController');
          const prompt = await this.officialService.scanOldWechat(fromUserName, sceneStr);
          const xmlMsg = await this.officialService.genXmlMsg(xmlObject, prompt);
          return res.status(200).send(xmlMsg);
        }
        const prompt = await this.officialService.scan(fromUserName, sceneStr);
        const xmlMsg = await this.officialService.genXmlMsg(xmlObject, prompt);
        return res.status(200).send(xmlMsg);
      }

      /* 取消订阅 */
      if (event === 'unsubscribe') {
        Logger.log('接收到公众号取消订阅事件', 'OfficialController');
        return res.status(200).send('');
      }
    }

    /* 客户端发送了文字消息 */
    if (msgType === 'text') {
      Logger.log('接收到公众号文本消息', 'OfficialController');
      const confirmationReply = await this.officialService.confirmQrAction(fromUserName, content);
      if (confirmationReply) {
        const xmlMsg = await this.officialService.genXmlMsg(xmlObject, confirmationReply);
        return res.status(200).send(xmlMsg);
      }
      const xmlMsg = await this.officialService.genXmlMsgByConfig(
        xmlObject,
        'officialAutoReplyText',
      );
      return res.status(200).send(xmlMsg);
    }

    Logger.debug(`未识别的消息类型: ${msgType}, 返回默认响应`, 'OfficialController');
    return 'success';
  }

  @Post('getQRSceneStr')
  @ApiOperation({ summary: '获取登录二维码sceneStr' })
  async getQRSceneStr() {
    return this.officialService.getQRSceneStr();
  }

  @Post('getQRSceneStrByBind')
  @ApiOperation({ summary: '获取绑定二维码的sceneStr' })
  @UseGuards(JwtAuthGuard)
  async getQRSceneStrByBind(@Req() req: Request) {
    return this.officialService.getQRSceneStrByBind(req);
  }

  @Post('getQRSceneStrByOldWechat')
  @ApiOperation({ summary: '获取旧账号迁移二维码的sceneStr' })
  @UseGuards(JwtAuthGuard)
  async getQRSceneStrByOldWechat(@Req() req: Request) {
    Logger.log('生成旧账号迁移二维码场景', 'OfficialController');
    return this.officialService.getQRSceneStrByOldWechat(req);
  }

  @Get('getQRCode')
  @ApiOperation({ summary: '获取二维码' })
  async getQRCode(@Query() query: GetQrCodeDto) {
    Logger.log('获取普通登录二维码', 'OfficialController');

    if (process.env.ISDEV === 'true') {
      Logger.log('开发环境下，返回空二维码', 'OfficialController');
      return '';
    }

    try {
      const ticket = await this.officialService.getQRCodeTicket(query.sceneStr);
      Logger.log('获取普通登录二维码 ticket 成功', 'OfficialController');

      const Url = await this.officialService.getWechatMpUrl();
      const qrCodeUrl = `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;

      Logger.log('生成普通登录二维码 URL 成功', 'OfficialController');
      return qrCodeUrl;
    } catch (error) {
      Logger.error(`获取普通登录二维码失败: ${error.message}`, 'OfficialController');
      throw error;
    }
  }

  @Post('loginBySceneStr')
  @ApiOperation({ summary: '扫码登录轮询查询' })
  async loginBySceneStr(@Req() req: Request, @Body() body: GetQrCodeDto) {
    return this.officialService.loginBySceneStr(req, body);
  }

  @Post('bindWxBySceneStr')
  @ApiOperation({ summary: '扫码绑定轮询查询' })
  @UseGuards(JwtAuthGuard)
  async bindWxBySceneStr(@Req() req: Request, @Body() body: GetQrCodeDto) {
    return this.officialService.bindWxBySceneStr(req, body.sceneStr);
  }

  @Post('bindWxByOldWechat')
  @ApiOperation({ summary: '绑定旧账号微信轮询查询' })
  @UseGuards(JwtAuthGuard)
  async bindWxByOldWechat(@Req() req: Request, @Body() body: GetQrCodeDto) {
    return this.officialService.bindWxByOldWechat(req, body.sceneStr);
  }

  @Post('getRedirectUrl')
  @ApiOperation({ summary: '获取登录跳转地址' })
  async getRedirectUrl(@Body() body: { url: string }) {
    return this.officialService.getRedirectUrl(body.url);
  }

  @Post('getJsapiTicket')
  @ApiOperation({ summary: '获取注册配置' })
  async getJsapiTicket(@Body() body: { url: string }) {
    return this.officialService.getJsapiTicket(body.url);
  }

  @Post('loginByCode')
  @ApiOperation({ summary: '公众号静默登录' })
  async loginByCode(@Req() req: Request, @Body() body: { code: string }) {
    return this.officialService.loginByCode(req, body.code);
  }

  @Post('menu')
  @ApiOperation({ summary: '创建自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async createMenu(@Body() menuData: CreateMenuDto) {
    Logger.log('创建自定义菜单', 'OfficialController');
    return this.officialService.createMenu(menuData);
  }

  @Get('menu')
  @ApiOperation({ summary: '获取自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async getMenu() {
    Logger.log('获取自定义菜单', 'OfficialController');
    return this.officialService.getMenu();
  }

  @Delete('menu')
  @ApiOperation({ summary: '删除自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async deleteMenu() {
    Logger.log('删除自定义菜单', 'OfficialController');
    return this.officialService.deleteMenu();
  }

  @Get('getOldQRCode')
  @ApiOperation({ summary: '获取旧公众号二维码（用于账号迁移）' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getOldQRCode(@Query() query: GetQrCodeDto, @Req() req: Request) {
    Logger.log('获取旧公众号二维码', 'OfficialController');

    if (process.env.ISDEV === 'true') {
      Logger.log('开发环境下，返回空二维码', 'OfficialController');
      return { success: true, data: '' };
    }

    try {
      // 获取旧公众号二维码ticket
      const ticket = await this.officialService.getOldQRCodeTicket(
        query.sceneStr,
        Number(req.user.id),
      );

      // 优先使用旧公众号专用 MP URL（环境变量），如果未配置则使用新配置系统
      const oldMpUrl = process.env.oldWeChatMpUrl;
      const Url = oldMpUrl ? formatUrl(oldMpUrl) : await this.officialService.getWechatMpUrl();

      const qrCodeUrl = `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
      Logger.log('生成旧公众号二维码 URL 成功', 'OfficialController');

      return qrCodeUrl;
    } catch (error) {
      Logger.error(`获取旧公众号二维码失败: ${error.message}`, 'OfficialController');
      throw error;
    }
  }

  @Post('batchUpdateUnionIds')
  @ApiOperation({ summary: '批量更新用户 UnionID' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async batchUpdateUnionIds() {
    Logger.log('开始批量更新用户 UnionID', 'OfficialController');
    return this.officialService.batchUpdateUnionIds();
  }

  @Get('material/list')
  @ApiOperation({ summary: '获取素材列表' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async getMaterialList(
    @Query('type') type: string,
    @Query('offset') offset: number = 0,
    @Query('count') count: number = 20,
  ) {
    Logger.log(
      `获取素材列表 - 类型: ${type}, offset: ${offset}, count: ${count}`,
      'OfficialController',
    );
    return this.officialService.getMaterialList(type, offset, count);
  }
}
