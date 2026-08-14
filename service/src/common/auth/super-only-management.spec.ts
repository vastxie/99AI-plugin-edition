import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppController } from '../../modules/app/app.controller';
import { AutoReplyController } from '../../modules/autoReply/autoReply.controller';
import { BadWordsController } from '../../modules/badWords/badWords.controller';
import { ChatLogController } from '../../modules/chatLog/chatLog.controller';
import { CramiController } from '../../modules/crami/crami.controller';
import { GlobalConfigController } from '../../modules/globalConfig/globalConfig.controller';
import { MCPController } from '../../modules/mcp/mcp.controller';
import { MCPModule } from '../../modules/mcp/mcp.module';
import { ModelsController } from '../../modules/models/models.controller';
import { OrderController } from '../../modules/order/order.controller';
import { PresetController } from '../../modules/preset/preset.controller';
import { PresetCategoryController } from '../../modules/presetCategory/presetCategory.controller';
import { StatisticController } from '../../modules/statistic/statistic.controller';
import { UserController } from '../../modules/user/user.controller';
import { UserBalanceController } from '../../modules/userBalance/userBalance.controller';
import { SuperAuthGuard } from './superAuth.guard';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('super-only management surface', () => {
  const superOnlyMethods: Array<[any, string[]]> = [
    [
      AppController,
      [
        'appCatsList',
        'appList',
        'createAppCat',
        'updateAppCats',
        'delAppCat',
        'createApp',
        'updateApp',
        'delApp',
      ],
    ],
    [AutoReplyController, ['queryAutoReply', 'addAutoReply', 'updateAutoReply', 'delAutoReply']],
    [
      BadWordsController,
      [
        'getVocabularies',
        'queryWhitelist',
        'addWhitelist',
        'batchAddWhitelist',
        'delWhitelist',
        'updateWhitelist',
        'violation',
      ],
    ],
    [ChatLogController, ['queryAllChatLog']],
    [
      CramiController,
      [
        'createPackage',
        'updatePackage',
        'delPackage',
        'createCrami',
        'queryAllCrami',
        'delCrami',
        'batchDelCrami',
        'queryCramiUseDetail',
      ],
    ],
    [
      GlobalConfigController,
      ['queryAllConfig', 'queryConfig', 'setConfig', 'getPaymentChannelStatus', 'testBaiduConfig'],
    ],
    [
      ModelsController,
      [
        'setModel',
        'delModel',
        'queryModels',
        'queryModelType',
        'setModelType',
        'delModelType',
        'formatCustomConfig',
        'getDrawingModels',
      ],
    ],
    [OrderController, ['queryAllOrder', 'deleteOrder', 'deleteNotPay']],
    [
      PresetController,
      [
        'findAll',
        'searchApps',
        'searchPlugins',
        'searchAppAndPlugin',
        'findOne',
        'create',
        'update',
        'remove',
        'updateOrder',
      ],
    ],
    [PresetCategoryController, ['findAll', 'findOne', 'create', 'update', 'remove', 'updateOrder']],
    [
      StatisticController,
      ['getBaseStatistic', 'getChatStatistic', 'getBaiduStatistics', 'getOrderStatistic'],
    ],
    [UserController, ['userRecharge', 'queryAll', 'updateStatus', 'resetUserPass']],
    [UserBalanceController, ['getAccountLog']],
  ];

  const userFacingMethods: Array<[any, string[]]> = [
    [ModelsController, ['modelsList', 'baseConfig']],
    [PresetController, ['getUserPresets', 'incrementUsage']],
    [CramiController, ['queryOnePackage', 'queryAllPackage', 'useCrami']],
    [GlobalConfigController, ['queryFrontConfig', 'queryNotice', 'getAvailablePaymentMethods']],
  ];

  it('keeps management endpoints behind SuperAuthGuard', () => {
    for (const [ControllerClass, methodNames] of superOnlyMethods) {
      for (const methodName of methodNames) {
        const guards =
          Reflect.getMetadata(GUARDS_METADATA, ControllerClass.prototype[methodName]) || [];

        expect(guards).toContain(SuperAuthGuard);
      }
    }
  });

  it('does not accidentally make user-facing endpoints super-only', () => {
    for (const [ControllerClass, methodNames] of userFacingMethods) {
      for (const methodName of methodNames) {
        const guards =
          Reflect.getMetadata(GUARDS_METADATA, ControllerClass.prototype[methodName]) || [];

        expect(guards).not.toContain(SuperAuthGuard);
      }
    }
  });

  it('does not register the removed MCP metrics controller', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MCPModule) || [];

    expect(controllers).toEqual([MCPController]);
    expect(existsSync(join(process.cwd(), 'src/common/auth/adminAuth.guard.ts'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'src/modules/mcp/mcpTool.controller.ts'))).toBe(false);
  });

  it('does not grant old admin role super-only privileges', async () => {
    const guard = new SuperAuthGuard(
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 1, role: 'admin' } }),
      }),
    };

    await expect(guard.canActivate(context as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
