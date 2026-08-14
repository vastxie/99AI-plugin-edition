import { ChatType } from '@/common/constants/balance.constant';
import { formatDate } from '@/common/utils/date';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { OrderEntity } from '../order/order.entity';
import { UserEntity } from '../user/user.entity';

@Injectable()
export class StatisticService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /* 基础数据统计 */
  async getBaseStatistic() {
    const userCount = await this.countUsers();
    const newUserCount = await this.countNewUsersToday();
    const chatCount = await this.countChats();
    const newChatCount = await this.countNewChatsToday();
    const drawCount = await this.countDraws();
    const dellDrawCount = await this.countNewDrawsToday();
    const videoCount = await this.countVideos();
    const newVideoCount = await this.countNewVideosToday();
    const musicCount = await this.countMusics();
    const newMusicCount = await this.countNewMusicsToday();
    const orderCount = await this.countOrders();
    const newOrderCount = await this.countNewOrdersToday();
    return {
      userCount,
      newUserCount,
      chatCount,
      newChatCount,
      drawCount,
      newDrawCount: dellDrawCount,
      videoCount,
      newVideoCount,
      musicCount,
      newMusicCount,
      orderCount,
      newOrderCount,
    };
  }

  /* 聊天记录统计 */
  async getChatStatistic({ days = 7 }) {
    const chatData = await this.countChatsByTimeRange(days);
    const drawData = await this.countDrawsByTimeRange(days);
    const videoData = await this.countVideosByTimeRange(days);
    const musicData = await this.countMusicsByTimeRange(days);
    return {
      date: chatData.map(item => item.date),
      chat: chatData.map((item: any) => item.value),
      draw: drawData.map((item: any) => item.value),
      video: videoData.map((item: any) => item.value),
      music: musicData.map((item: any) => item.value),
    };
  }

  /* 查询百度统计数据 */
  async getBaiduVisit({ days = 7 }) {
    const data = await this.getBaiduStatistics(days);
    return data;
  }

  /* 查询用户总数 */
  async countUsers(): Promise<number> {
    const userCount = await this.userEntity.count();
    return userCount;
  }

  /* 当天新增用户 */
  async countNewUsersToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const queryBuilder = this.userEntity.createQueryBuilder('user');
    const userCount = await queryBuilder
      .where('user.createdAt >= :today', { today })
      .andWhere('user.createdAt < :tomorrow', { tomorrow })
      .getCount();
    return userCount;
  }

  /* 聊天次数总数 */
  async countChats(): Promise<number> {
    const chatCount = await this.chatLogEntity.count({
      where: { type: ChatType.NORMAL_CHAT, role: 'assistant' },
    });
    return chatCount;
  }

  /* 当日聊天新增次数 */
  async countNewChatsToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatLog');
    const chatCount = await queryBuilder
      .where('chatLog.type = :type', { type: ChatType.NORMAL_CHAT })
      .andWhere('chatLog.role = :role', { role: 'assistant' })
      .andWhere('chatLog.createdAt >= :today', { today })
      .andWhere('chatLog.createdAt < :tomorrow', { tomorrow })
      .getCount();
    return chatCount;
  }

  /* 绘画次数总数 */
  async countDraws(): Promise<number> {
    const drawCount = await this.chatLogEntity.count({
      where: { type: ChatType.PAINT, role: 'assistant' },
    });
    return drawCount;
  }

  /* 当日新增绘画次数 */
  async countNewDrawsToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatLog');
    const drawCount = await queryBuilder
      .where('chatLog.type = :type', { type: ChatType.PAINT })
      .andWhere('chatLog.role = :role', { role: 'assistant' })
      .andWhere('chatLog.createdAt >= :today', { today })
      .andWhere('chatLog.createdAt < :tomorrow', { tomorrow })
      .getCount();
    return drawCount;
  }

  /* 视频次数总数 */
  async countVideos(): Promise<number> {
    const videoCount = await this.chatLogEntity.count({
      where: { type: ChatType.VIDEO, role: 'assistant' },
    });
    return videoCount;
  }

  /* 当日新增视频次数 */
  async countNewVideosToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatLog');
    const videoCount = await queryBuilder
      .where('chatLog.type = :type', { type: ChatType.VIDEO })
      .andWhere('chatLog.role = :role', { role: 'assistant' })
      .andWhere('chatLog.createdAt >= :today', { today })
      .andWhere('chatLog.createdAt < :tomorrow', { tomorrow })
      .getCount();
    return videoCount;
  }

  /* 音乐次数总数 */
  async countMusics(): Promise<number> {
    const musicCount = await this.chatLogEntity.count({
      where: { type: ChatType.MUSIC, role: 'assistant' },
    });
    return musicCount;
  }

  /* 当日新增音乐次数 */
  async countNewMusicsToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatLog');
    const musicCount = await queryBuilder
      .where('chatLog.type = :type', { type: ChatType.MUSIC })
      .andWhere('chatLog.role = :role', { role: 'assistant' })
      .andWhere('chatLog.createdAt >= :today', { today })
      .andWhere('chatLog.createdAt < :tomorrow', { tomorrow })
      .getCount();
    return musicCount;
  }

  /* 统计一段时间内的聊天数据 */
  async countChatsByTimeRange(days: number): Promise<{ date: string; count: number }[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatlog');
    const result = await queryBuilder
      .select(`DATE(chatlog.createdAt) as date, COUNT(*) as count`)
      .where(`chatlog.type = :type`, { type: ChatType.NORMAL_CHAT })
      .andWhere(`chatlog.role = :role`, { role: 'assistant' })
      .andWhere('chatlog.createdAt >= :startDate', { startDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<{ date: string; count: number }>();
    const dailyData = [];
    const currentDate = startDate;
    for (let i = 0; i < days; i++) {
      const dateString = formatDate(new Date(currentDate), 'M.DD');
      const count =
        result.find((r: any) => formatDate(new Date(r.date), 'M.DD') === dateString)?.count ?? 0;
      if (count > 0) {
        dailyData.push({ date: dateString, value: Number(count) });
      } else {
        dailyData.push({ date: dateString, value: 0 });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dailyData;
  }

  /* 统计一段时间内的绘画次数 */
  async countDrawsByTimeRange(days: number): Promise<{ date: string; count: number }[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatlog');
    const result = await queryBuilder
      .select(`DATE(chatlog.createdAt) as date, COUNT(*) as count`)
      .where(`chatlog.type = :type`, { type: ChatType.PAINT })
      .andWhere(`chatlog.role = :role`, { role: 'assistant' })
      .andWhere('chatlog.createdAt >= :startDate', { startDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<{ date: string; count: number }>();
    const dailyData = [];
    const currentDate = startDate;
    for (let i = 0; i < days; i++) {
      const dateString = formatDate(new Date(currentDate), 'M.DD');
      const count =
        result.find((r: any) => formatDate(new Date(r.date), 'M.DD') === dateString)?.count ?? 0;
      if (count > 0) {
        dailyData.push({ date: dateString, value: Number(count) });
      } else {
        dailyData.push({ date: dateString, value: 0 });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dailyData;
  }

  /* 统计一段时间内的视频次数 */
  async countVideosByTimeRange(days: number): Promise<{ date: string; count: number }[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatlog');
    const result = await queryBuilder
      .select(`DATE(chatlog.createdAt) as date, COUNT(*) as count`)
      .where(`chatlog.type = :type`, { type: ChatType.VIDEO })
      .andWhere(`chatlog.role = :role`, { role: 'assistant' })
      .andWhere('chatlog.createdAt >= :startDate', { startDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<{ date: string; count: number }>();
    const dailyData = [];
    const currentDate = startDate;
    for (let i = 0; i < days; i++) {
      const dateString = formatDate(new Date(currentDate), 'M.DD');
      const count =
        result.find((r: any) => formatDate(new Date(r.date), 'M.DD') === dateString)?.count ?? 0;
      if (count > 0) {
        dailyData.push({ date: dateString, value: Number(count) });
      } else {
        dailyData.push({ date: dateString, value: 0 });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dailyData;
  }

  /* 统计一段时间内的音乐次数 */
  async countMusicsByTimeRange(days: number): Promise<{ date: string; count: number }[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const queryBuilder = this.chatLogEntity.createQueryBuilder('chatlog');
    const result = await queryBuilder
      .select(`DATE(chatlog.createdAt) as date, COUNT(*) as count`)
      .where(`chatlog.type = :type`, { type: ChatType.MUSIC })
      .andWhere(`chatlog.role = :role`, { role: 'assistant' })
      .andWhere('chatlog.createdAt >= :startDate', { startDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<{ date: string; count: number }>();
    const dailyData = [];
    const currentDate = startDate;
    for (let i = 0; i < days; i++) {
      const dateString = formatDate(new Date(currentDate), 'M.DD');
      const count =
        result.find((r: any) => formatDate(new Date(r.date), 'M.DD') === dateString)?.count ?? 0;
      if (count > 0) {
        dailyData.push({ date: dateString, value: Number(count) });
      } else {
        dailyData.push({ date: dateString, value: 0 });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dailyData;
  }

  async getNewAccessToken(
    baiduApiKey: string,
    baiduSecretKey: string,
    baiduRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenUrl = 'https://openapi.baidu.com/oauth/2.0/token';
    Logger.log('开始刷新百度统计 access token', 'StatisticService');

    try {
      const tokenRes = await axios.get(tokenUrl, {
        params: {
          grant_type: 'refresh_token',
          refresh_token: baiduRefreshToken,
          client_id: baiduApiKey,
          client_secret: baiduSecretKey,
        },
      });
      if (tokenRes.status === 200 && tokenRes.data.access_token) {
        return {
          accessToken: tokenRes.data.access_token,
          refreshToken: tokenRes.data.refresh_token,
        };
      } else {
        throw new Error('Failed to get new access token');
      }
    } catch (tokenError) {
      Logger.error(`刷新百度统计 access token 失败: ${tokenError.message}`, tokenError.stack, 'StatisticService');
      throw new HttpException('获取新 accessToken 失败', HttpStatus.BAD_REQUEST);
    }
  }

  async updateAccessTokenInDatabase(accessToken: string, refreshToken: string, configEntity: any) {
    await configEntity.update({ configKey: 'baiduToken' }, { configVal: accessToken });
    await configEntity.update({ configKey: 'baiduRefreshToken' }, { configVal: refreshToken });
  }

  async getBaiduStatistics(days: number): Promise<{ date: string; count: number }[]> {
    const end_date = formatDate(new Date(), 'YYYYMMDD');
    const start_date = formatDate(
      new Date(Date.now() - Number(days - 1) * 24 * 60 * 60 * 1000),
      'YYYYMMDD',
    );
    const metrics = 'pv_count,visitor_count,ip_count,bounce_ratio,avg_visit_time';
    const method = 'overview/getTimeTrendRpt';

    const { baiduToken, baiduSiteId, baiduApiKey, baiduSecretKey, baiduRefreshToken } =
      await this.globalConfigService.getConfigs([
        'baiduToken',
        'baiduSiteId',
        'baiduApiKey',
        'baiduSecretKey',
        'baiduRefreshToken',
      ]);

    if (!baiduApiKey || !baiduSiteId || !baiduRefreshToken || !baiduSecretKey) {
      return [];
    }

    let accessToken = baiduToken;
    let res;
    let url;

    const fetchData = async (token: string) => {
      url = `https://openapi.baidu.com/rest/2.0/tongji/report/getData?access_token=${token}&site_id=${baiduSiteId}&method=${method}&start_date=${start_date}&end_date=${end_date}&metrics=${metrics}`;
      try {
        return await axios.get(url);
      } catch (error) {
        return {
          data: {
            error_code: 111,
            message: 'Access token invalid or no longer valid',
          },
        };
      }
    };

    res = await fetchData(accessToken);

    if (res.data.error_code === 111 || !baiduToken) {
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        await this.getNewAccessToken(baiduApiKey, baiduSecretKey, baiduRefreshToken);
      accessToken = newAccessToken;
      await this.updateAccessTokenInDatabase(accessToken, newRefreshToken, this.configEntity);
      res = await fetchData(accessToken);
    }

    const { error_code, message } = res.data;

    if (error_code && error_code !== 200) {
      throw new HttpException(message || '获取百度统计数据失败', HttpStatus.BAD_REQUEST);
    }

    // 格式化数据
    return res.data.result;
  }

  /* 订单总次数（仅已支付）  */
  async countOrders(): Promise<number> {
    const orderCount = await this.orderEntity.count({
      where: { status: 1 },
    });
    return orderCount;
  }

  /* 今日新增订单（仅已支付） */
  async countNewOrdersToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const queryBuilder = this.orderEntity.createQueryBuilder('order');
    const orderCount = await queryBuilder
      .where('order.status = :status', { status: 1 })
      .andWhere('order.createdAt >= :today', { today })
      .andWhere('order.createdAt < :tomorrow', { tomorrow })
      .getCount();
    return orderCount;
  }

  /* 统计一段时间内的订单数据 */
  async getOrderStatistic({ days = 7 }) {
    const orderData = await this.countOrdersByTimeRange(days);
    const amountData = await this.countOrderAmountsByTimeRange(days);
    return {
      date: orderData.map(item => item.date),
      orderCount: orderData.map((item: any) => item.value),
      orderAmount: amountData.map((item: any) => item.value),
    };
  }

  /* 统计一段时间内的订单数量（仅已支付） */
  async countOrdersByTimeRange(days: number): Promise<{ date: string; count: number }[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const queryBuilder = this.orderEntity.createQueryBuilder('order');
    const result = await queryBuilder
      .select(`DATE(order.createdAt) as date, COUNT(*) as count`)
      .where(`order.status = :status`, { status: 1 }) // 仅统计已支付订单
      .andWhere('order.createdAt >= :startDate', { startDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<{ date: string; count: number }>();
    const dailyData = [];
    const currentDate = startDate;
    for (let i = 0; i < days; i++) {
      const dateString = formatDate(new Date(currentDate), 'M.DD');
      const count =
        result.find((r: any) => formatDate(new Date(r.date), 'M.DD') === dateString)?.count ?? 0;
      if (count > 0) {
        dailyData.push({ date: dateString, value: Number(count) });
      } else {
        dailyData.push({ date: dateString, value: 0 });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dailyData;
  }

  /* 统计一段时间内的订单金额（仅已支付） */
  async countOrderAmountsByTimeRange(days: number): Promise<{ date: string; amount: number }[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const queryBuilder = this.orderEntity.createQueryBuilder('order');
    const result = await queryBuilder
      .select(`DATE(order.createdAt) as date, SUM(order.total) as amount`)
      .where(`order.status = :status`, { status: 1 }) // 仅统计已支付订单
      .andWhere('order.createdAt >= :startDate', { startDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<{ date: string; amount: number }>();
    const dailyData = [];
    const currentDate = startDate;
    for (let i = 0; i < days; i++) {
      const dateString = formatDate(new Date(currentDate), 'M.DD');
      const amount =
        result.find((r: any) => formatDate(new Date(r.date), 'M.DD') === dateString)?.amount ?? 0;
      if (amount > 0) {
        dailyData.push({ date: dateString, value: Number(amount) });
      } else {
        dailyData.push({ date: dateString, value: 0 });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dailyData;
  }
}
