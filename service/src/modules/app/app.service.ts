import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { In, IsNull, Like, MoreThan, Not, Repository } from 'typeorm';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { AppEntity } from './app.entity';
import { AppCatsEntity } from './appCats.entity';
import { CollectAppDto } from './dto/collectApp.dto';
import { CreateAppDto } from './dto/createApp.dto';
import { CreateCatsDto } from './dto/createCats.dto';
import { OperateAppDto } from './dto/deleteApp.dto';
import { DeleteCatsDto } from './dto/deleteCats.dto';
import { QuerAppDto } from './dto/queryApp.dto';
import { QuerCatsDto } from './dto/queryCats.dto';
import { UpdateAppDto } from './dto/updateApp.dto';
import { UpdateCatsDto } from './dto/updateCats.dto';
import { UserAppsEntity } from './userApps.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(AppCatsEntity)
    private readonly appCatsEntity: Repository<AppCatsEntity>,
    @InjectRepository(AppEntity)
    private readonly appEntity: Repository<AppEntity>,
    @InjectRepository(UserAppsEntity)
    private readonly userAppsEntity: Repository<UserAppsEntity>,
    private readonly userBalanceService: UserBalanceService,
  ) {}

  private getAccessibleAppWhere(
    appId: number | ReturnType<typeof In>,
    actor?: { id?: string | number; role?: string },
  ) {
    const base = { id: appId, status: In([1, 4]) };
    if (actor?.role === 'super') {
      return [base];
    }

    const where: any[] = [
      { ...base, userId: IsNull() },
      { ...base, userId: MoreThan(0), public: true },
    ];
    const actorId = Number(actor?.id);
    if (actor?.role !== 'visitor' && Number.isSafeInteger(actorId) && actorId > 0) {
      where.push({ ...base, userId: actorId });
    }
    return where;
  }

  /**
   * 用户侧统一的应用访问边界：启用的系统应用、已公开应用或本人应用。
   * 超级管理员仍需遵守启用状态，避免误执行已下架配置。
   */
  async getAccessibleApp(appId: number, actor?: { id?: string | number; role?: string }) {
    if (!Number.isSafeInteger(Number(appId)) || Number(appId) <= 0) {
      throw new HttpException('应用不存在或无权访问！', HttpStatus.FORBIDDEN);
    }

    const app = await this.appEntity.findOne({
      where: this.getAccessibleAppWhere(Number(appId), actor),
    });
    if (!app) {
      throw new HttpException('应用不存在或无权访问！', HttpStatus.FORBIDDEN);
    }
    return app;
  }

  async getAccessibleApps(
    appIds: Array<string | number>,
    actor?: { id?: string | number; role?: string },
  ) {
    const normalizedIds = Array.from(
      new Set(
        appIds
          .map(id => Number(id))
          .filter(id => Number.isSafeInteger(id) && id > 0),
      ),
    );
    if (normalizedIds.length === 0) return [];

    return this.appEntity.find({
      where: this.getAccessibleAppWhere(In(normalizedIds), actor),
    });
  }

  async createAppCat(body: CreateCatsDto) {
    const { name } = body;
    const c = await this.appCatsEntity.findOne({ where: { name } });
    if (c) {
      throw new HttpException('该分类名称已存在！', HttpStatus.BAD_REQUEST);
    }
    return await this.appCatsEntity.save(body);
  }

  async delAppCat(body: DeleteCatsDto) {
    const { id } = body;
    const c = await this.appCatsEntity.findOne({ where: { id } });
    if (!c) {
      throw new HttpException('该分类不存在！', HttpStatus.BAD_REQUEST);
    }
    // 查找所有包含该分类ID的App
    const apps = await this.appEntity.find();
    const appsWithThisCat = apps.filter(app => {
      const catIds = app.catId.split(',');
      return catIds.includes(id.toString());
    });

    if (appsWithThisCat.length > 0) {
      throw new HttpException('该分类下存在App，不可删除！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.appCatsEntity.delete(id);
    if (res.affected > 0) return '删除成功';
    throw new HttpException('删除失败！', HttpStatus.BAD_REQUEST);
  }

  async updateAppCats(body: UpdateCatsDto) {
    const { id, name } = body;
    const bodyData = body as any;

    // 检查分类是否存在
    const existingCat = await this.appCatsEntity.findOne({ where: { id } });
    if (!existingCat) {
      throw new HttpException('分类不存在！', HttpStatus.BAD_REQUEST);
    }
    const existingCatData = existingCat as any;

    // 只在传入 name 且与原值不同时才进行重名检查
    if (name !== undefined && name !== existingCat.name) {
      const c = await this.appCatsEntity.findOne({
        where: { name, id: Not(id) },
      });
      if (c) {
        throw new HttpException('该分类名称已存在！', HttpStatus.BAD_REQUEST);
      }
    }

    // 只更新传入的字段
    if (name !== undefined) existingCat.name = name;
    if (bodyData.des !== undefined) existingCatData.des = bodyData.des;
    if (bodyData.coverImg !== undefined) existingCatData.coverImg = bodyData.coverImg;
    if (bodyData.order !== undefined) existingCat.order = bodyData.order;
    if (bodyData.status !== undefined) existingCat.status = bodyData.status;
    if (bodyData.isMember !== undefined) existingCatData.isMember = bodyData.isMember;
    if (bodyData.hideFromNonMember !== undefined)
      existingCatData.hideFromNonMember = bodyData.hideFromNonMember;

    const res = await this.appCatsEntity.save(existingCat);
    if (res) return '修改成功';
    throw new HttpException('修改失败！', HttpStatus.BAD_REQUEST);
  }

  async queryOneCat(params, req?: Request) {
    const { id } = params;
    if (!id) {
      throw new HttpException('缺失必要参数！', HttpStatus.BAD_REQUEST);
    }
    const app = await this.getAccessibleApp(Number(id), req?.user);

    const appData = app as any;
    return {
      coverImg: appData.coverImg,
      des: appData.des,
      name: appData.name,
      isGPTs: appData.isGPTs,
      isFlowith: appData.isFlowith,
      flowithId: appData.flowithId,
      flowithName: appData.flowithName,

      isFixedModel: appData.isFixedModel,
      appModel: appData.appModel,
      backgroundImg: appData.backgroundImg,
      prompt: appData.prompt,
    };
  }

  async appCatsList(query: QuerCatsDto, req?: Request) {
    const { page = 1, size = 10, name, status } = query;
    const where: any = {};
    name && (where.name = Like(`%${name}%`));
    [0, 1, '0', '1'].includes(status) && (where.status = status);

    const [rows, count] = await this.appCatsEntity.findAndCount({
      where,
      order: { order: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    // 如果是超级管理员，跳过过滤逻辑
    let filteredRows = [...rows];
    if (req?.user?.role !== 'super') {
      // 获取用户的分类ID列表
      const userCatIds =
        req?.user?.role === 'visitor'
          ? []
          : await this.userBalanceService.getUserApps(Number(req.user.id));
      const userCatIdsSet = new Set(userCatIds);

      // 过滤分类：如果分类ID在用户的分类ID列表中则保留，否则检查是否需要隐藏
      filteredRows = rows.filter(cat => {
        // 如果分类ID在用户的分类ID列表中，保留它
        if (userCatIdsSet.has(cat.id.toString())) {
          return true;
        }
        // 只过滤掉设置了hideFromNonMember的分类，不考虑isMember属性
        return cat.hideFromNonMember !== 1;
      });
    }

    // 优化：使用数据库级别COUNT查询统计App数量，避免加载所有App数据
    const catIds = filteredRows.map(item => item.id);

    // 使用 SQL 原生查询统计每个分类下的App数量
    const appCountResults = await this.appEntity
      .createQueryBuilder('app')
      .select('app.catId', 'catIds')
      .addSelect('COUNT(*)', 'count')
      .where('app.status = :status', { status: 1 }) // 只统计正常状态的App
      .groupBy('app.catId')
      .getRawMany();

    // 构建分类计数映射
    const appCountMap = {};
    catIds.forEach(id => {
      appCountMap[id] = 0;
    });

    appCountResults.forEach(result => {
      const catIdList = result.catIds.split(',');
      catIdList.forEach(catId => {
        const catIdNum = Number(catId.trim());
        if (catIds.includes(catIdNum)) {
          appCountMap[catIdNum] = (appCountMap[catIdNum] || 0) + parseInt(result.count);
        }
      });
    });

    filteredRows.forEach((item: any) => (item.appCount = appCountMap[item.id] || 0));

    // 删除时间字段
    filteredRows.forEach((item: any) => {
      delete item.createdAt;
      delete item.updatedAt;
      delete item.deletedAt;
    });

    return { rows: filteredRows, count: filteredRows.length };
  }

  async appList(req: Request, query: QuerAppDto, orderKey = 'id') {
    const { page = 1, size = 10, name, status, catId, role } = query;
    const where: any = {};
    name && (where.name = Like(`%${name}%`));
    // 如果指定了分类ID，则查找包含该分类ID的App
    let filteredByCategory = null;
    if (catId) {
      const apps = await this.appEntity.find();
      filteredByCategory = apps
        .filter(app => {
          const appCatIds = app.catId.split(',');
          return appCatIds.includes(catId.toString());
        })
        .map(app => app.id);

      if (filteredByCategory.length === 0) {
        return { rows: [], count: 0 };
      }
      where.id = In(filteredByCategory);
    }

    role && (where.role = role);
    status && (where.status = status);
    const queryBuilder = this.appEntity
      .createQueryBuilder('app')
      .addSelect('app.flowithKey')
      .orderBy(`app.${orderKey === 'order' ? 'order' : 'id'}`, 'DESC')
      .skip((page - 1) * size)
      .take(size);
    if (name) queryBuilder.andWhere('app.name LIKE :name', { name: `%${name}%` });
    if (filteredByCategory) {
      queryBuilder.andWhere('app.id IN (:...filteredByCategory)', { filteredByCategory });
    }
    if (role) queryBuilder.andWhere('app.role = :role', { role });
    if ([0, 1, 4, '0', '1', '4'].includes(status as any)) {
      queryBuilder.andWhere('app.status = :status', { status: Number(status) });
    }
    const [rows, count] = await queryBuilder.getManyAndCount();

    // 获取所有分类信息
    const allCats = await this.appCatsEntity.find();
    const catsMap = {};
    allCats.forEach(cat => {
      catsMap[cat.id] = cat;
    });

    // 为每个App添加分类名称
    rows.forEach((item: any) => {
      const catIds = item.catId.split(',');
      const catNames = catIds
        .map(id => {
          const cat = catsMap[Number(id)];
          return cat ? cat.name : '';
        })
        .filter(name => name);

      item.catName = catNames.join(', ');
      item.backgroundImg = item.backgroundImg;
      item.prompt = item.prompt;
    });

    if (req?.user?.role !== 'super') {
      rows.forEach((item: any) => {
        delete item.preset;
      });
    }
    return { rows, count };
  }

  async frontAppList(req: Request, query: QuerAppDto, orderKey = 'id') {
    const { page = 1, size = 1000, catId } = query;
    const where: any = [
      {
        status: In([1, 4]),
        userId: IsNull(),
        public: false,
      },
      { status: In([1, 4]), userId: MoreThan(0), public: true },
    ];

    const userCatIds =
      req.user.role === 'visitor'
        ? []
        : await this.userBalanceService.getUserApps(Number(req.user.id));
    const userCatIdsSet = new Set(userCatIds);

    // 如果指定了分类ID，则过滤包含该分类ID的App
    if (catId) {
      const apps = await this.appEntity.find();
      const filteredByCategory = apps
        .filter(app => {
          const appCatIds = app.catId.split(',');
          return appCatIds.includes(catId.toString());
        })
        .map(app => app.id);

      if (filteredByCategory.length === 0) {
        return { rows: [], count: 0 };
      }

      // 修改查询条件，只查询包含指定分类ID的App
      where[0].id = In(filteredByCategory);
      where[1].id = In(filteredByCategory);
    }

    const [rows, count] = await this.appEntity.findAndCount({
      where,
      order: { order: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    // 获取所有分类信息
    const allCats = await this.appCatsEntity.find();
    const catsMap = {};
    allCats.forEach(cat => {
      catsMap[cat.id] = cat;
    });

    // 如果是超级管理员，跳过过滤逻辑
    let filteredRows = [...rows];
    if (req?.user?.role !== 'super') {
      // 过滤应用：如果应用的分类ID在用户的 userCatIds 中则保留，否则检查是否需要隐藏
      filteredRows = rows.filter(app => {
        // 获取应用所属的所有分类
        const appCatIds = app.catId.split(',').map(id => Number(id));

        // 检查应用是否属于用户拥有的任何分类
        for (const catId of appCatIds) {
          if (userCatIdsSet.has(catId.toString())) {
            return true;
          }
        }

        // 检查应用的分类是否有会员专属且对非会员隐藏的
        for (const catId of appCatIds) {
          const cat = catsMap[catId];
          if (cat && cat.isMember === 1 && cat.hideFromNonMember === 1) {
            return false; // 过滤掉这个应用
          }
        }
        return true; // 保留这个应用
      });
    }

    // 为每个App添加分类名称
    filteredRows.forEach((item: any) => {
      const appCatIds = item.catId.split(',');
      const catNames = appCatIds
        .map(id => {
          const cat = catsMap[Number(id)];
          return cat ? cat.name : '';
        })
        .filter(name => name);

      item.catName = catNames.join(',');
      item.backgroundImg = item.backgroundImg;
    });

    // 删除不需要的敏感字段和时间字段
    filteredRows.forEach((item: any) => {
      // 删除 preset 字段（用户端完全不需要）
      delete item.preset;
      // 删除知识库配置
      delete item.knowledgeBaseUrls;
      // 删除时间字段
      delete item.createdAt;
      delete item.updatedAt;
      delete item.deletedAt;
    });

    return { rows: filteredRows, count: filteredRows.length };
  }

  async searchAppList(body: { page?: number; size?: number; keyword?: string; catId?: string; userId: number; role: string }) {
    const { page = 1, size = 1000, keyword, catId, userId, role } = body;

    // 基础查询条件
    let baseWhere: any = [
      {
        status: In([1, 4]),
        userId: IsNull(),
        public: false,
      },
      { status: In([1, 4]), userId: MoreThan(0), public: true },
    ];

    // 如果存在关键字，修改查询条件以搜索 name
    if (keyword) {
      baseWhere = baseWhere.map(condition => ({
        ...condition,
        name: Like(`%${keyword}%`),
      }));
    }

    // 如果指定了分类ID，则过滤包含该分类ID的App
    if (catId && !isNaN(Number(catId))) {
      const apps = await this.appEntity.find();
      const filteredByCategory = apps
        .filter(app => {
          const appCatIds = app.catId.split(',');
          return appCatIds.includes(catId.toString());
        })
        .map(app => app.id);

      if (filteredByCategory.length === 0) {
        return { rows: [], count: 0 };
      }

      baseWhere = baseWhere.map(condition => ({
        ...condition,
        id: In(filteredByCategory),
      }));
    }

    try {
      // 确保 userId 是有效数字
      const userIdNum = isNaN(Number(userId)) ? 0 : Number(userId);

      // 获取用户的分类ID列表
      const userCatIds = await this.userBalanceService.getUserApps(userIdNum);
      const userCatIdsSet = new Set(userCatIds);

      const [rows, count] = await this.appEntity.findAndCount({
        where: baseWhere,
        skip: (page - 1) * size,
        take: size,
      });

      // 获取所有分类信息
      const allCats = await this.appCatsEntity.find();
      const catsMap = {};
      allCats.forEach(cat => {
        catsMap[cat.id] = cat;
      });

      // 如果是超级管理员，跳过过滤逻辑
      let filteredRows = [...rows];
      if (role !== 'super') {
        // 过滤应用：如果应用的分类在用户的分类ID列表中则保留，否则检查是否需要隐藏
        filteredRows = rows.filter(app => {
          // 获取应用所属的所有分类
          const appCatIds = app.catId.split(',').map(id => Number(id));

          // 检查应用是否属于用户拥有的任何分类
          for (const catId of appCatIds) {
            if (userCatIdsSet.has(catId.toString())) {
              return true; // 保留这个应用
            }
          }

          // 检查应用的分类是否有会员专属且对非会员隐藏的
          for (const catId of appCatIds) {
            const cat = catsMap[catId];
            if (cat && cat.isMember === 1 && cat.hideFromNonMember === 1) {
              return false; // 过滤掉这个应用
            }
          }
          return true; // 保留这个应用
        });
      }

      // 为每个App添加分类名称
      filteredRows.forEach((item: any) => {
        const appCatIds = item.catId.split(',');
        const catNames = appCatIds
          .map(id => {
            const cat = catsMap[Number(id)];
            return cat ? cat.name : '';
          })
          .filter(name => name);

        item.catName = catNames.join(', ');
        item.backgroundImg = item.backgroundImg;
        item.prompt = item.prompt;

        // 删除不需要的敏感字段和时间字段
        // 删除 preset 字段（用户端完全不需要）
        delete item.preset;
        // 删除知识库配置
        delete item.knowledgeBaseUrls;
        // 删除时间字段
        delete item.createdAt;
        delete item.updatedAt;
        delete item.deletedAt;
      });

      return { rows: filteredRows, count: filteredRows.length };
    } catch (error) {
      throw new HttpException('查询应用列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async createApp(body: CreateAppDto) {
    const { name, catId } = body;
    body.role = 'system';

    // 检查应用名称是否已存在
    const a = await this.appEntity.findOne({ where: { name } });
    if (a) {
      throw new HttpException('该应用名称已存在！', HttpStatus.BAD_REQUEST);
    }

    // 验证所有分类ID是否存在
    if (!catId) {
      throw new HttpException('缺少分类ID！', HttpStatus.BAD_REQUEST);
    }

    const catIds = catId.split(',');
    for (const id of catIds) {
      const numId = Number(id);
      if (isNaN(numId)) {
        throw new HttpException(`分类ID ${id} 不是有效的数字！`, HttpStatus.BAD_REQUEST);
      }

      const c = await this.appCatsEntity.findOne({ where: { id: numId } });
      if (!c) {
        throw new HttpException(`分类ID ${id} 不存在！`, HttpStatus.BAD_REQUEST);
      }
    }

    try {
      // 添加必要的默认字段
      const saveData: any = { ...body };

      // 检查ID是否有效，如果无效则删除
      if (!saveData.id || isNaN(Number(saveData.id))) {
        delete saveData.id;
      }

      saveData.public = false;

      // 设置默认值
      saveData.appModel = saveData.appModel || '';
      saveData.order = isNaN(Number(saveData.order)) ? 100 : saveData.order;
      saveData.status = isNaN(Number(saveData.status)) ? 1 : saveData.status;
      saveData.isGPTs = isNaN(Number(saveData.isGPTs)) ? 0 : saveData.isGPTs;
      saveData.isFlowith = isNaN(Number(saveData.isFlowith)) ? 0 : saveData.isFlowith;
      saveData.flowithId = saveData.flowithId || '';
      saveData.flowithName = saveData.flowithName || '';
      saveData.flowithKey = saveData.flowithKey || '';
      saveData.isFixedModel = isNaN(Number(saveData.isFixedModel)) ? 0 : saveData.isFixedModel;
      saveData.backgroundImg = saveData.backgroundImg || '';
      saveData.prompt = saveData.prompt || '';
      saveData.knowledgeBaseUrls = saveData.knowledgeBaseUrls || '';

      // 保存应用
      return await this.appEntity.save(saveData);
    } catch (error) {
      throw new HttpException(`保存应用失败`, HttpStatus.BAD_REQUEST);
    }
  }

  async updateApp(body: UpdateAppDto) {
    const { id, name, catId, status } = body;

    // 验证ID是否有效
    if (id === undefined || id === null || isNaN(Number(id))) {
      throw new HttpException('无效的应用ID！', HttpStatus.BAD_REQUEST);
    }

    // 获取当前应用信息
    const curApp = await this.appEntity.findOne({ where: { id } });
    if (!curApp) {
      throw new HttpException('应用不存在！', HttpStatus.BAD_REQUEST);
    }

    // 只在传入 name 且与原值不同时才进行重名检查
    if (name !== undefined && name !== curApp.name) {
      const a = await this.appEntity.findOne({ where: { name, id: Not(id) } });
      if (a) {
        throw new HttpException('该应用名称已存在！', HttpStatus.BAD_REQUEST);
      }
    }

    // 验证所有分类ID是否存在（只在传入 catId 时验证）
    if (catId !== undefined) {
      const catIds = catId.split(',');
      for (const id of catIds) {
        const c = await this.appCatsEntity.findOne({ where: { id: Number(id) } });
        if (!c) {
          throw new HttpException(`分类ID ${id} 不存在！`, HttpStatus.BAD_REQUEST);
        }
      }
    }

    // 将 body 转换为 any 以访问未在 DTO 中定义的字段
    const bodyData = body as any;

    // 只更新传入的字段
    if (name !== undefined) curApp.name = name;
    if (catId !== undefined) curApp.catId = catId;
    if (body.des !== undefined) curApp.des = body.des;
    if (body.preset !== undefined) curApp.preset = body.preset;
    if (body.coverImg !== undefined) curApp.coverImg = body.coverImg;
    if (body.order !== undefined) curApp.order = Number(body.order);
    if (status !== undefined) curApp.status = Number(status);
    if (body.isGPTs !== undefined) curApp.isGPTs = Number(body.isGPTs);
    if (bodyData.isFixedModel !== undefined) curApp.isFixedModel = Number(bodyData.isFixedModel);
    if (bodyData.appModel !== undefined) curApp.appModel = bodyData.appModel;
    if (body.gizmoID !== undefined) curApp.gizmoID = body.gizmoID;
    if (body.isFlowith !== undefined) curApp.isFlowith = Number(body.isFlowith);
    if (body.flowithId !== undefined) curApp.flowithId = body.flowithId;
    if (body.flowithName !== undefined) curApp.flowithName = body.flowithName;
    if (body.flowithKey !== undefined) curApp.flowithKey = body.flowithKey;
    if (bodyData.backgroundImg !== undefined) curApp.backgroundImg = bodyData.backgroundImg;
    if (bodyData.prompt !== undefined) curApp.prompt = bodyData.prompt;
    if (bodyData.knowledgeBaseUrls !== undefined)
      curApp.knowledgeBaseUrls = bodyData.knowledgeBaseUrls;

    // 如果状态发生变化，同步更新用户应用表
    const curAppData = curApp as any;
    const originalStatus = await this.appEntity.findOne({ where: { id }, select: ['status'] });
    if (status !== undefined && originalStatus.status !== status) {
      await this.userAppsEntity.update({ appId: id }, { status: Number(status) });
    }

    const res = await this.appEntity.save(curApp);
    if (res) return '修改App信息成功';
    throw new HttpException('修改App信息失败！', HttpStatus.BAD_REQUEST);
  }

  async delApp(body: OperateAppDto) {
    const { id } = body;
    const a = await this.appEntity.findOne({ where: { id } });
    if (!a) {
      throw new HttpException('该应用不存在！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.appEntity.delete(id);
    if (res.affected > 0) return '删除App成功';
    throw new HttpException('删除App失败！', HttpStatus.BAD_REQUEST);
  }

  async collect(body: CollectAppDto, req: Request) {
    const { appId } = body;
    const { id: userId } = req.user;

    // 验证参数
    if (appId === undefined || appId === null || isNaN(Number(appId))) {
      throw new HttpException('无效的应用ID！', HttpStatus.BAD_REQUEST);
    }

    if (userId === undefined || userId === null || isNaN(Number(userId))) {
      throw new HttpException('无效的用户ID！', HttpStatus.BAD_REQUEST);
    }

    const historyApp = await this.userAppsEntity.findOne({
      where: { appId, userId },
    });
    if (historyApp) {
      const r = await this.userAppsEntity.delete({ appId, userId });
      if (r.affected > 0) {
        return '取消收藏成功!';
      } else {
        throw new HttpException('取消收藏失败！', HttpStatus.BAD_REQUEST);
      }
    }

    const app = await this.getAccessibleApp(Number(appId), req.user);

    const { id, role: appRole, catId } = app;
    const collectInfo = {
      userId,
      appId: id,
      catId,
      appRole,
      public: true,
      status: 1,
    };
    await this.userAppsEntity.save(collectInfo);
    return '已将应用加入到我的收藏！';
  }

  async mineApps(req: Request, query = { page: 1, size: 30 }) {
    const { id } = req.user;
    const { page = 1, size = 30 } = query;
    let filteredRows = [];

    try {
      // 获取用户的分类ID列表
      const userCatIds =
        req.user.role === 'visitor' ? [] : await this.userBalanceService.getUserApps(Number(id));
      const userCatIdsSet = new Set(userCatIds);

      const [rows, count] = await this.userAppsEntity.findAndCount({
        where: { userId: id, status: In([1, 3, 4, 5]) },
        order: { id: 'DESC' },
        skip: (page - 1) * size,
        take: size,
      });

      const appIds = rows.map(item => item.appId);
      const appsInfo = await this.getAccessibleApps(appIds, req.user);
      const accessibleAppIds = new Set(appsInfo.map(app => app.id));
      filteredRows = rows.filter(item => accessibleAppIds.has(item.appId));

      // 获取所有分类信息
      const allCats = await this.appCatsEntity.find();
      const catsMap = {};
      allCats.forEach(cat => {
        catsMap[cat.id] = cat;
      });

      // 如果是超级管理员，跳过过滤逻辑
      if (req?.user?.role !== 'super') {
        filteredRows = filteredRows.filter(item => {
          const app = appsInfo.find(c => c.id === item.appId);
          if (!app) return false;

          // 获取应用所属的所有分类
          const appCatIds = app.catId.split(',').map(id => Number(id));

          // 检查应用是否属于用户拥有的任何分类
          for (const catId of appCatIds) {
            if (userCatIdsSet.has(catId.toString())) {
              return true;
            }
          }

          // 检查应用的分类是否有会员专属且对非会员隐藏的
          for (const catId of appCatIds) {
            const cat = catsMap[catId];
            if (cat && cat.isMember === 1 && cat.hideFromNonMember === 1) {
              return false; // 过滤掉这个应用
            }
          }
          return true; // 保留这个应用
        });
      }

      // 为每个应用添加详细信息
      filteredRows.forEach((item: any) => {
        const app = appsInfo.find(c => c.id === item.appId);
        if (!app) return;

        item.appName = app.name || '';
        item.appRole = app.role || '';
        item.appDes = app.des || '';
        item.coverImg = app.coverImg || '';
        item.backgroundImg = app.backgroundImg || '';

        // 添加分类名称
        const appCatIds = app.catId.split(',');
        const catNames = appCatIds
          .map(id => {
            const cat = catsMap[Number(id)];
            return cat ? cat.name : '';
          })
          .filter(name => name);
        item.catName = catNames.join(',');

        // 删除 preset 字段（用户端完全不需要）
        // item.preset = app.userId === id ? app.preset : '******';
        item.prompt = app.prompt || '';

        // 删除不需要的时间字段
        delete item.createdAt;
        delete item.updatedAt;
        delete item.deletedAt;
      });
    } catch (error) {
      throw new HttpException('获取用户应用列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { rows: filteredRows, count: filteredRows.length };
  }

  /**
   * 检查应用是否是会员专属
   * @param appId 应用ID
   * @returns 返回应用是否是会员专属的布尔值
   */
  async checkAppIsMemberOnly(appId: number): Promise<boolean> {
    try {
      // 查询应用信息
      const appInfo = await this.appEntity.findOne({
        where: { id: appId },
        select: ['catId'],
      });

      if (!appInfo || !appInfo.catId) {
        return false;
      }

      // 解析分类ID列表
      const catIds = appInfo.catId
        .split(',')
        .map(id => Number(id.trim()))
        .filter(id => id > 0);

      if (catIds.length === 0) {
        return false;
      }

      // 查询这些分类是否有会员专属的
      const cats = await this.appCatsEntity.find({
        where: { id: In(catIds) },
        select: ['id', 'isMember'],
      });

      // 检查是否有任何一个分类是会员专属的
      return cats.some(cat => cat.isMember === 1);
    } catch (error) {
      return false; // 出错时默认返回非会员专属
    }
  }
}
