import { createRandomCode, createRandomNonceStr, formatUrl } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { AutoReplyService } from '../autoReply/autoReply.service';
import { ChatService } from '../chat/chat.service';
import { AuthService } from './../auth/auth.service';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';
import { RedisCacheService } from './../redisCache/redisCache.service';
import { UserService } from './../user/user.service';

@Injectable()
export class OfficialService {
  constructor(
    private readonly autoReplyService: AutoReplyService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatgptService: ChatService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  private readonly qrSceneTtlSeconds = 120;

  private hashQrPollToken(pollToken: string): string {
    return crypto.createHash('sha256').update(pollToken).digest('hex');
  }

  private createQrConfirmationCode(): string {
    return String(createRandomCode());
  }

  private getQrConfirmationPrompt(
    purpose: 'login' | 'bind' | 'oldWechat',
    confirmationCode: string,
    targetAccount?: string,
  ): string {
    const action =
      purpose === 'login'
        ? '让显示此二维码的浏览器登录你的 99AI Plugin Edition 账号'
        : purpose === 'bind'
        ? `把此微信绑定到 99AI Plugin Edition 账号“${targetAccount || '未知账号'}”`
        : `把旧微信账号迁移到 99AI Plugin Edition 账号“${targetAccount || '未知账号'}”`;
    const command =
      purpose === 'login'
        ? `确认登录 ${confirmationCode}`
        : purpose === 'bind'
        ? `确认绑定 ${confirmationCode}`
        : `确认迁移 ${confirmationCode}`;
    return `检测到扫码请求：${action}。请先确认浏览器显示的配对码也是 ${confirmationCode}；如一致且为本人操作，请在 2 分钟内回复“${command}”。如不一致或非本人操作，请勿回复。`;
  }

  private maskAccountLabel(value: unknown): string {
    const label = String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9\u3400-\u9fff_-]/g, '*');
    if (!label) return '未知账号';
    if (label.length === 1) return `${label}*`;
    if (label.length === 2) return `${label[0]}*`;
    return `${label[0]}${'*'.repeat(Math.min(3, label.length - 2))}${label[label.length - 1]}`;
  }

  private async requireQrScene(sceneStr: string, purpose: 'login' | 'bind' | 'oldWechat') {
    const scene = await this.redisCacheService.getQrScene(sceneStr);
    if (!scene || scene.purpose !== purpose) {
      throw new HttpException('二维码已过期或无效', HttpStatus.BAD_REQUEST);
    }
    return scene;
  }

  async onModuleInit() {
    await this.globalConfigService.getWechatAccessToken(true);
    await this.globalConfigService.getOldWechatAccessToken(true);
  }

  async getQRSceneStr() {
    const sceneStr = createRandomNonceStr(32);
    const pollToken = createRandomNonceStr(48);
    const confirmationCode = this.createQrConfirmationCode();
    await this.redisCacheService.createQrScene(
      sceneStr,
      {
        purpose: 'login',
        pollTokenHash: this.hashQrPollToken(pollToken),
        confirmationCode,
      },
      this.qrSceneTtlSeconds,
    );
    return { sceneStr, pollToken, confirmationCode };
  }

  /* 下发绑定微信的sceneStr */
  async getQRSceneStrByBind(req) {
    const { id } = req.user;
    const sceneStr = `${createRandomNonceStr(32)}/bind`;
    const confirmationCode = this.createQrConfirmationCode();
    await this.redisCacheService.createQrScene(
      sceneStr,
      {
        purpose: 'bind',
        ownerUserId: Number(id),
        confirmationCode,
      },
      this.qrSceneTtlSeconds,
    );
    return { sceneStr, confirmationCode };
  }

  async getQRCodeTicket(sceneStr: string) {
    const scene = await this.redisCacheService.getQrScene(sceneStr);
    if (!scene || !['login', 'bind'].includes(scene.purpose)) {
      throw new HttpException('二维码已过期或无效', HttpStatus.BAD_REQUEST);
    }
    Logger.log('开始获取普通二维码 ticket', 'OfficialService');
    return this.fetchQRCodeTicket(sceneStr);
  }

  async getRedirectUrl(url: string) {
    const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
    const Url = await this.globalConfigService.getWechatUrl('open');
    const res = `${Url}/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodeURIComponent(
      url,
    )}&response_type=code&scope=snsapi_userinfo&state=weChatLogin#wechat_redirect`;
    Logger.debug('已生成微信授权跳转 URL', 'OfficialService');
    return res;
  }

  async getJsapiTicket(url: string) {
    const nonceStr = createRandomNonceStr(32);
    const timestamp = (Date.now() / 1000).toFixed(0);
    const jsapiTicket = await this.globalConfigService.getConfigs(['wechatJsapiTicket']);
    const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
    const str = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = this.sha1(str);
    Logger.debug('已生成 JSAPI 签名', 'OfficialService');
    return { appId, nonceStr, timestamp, signature };
  }

  /* 获取微信 MP URL 配置 */
  async getWechatMpUrl(): Promise<string> {
    return await this.globalConfigService.getWechatUrl('mp');
  }

  async fetchQRCodeTicket(sceneStr: string) {
    const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);

    const Url = await this.globalConfigService.getWechatUrl('api');
    const params = {
      action_name: 'QR_STR_SCENE',
      action_info: { scene: { scene_str: sceneStr } },
    };

    const res = await axios.post(
      `${Url}/cgi-bin/qrcode/create?access_token=${accessToken}`,
      params,
    );

    const {
      data: { errmsg, ticket },
    } = res;

    if (errmsg) {
      Logger.error(`获取普通二维码ticket失败: ${errmsg}`, 'OfficialService');
      throw new HttpException(errmsg, HttpStatus.BAD_REQUEST);
    }

    Logger.log('普通二维码 ticket 获取成功', 'OfficialService');
    return ticket;
  }

  async loginByCode(req, code: string) {
    const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
    const secret = await this.globalConfigService.getConfigs(['wechatOfficialAppSecret']);
    const Url = await this.globalConfigService.getWechatUrl('api');
    const res = await axios.get(
      `${Url}/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code`,
    );
    const {
      data: { errmsg, openid, unionid, access_token },
    } = res;

    if (errmsg) throw new HttpException(errmsg, HttpStatus.BAD_REQUEST);
    if (openid) {
      const user = await this.userService.getUserFromOpenId(openid, undefined, unionid);

      // 获取并更新用户详细信息
      const userInfo = await axios.get(
        `${Url}/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`,
      );
      await this.userService.updateUserInfo(user.id, userInfo.data);

      Logger.log(`微信授权登录成功 - UserID: ${user.id}`, 'OfficialService');
      return this.authService.loginByOpenId(user, req);
    }
  }

  /* 扫码事件 初次扫码关注 或者二次扫码都一样 */
  async scan(openID: string, sceneStr: string) {
    try {
      Logger.debug('开始处理微信扫码事件', 'OfficialService');

      const scene = await this.requireQrScene(sceneStr, 'login');

      const completion = await this.redisCacheService.markQrSceneScanned(
        sceneStr,
        'login',
        openID,
        { openId: openID },
      );
      if (completion !== 'scanned') {
        throw new HttpException('二维码已使用或过期', HttpStatus.BAD_REQUEST);
      }
      Logger.log('用户扫码成功，等待微信端确认', 'OfficialService');
      return this.getQrConfirmationPrompt('login', scene.confirmationCode);
    } catch (error) {
      Logger.error(`扫码处理失败: ${error.message}`, error?.stack, 'OfficialService');
      throw new HttpException('处理扫码事件时发生错误', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* 轮询扫码登录响应 */
  async loginBySceneStr(req, body) {
    const { sceneStr, pollToken } = body;
    Logger.debug('轮询扫码登录状态', 'OfficialService');

    if (!pollToken) {
      throw new HttpException('缺少二维码轮询凭证', HttpStatus.BAD_REQUEST);
    }

    const consumed = await this.redisCacheService.consumeQrScene({
      sceneStr,
      purpose: 'login',
      pollTokenHash: this.hashQrPollToken(pollToken),
    });
    if (consumed.status === 'pending' || consumed.status === 'expired') {
      Logger.debug('扫码尚未完成', 'OfficialService');
      return '';
    }

    if (consumed.status !== 'consumed') {
      throw new HttpException('二维码轮询凭证无效', HttpStatus.BAD_REQUEST);
    }

    const openId = typeof consumed.result.openId === 'string' ? consumed.result.openId : '';
    if (!openId) {
      throw new HttpException('二维码登录结果无效', HttpStatus.BAD_REQUEST);
    }

    const wechatUserInfo = await this.getUserInfoFromWechat(openId);
    const unionId = wechatUserInfo.unionid;
    const user = await this.userService.getUserFromOpenId(openId, undefined, unionId);

    Logger.log(`扫码登录成功 - UserID: ${user.id}`, 'OfficialService');

    return this.authService.loginByOpenId(user, req);
  }

  /* 扫码事件 绑定微信 */
  async scanBindWx(openId: string, sceneStr) {
    Logger.debug('开始处理微信绑定扫码', 'OfficialService');

    const scene = await this.requireQrScene(sceneStr, 'bind');

    // 尝试获取用户完整信息（包括 UnionID，如果可用）
    const wechatUserInfo = await this.getUserInfoFromWechat(openId);
    const unionId = wechatUserInfo.unionid; // 可能是 null，没关系

    Logger.debug(
      `微信绑定资料已获取，UnionID=${unionId ? 'available' : 'unavailable'}`,
      'OfficialService',
    );

    // 绑定微信，传入 unionId（即使是 null 也没问题）
    const completion = await this.redisCacheService.markQrSceneScanned(sceneStr, 'bind', openId, {
      openId,
      unionId,
    });
    if (completion !== 'scanned') {
      throw new HttpException('二维码已使用或过期', HttpStatus.BAD_REQUEST);
    }

    Logger.log(`微信绑定已扫码，等待微信端确认`, 'OfficialService');
    const targetUser = await this.userService.getUserById(scene.ownerUserId);
    return {
      status: true,
      prompt: this.getQrConfirmationPrompt(
        'bind',
        scene.confirmationCode,
        this.maskAccountLabel(targetUser?.username || targetUser?.nickname),
      ),
    };
  }

  async confirmQrAction(openId: string, content: string): Promise<string | null> {
    if (!openId || !content) return null;
    const normalized = String(content || '').trim();
    const match = normalized.match(/^确认(登录|绑定|迁移)\s*([0-9]{6})$/);
    if (!match) return null;

    const action = match[1];
    const confirmationCode = match[2];
    const confirmation =
      action === '登录'
        ? { purpose: 'login' as const, success: '登录已确认，请返回浏览器。' }
        : action === '绑定'
        ? { purpose: 'bind' as const, success: '绑定已确认，请返回浏览器。' }
        : { purpose: 'oldWechat' as const, success: '迁移已确认，请返回浏览器。' };
    const result = await this.redisCacheService.confirmQrScene(
      openId,
      confirmation.purpose,
      confirmationCode,
    );
    if (result === 'confirmed' || result === 'already-confirmed') return confirmation.success;
    return '确认码无效或已过期，请回到浏览器重新生成二维码。';
  }

  /* 轮询绑定结果 */
  async bindWxBySceneStr(req, sceneStr: string) {
    const { id } = req.user;
    const consumed = await this.redisCacheService.consumeQrScene({
      sceneStr,
      purpose: 'bind',
      ownerUserId: Number(id),
    });
    if (consumed.status === 'pending' || consumed.status === 'expired') return '';
    if (consumed.status !== 'consumed') {
      throw new HttpException('二维码不属于当前账号', HttpStatus.FORBIDDEN);
    }

    const openId = typeof consumed.result.openId === 'string' ? consumed.result.openId : '';
    const unionId =
      typeof consumed.result.unionId === 'string' ? consumed.result.unionId : undefined;
    if (!openId) throw new HttpException('二维码绑定结果无效', HttpStatus.BAD_REQUEST);
    const res = await this.userService.bindWx(openId, id, unionId);
    Logger.log(`微信绑定确认 - UserID: ${id}`, 'OfficialService');
    return res;
  }

  async verify(signature: string, nonce: string, timestamp: string) {
    const token = await this.globalConfigService.getConfigs(['wechatOfficialToken']);
    if (
      typeof token !== 'string' ||
      !token.trim() ||
      typeof signature !== 'string' ||
      !/^[a-f0-9]{40}$/i.test(signature) ||
      typeof nonce !== 'string' ||
      !nonce ||
      typeof timestamp !== 'string' ||
      !/^\d{1,16}$/.test(timestamp)
    ) {
      return false;
    }
    return this.sha1([token.trim(), nonce, timestamp].sort().join('')) === signature.toLowerCase();
  }

  sha1(data: string) {
    return crypto.createHash('sha1').update(data).digest('hex');
  }

  /* 通过 OpenID 获取用户完整信息（包括 UnionID，如果可用） */
  async getUserInfoFromWechat(openId: string) {
    try {
      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = await this.globalConfigService.getWechatUrl('api');

      Logger.debug('调用微信用户信息接口', 'OfficialService');

      const res = await axios.get(
        `${Url}/cgi-bin/user/info?access_token=${accessToken}&openid=${openId}&lang=zh_CN`,
      );

      const { data } = res;

      // 检查是否有错误
      if (data.errcode) {
        Logger.error(
          `获取用户信息失败 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(data.errmsg, HttpStatus.BAD_REQUEST);
      }

      // unionid 可能不存在（未绑定开放平台时）
      const unionid = data.unionid || null;

      Logger.debug(
        `获取微信用户信息成功，UnionID=${unionid ? 'available' : 'unavailable'}`,
        'OfficialService',
      );

      return {
        openid: data.openid,
        unionid: unionid, // 如果未绑定开放平台，这里是 null，不会报错
        nickname: data.nickname || '',
        sex: data.sex || 0,
        city: data.city || '',
        province: data.province || '',
        country: data.country || '',
        headimgurl: data.headimgurl || '',
        subscribe: data.subscribe || 0,
        subscribe_time: data.subscribe_time || 0,
      };
    } catch (error) {
      Logger.error(`获取用户信息异常: ${error.message}`, 'OfficialService');
      // 如果获取用户信息失败，返回基本的 openid 信息
      // 这样即使 API 调用失败，也不会影响扫码登录流程
      return {
        openid: openId,
        unionid: null,
      };
    }
  }

  async genXmlMsgByConfig(xmlData, msgKey) {
    const msg = await this.globalConfigService.getConfigs([msgKey]);
    Logger.debug(`使用配置消息 [${msgKey}]`, 'OfficialService');
    return this.genXmlMsg(xmlData, msg);
  }

  async genXmlMsg(xmlData, msg) {
    // 辅助函数，安全地获取字段值
    const getXmlValue = field => {
      const fieldLower = field.toLowerCase();
      // 尝试通过原始字段名获取
      if (xmlData[field] !== undefined) {
        return Array.isArray(xmlData[field]) ? xmlData[field][0] : xmlData[field];
      }
      // 尝试通过小写字段名获取
      if (xmlData[fieldLower] !== undefined) {
        return Array.isArray(xmlData[fieldLower]) ? xmlData[fieldLower][0] : xmlData[fieldLower];
      }
      return null;
    };

    const fromUser = getXmlValue('FromUserName') || getXmlValue('fromusername');
    const toUser = getXmlValue('ToUserName') || getXmlValue('tousername');

    Logger.debug('开始生成 XML 回复', 'OfficialService');

    // 检查必要字段是否存在
    if (!fromUser) {
      Logger.error('缺少 FromUserName 字段', undefined, 'OfficialService');
      throw new HttpException('缺少必要的XML字段', HttpStatus.BAD_REQUEST);
    }

    if (!toUser) {
      Logger.error('缺少 ToUserName 字段', undefined, 'OfficialService');
      throw new HttpException('缺少必要的XML字段', HttpStatus.BAD_REQUEST);
    }

    const xmlResponse = `
    <xml>
        <ToUserName><![CDATA[${fromUser}]]></ToUserName>
        <FromUserName><![CDATA[${toUser}]]></FromUserName>
        <CreateTime>${new Date().getTime()}</CreateTime>
        <MsgType><![CDATA[text]]></MsgType>
        <Content><![CDATA[${msg}]]></Content>
    </xml>`;

    Logger.debug(`生成的XML回复已完成`, 'OfficialService');
    return xmlResponse;
  }

  /* 创建自定义菜单 */
  async createMenu(menuData: any) {
    try {
      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = await this.globalConfigService.getWechatUrl('api');

      // 打印详细的菜单数据用于调试
      Logger.log(`准备创建菜单 - 菜单数量: ${menuData.button?.length || 0}`, 'OfficialService');

      // 保存菜单配置到数据库，包括 content 字段
      await this.saveMenuConfig(menuData);

      const res = await axios.post(
        `${Url}/cgi-bin/menu/create?access_token=${accessToken}`,
        menuData,
      );
      const { data } = res;

      // 检查微信返回的错误码
      if (data.errcode && data.errcode !== 0) {
        Logger.error(
          `微信API返回错误 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(data.errmsg || '创建菜单失败', HttpStatus.BAD_REQUEST);
      }

      Logger.log(`创建自定义菜单成功`, 'OfficialService');
      return data;
    } catch (error) {
      Logger.error(`创建自定义菜单失败: ${error.message}`, 'OfficialService');
      // 如果有微信返回的详细错误，一起打印
      throw new HttpException(
        error.response?.data?.errmsg || '创建自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 保存菜单配置到数据库 */
  private async saveMenuConfig(menuData: any) {
    try {
      // 将完整的菜单配置保存到配置表
      await this.globalConfigService.setConfig({
        settings: [
          {
            configKey: 'wechatMenuConfig',
            configVal: JSON.stringify(menuData),
          },
        ],
      });
      Logger.log('菜单配置已保存到数据库', 'OfficialService');
    } catch (error) {
      Logger.error(`保存菜单配置失败: ${error.message}`, 'OfficialService');
      // 不抛出异常，避免影响菜单创建流程
    }
  }

  /* 根据菜单key获取回复内容 */
  async getMenuContentByKey(key: string): Promise<string | null> {
    try {
      const menuConfigStr = await this.globalConfigService.getConfigs(['wechatMenuConfig']);
      if (!menuConfigStr) {
        Logger.warn('未找到菜单配置', 'OfficialService');
        return null;
      }

      const menuConfig = JSON.parse(menuConfigStr);
      if (!menuConfig.button || !Array.isArray(menuConfig.button)) {
        return null;
      }

      // 在一级菜单中查找
      for (const menu of menuConfig.button) {
        if (menu.key === key && menu.content) {
          Logger.debug(`找到菜单回复内容 - key: ${key}`, 'OfficialService');
          return menu.content;
        }

        // 在子菜单中查找
        if (menu.sub_button && Array.isArray(menu.sub_button)) {
          for (const subMenu of menu.sub_button) {
            if (subMenu.key === key && subMenu.content) {
              Logger.debug(`找到子菜单回复内容 - key: ${key}`, 'OfficialService');
              return subMenu.content;
            }
          }
        }
      }

      Logger.warn(`未找到key为 ${key} 的菜单配置`, 'OfficialService');
      return null;
    } catch (error) {
      Logger.error(`获取菜单回复内容失败: ${error.message}`, 'OfficialService');
      return null;
    }
  }

  /* 查询自定义菜单 */
  async getMenu() {
    try {
      Logger.log('开始查询自定义菜单', 'OfficialService');

      // 优先从数据库读取保存的完整配置（包含 content 字段）
      const menuConfigStr = await this.globalConfigService.getConfigs(['wechatMenuConfig']);

      if (menuConfigStr) {
        try {
          const menuConfig = JSON.parse(menuConfigStr);
          Logger.log('从数据库读取菜单配置成功', 'OfficialService');
          // 返回包含 content 字段的完整配置
          return {
            menu: menuConfig,
          };
        } catch (parseError) {
          Logger.warn(`解析数据库菜单配置失败: ${parseError.message}`, 'OfficialService');
          // 解析失败，继续从微信API获取
        }
      } else {
        Logger.debug('数据库中未找到菜单配置，尝试从微信API获取', 'OfficialService');
      }

      // 如果数据库没有配置，则从微信API获取
      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = await this.globalConfigService.getWechatUrl('api');
      const res = await axios.get(`${Url}/cgi-bin/menu/get?access_token=${accessToken}`);
      const { data } = res;

      // 检查微信返回的错误码
      if (data.errcode && data.errcode !== 0) {
        Logger.error(
          `查询菜单失败 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(data.errmsg || '查询菜单失败', HttpStatus.BAD_REQUEST);
      }

      Logger.log(`从微信API查询自定义菜单成功`, 'OfficialService');
      // 如果没有菜单，返回空结构
      if (!data.menu || !data.menu.button) {
        Logger.warn('当前公众号未配置自定义菜单', 'OfficialService');
        return { menu: { button: [] } };
      }

      return data;
    } catch (error) {
      Logger.error(`查询自定义菜单失败: ${error.message}`, 'OfficialService');
      throw new HttpException(
        error.response?.data?.errmsg || '查询自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 删除自定义菜单 */
  async deleteMenu() {
    try {
      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = await this.globalConfigService.getWechatUrl('api');
      const res = await axios.get(`${Url}/cgi-bin/menu/delete?access_token=${accessToken}`);
      const { data } = res;

      // 同时清除数据库中保存的菜单配置
      try {
        await this.globalConfigService.setConfig({
          settings: [
            {
              configKey: 'wechatMenuConfig',
              configVal: '',
            },
          ],
        });
        Logger.log('已清除数据库中的菜单配置', 'OfficialService');
      } catch (clearError) {
        Logger.warn(`清除数据库菜单配置失败: ${clearError.message}`, 'OfficialService');
        // 不抛出异常，避免影响主流程
      }

      Logger.log(`删除自定义菜单成功`, 'OfficialService');
      return data;
    } catch (error) {
      Logger.error(`删除自定义菜单失败: ${error.message}`, 'OfficialService');
      throw new HttpException(
        error.response?.data?.errmsg || '删除自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 绑定旧账号微信 */
  async bindWxByOldWechat(req, sceneStr: string) {
    try {
      Logger.log('开始处理旧账号迁移', 'OfficialService');

      // 获取当前用户信息
      const { id: currentUserId } = req.user;
      const consumed = await this.redisCacheService.consumeQrScene({
        sceneStr,
        purpose: 'oldWechat',
        ownerUserId: Number(currentUserId),
      });
      if (consumed.status === 'pending' || consumed.status === 'expired') {
        Logger.log('尚未收到旧账号迁移扫码结果', 'OfficialService');
        return '';
      }
      if (consumed.status !== 'consumed') {
        throw new HttpException('二维码不属于当前账号', HttpStatus.FORBIDDEN);
      }

      if (consumed.result.success === false) {
        return {
          success: false,
          message:
            typeof consumed.result.message === 'string'
              ? consumed.result.message
              : '未找到旧账号，迁移失败',
        };
      }

      const oldOpenId =
        typeof consumed.result.openId === 'string' ? consumed.result.openId : undefined;
      if (!oldOpenId) {
        Logger.warn('旧账号迁移数据格式错误', 'OfficialService');
        throw new HttpException('无效的OpenID数据', HttpStatus.BAD_REQUEST);
      }

      // 查询旧OpenID是否存在对应用户
      const oldUser = await this.userService.getUserOpenId(oldOpenId);
      if (!oldUser) {
        Logger.log('未找到对应的旧账号', 'OfficialService');
        return {
          success: false,
          message: '未找到旧账号，迁移失败',
        };
      }

      // 获取当前用户信息
      const currentUser = await this.userService.getUserById(currentUserId);
      if (!currentUser) {
        Logger.log(`未找到当前用户 - ID: ${currentUserId}`, 'OfficialService');
        throw new HttpException('当前用户不存在', HttpStatus.BAD_REQUEST);
      }

      // 获取当前用户的openId
      const currentOpenId = currentUser.openId;
      if (!currentOpenId) {
        Logger.log(`当前用户未绑定微信 - ID: ${currentUserId}`, 'OfficialService');
        throw new HttpException('当前用户未绑定微信', HttpStatus.BAD_REQUEST);
      }

      Logger.log('已找到可迁移的旧账号', 'OfficialService');

      const migrationResult = await this.userService.migrateWechatOpenId({
        oldUserId: oldUser.id,
        currentUserId: Number(currentUserId),
        expectedOldOpenId: oldOpenId,
        expectedCurrentOpenId: currentOpenId,
      });
      if (!migrationResult.status) {
        Logger.warn(`旧账号迁移失败: ${migrationResult.msg}`, 'OfficialService');
        return {
          success: false,
          message: migrationResult.msg,
        };
      }
      Logger.log('旧账号微信标识已在事务中完成迁移', 'OfficialService');

      // 返回迁移成功信息
      return {
        success: true,
        message: '账号迁移成功，现在可以使用旧账号登录',
        needRelogin: true,
      };
    } catch (error) {
      Logger.log(`旧账号迁移处理失败: ${error.message}`, 'OfficialService');
      throw new HttpException('处理账号迁移时发生错误', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* 扫码事件 旧账号微信扫码 */
  async scanOldWechat(openId: string, sceneStr: string) {
    Logger.debug('处理旧账号微信扫码', 'OfficialService');

    const scene = await this.requireQrScene(sceneStr, 'oldWechat');

    // openId就是用户在旧公众号的openid (fromUserName)
    const oldOpenId = openId;

    // 直接检查数据库中是否有使用这个openid绑定的账号
    const oldUser = await this.userService.getUserOpenId(oldOpenId);
    if (!oldUser) {
      // 没有找到绑定的账号
      Logger.warn('未找到与扫码身份关联的旧账号', 'OfficialService');

      const completion = await this.redisCacheService.markQrSceneScanned(
        sceneStr,
        'oldWechat',
        oldOpenId,
        {
          success: false,
          error: 'not_found',
          message: '未找到绑定此微信的旧账号',
        },
      );
      if (completion !== 'scanned') {
        throw new HttpException('二维码已使用或过期', HttpStatus.BAD_REQUEST);
      }

      const targetUser = await this.userService.getUserById(scene.ownerUserId);
      return this.getQrConfirmationPrompt(
        'oldWechat',
        scene.confirmationCode,
        this.maskAccountLabel(targetUser?.username || targetUser?.nickname),
      );
    }

    // 找到了绑定的账号
    Logger.debug('找到与扫码身份关联的旧账号', 'OfficialService');

    const completion = await this.redisCacheService.markQrSceneScanned(
      sceneStr,
      'oldWechat',
      oldOpenId,
      {
        success: true,
        openId: oldOpenId,
        userId: oldUser.id,
      },
    );
    if (completion !== 'scanned') {
      throw new HttpException('二维码已使用或过期', HttpStatus.BAD_REQUEST);
    }

    Logger.log('旧账号已扫码，等待微信端确认', 'OfficialService');
    const targetUser = await this.userService.getUserById(scene.ownerUserId);
    return this.getQrConfirmationPrompt(
      'oldWechat',
      scene.confirmationCode,
      this.maskAccountLabel(targetUser?.username || targetUser?.nickname),
    );
  }

  /* 获取旧账号迁移的sceneStr */
  async getQRSceneStrByOldWechat(req) {
    const { id } = req.user;
    const sceneStr = `${createRandomNonceStr(32)}#old`;
    const confirmationCode = this.createQrConfirmationCode();
    await this.redisCacheService.createQrScene(
      sceneStr,
      {
        purpose: 'oldWechat',
        ownerUserId: Number(id),
        confirmationCode,
      },
      this.qrSceneTtlSeconds,
    );
    Logger.log('已创建旧账号迁移二维码事务', 'OfficialService');

    return { sceneStr, confirmationCode };
  }

  /* 获取旧公众号的二维码ticket */
  async getOldQRCodeTicket(sceneStr: string, userId: number) {
    Logger.log('开始获取旧公众号二维码 ticket', 'OfficialService');

    const scene = await this.requireQrScene(sceneStr, 'oldWechat');
    if (Number(scene.ownerUserId) !== Number(userId)) {
      throw new HttpException('二维码不属于当前账号', HttpStatus.FORBIDDEN);
    }

    const oldAccessToken = await this.globalConfigService.getConfigs(['oldWechatAccessToken']);

    if (!oldAccessToken) {
      Logger.error('无法获取旧公众号访问令牌', 'OfficialService');
      throw new HttpException('无法获取旧公众号访问令牌', HttpStatus.BAD_REQUEST);
    }

    const ticket = await this.fetchQRCodeTicketWithToken(sceneStr, oldAccessToken);
    Logger.log('获取旧公众号二维码 ticket 成功', 'OfficialService');

    return ticket;
  }

  /* 使用指定的token创建二维码ticket */
  async fetchQRCodeTicketWithToken(sceneStr: string, accessToken: string) {
    try {
      const Url = await this.globalConfigService.getWechatUrl('api');
      const params = {
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: sceneStr } },
      };

      Logger.log('向微信 API 请求创建二维码', 'OfficialService');

      const res = await axios.post(
        `${Url}/cgi-bin/qrcode/create?access_token=${accessToken}`,
        params,
      );

      const {
        data: { errmsg, ticket, errcode },
      } = res;

      if (errmsg || errcode) {
        Logger.error(`创建二维码失败 - 错误码: ${errcode}, 错误信息: ${errmsg}`, 'OfficialService');
        throw new HttpException(errmsg || '创建二维码失败', HttpStatus.BAD_REQUEST);
      }

      if (!ticket) {
        Logger.error('创建二维码失败 - 未返回ticket', 'OfficialService');
        throw new HttpException('未获取到二维码ticket', HttpStatus.BAD_REQUEST);
      }

      return ticket;
    } catch (error) {
      Logger.error(`创建二维码异常: ${error.message}`, 'OfficialService');
      throw new HttpException(error.message || '创建二维码失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* 批量更新用户的 UnionID */
  async batchUpdateUnionIds() {
    try {
      Logger.log('开始批量更新用户 UnionID', 'OfficialService');

      // 获取所有有 openId 但没有 unionId 的用户
      const usersNeedUpdate = await this.userService.getUsersNeedUnionIdUpdate();

      if (!usersNeedUpdate || usersNeedUpdate.length === 0) {
        Logger.log('没有需要更新 UnionID 的用户', 'OfficialService');
        return {
          success: true,
          message: '没有需要更新的用户',
          total: 0,
          updated: 0,
          failed: 0,
        };
      }

      Logger.log(`找到 ${usersNeedUpdate.length} 个需要更新 UnionID 的用户`, 'OfficialService');

      let successCount = 0;
      let failCount = 0;
      let skipCount = 0;
      const failedUsers = [];

      // 批量查询用户信息并更新
      for (let i = 0; i < usersNeedUpdate.length; i++) {
        const user = usersNeedUpdate[i];
        const progress = `[${i + 1}/${usersNeedUpdate.length}]`;
        try {
          // 调用微信 API 获取用户信息
          const wechatUserInfo = await this.getUserInfoFromWechat(user.openId);

          if (wechatUserInfo.unionid) {
            // 更新用户的 unionId
            await this.userService.updateWechatIds(user.id, user.openId, wechatUserInfo.unionid);
            successCount++;
            Logger.log(`${progress} 成功更新微信 UnionID`, 'OfficialService');
          } else {
            Logger.debug(`${progress} 用户未绑定开放平台，跳过`, 'OfficialService');
          }

          // 添加延迟，避免请求过快触发微信 API 限流
          // 用户信息查询接口限制较宽松，主要限制在 access_token 获取次数
          // 当前设置：50ms 延迟 = 每秒最多 20 次请求（保守估计）
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          // 检查是否是无效 openId 错误（错误码 40003）
          const isInvalidOpenId = error.message && error.message.includes('invalid openid');

          if (isInvalidOpenId) {
            // 无效的 openId，跳过而不记录为失败
            skipCount++;
            Logger.debug(`${progress} 跳过无效微信身份`, 'OfficialService');
          } else {
            // 其他错误，记录为失败
            failCount++;
            failedUsers.push({ userId: user.id, error: error.message });
            Logger.error(
              `${progress} 更新失败 - UserID: ${user.id}, Error: ${error.message}`,
              'OfficialService',
            );
          }
        }
      }

      Logger.log(
        `批量更新完成 - 总计: ${usersNeedUpdate.length}, 成功: ${successCount}, 跳过: ${skipCount}, 失败: ${failCount}`,
        'OfficialService',
      );

      return {
        success: true,
        message: '批量更新完成',
        total: usersNeedUpdate.length,
        updated: successCount,
        skipped: skipCount,
        failed: failCount,
        failedUsers: failedUsers.length > 0 ? failedUsers : undefined,
      };
    } catch (error) {
      Logger.error(`批量更新 UnionID 异常: ${error.message}`, 'OfficialService');
      throw new HttpException('批量更新 UnionID 失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* ==================== 素材管理接口 ==================== */

  /* 获取素材列表 */
  async getMaterialList(type: string, offset = 0, count = 20) {
    try {
      Logger.log(
        `获取素材列表 - 类型: ${type}, offset: ${offset}, count: ${count}`,
        'OfficialService',
      );

      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = await this.globalConfigService.getWechatUrl('api');

      const requestBody = { type, offset, count };

      const res = await axios.post(
        `${Url}/cgi-bin/material/batchget_material?access_token=${accessToken}`,
        requestBody,
      );

      const { data } = res;

      // 检查错误码
      if (data.errcode !== undefined && data.errcode !== 0) {
        Logger.error(
          `微信API返回错误 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(
          `微信API错误(${data.errcode}): ${data.errmsg}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      Logger.log(
        `获取素材列表成功 - 总数: ${data.total_count}, 返回: ${data.item_count}`,
        'OfficialService',
      );

      // 如果返回为空，记录提示信息
      if (data.total_count === 0 || data.item_count === 0) {
        Logger.warn(
          `当前公众号暂无${type}类型的素材，请检查：1) 公众号是否真的有素材 2) access_token是否正确`,
          'OfficialService',
        );
      }

      return data;
    } catch (error) {
      Logger.error(`获取素材列表异常: ${error.message}`, 'OfficialService');
      if (error.response) {
        Logger.error(`HTTP响应状态: ${error.response.status}`, 'OfficialService');
      }

      throw new HttpException(
        error.response?.data?.errmsg || error.message || '获取素材列表失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
