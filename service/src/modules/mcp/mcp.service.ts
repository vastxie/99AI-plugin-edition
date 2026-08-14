import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as cron from 'node-cron';
import { Repository } from 'typeorm';
import { handleError } from '../../common/utils';
import { MCPConfigEntity } from './mcp.entity';
import { isMcpToolAllowed, McpActor } from './mcpAuthorization';

interface ServerConfig {
  name: string;
  displayName: string;
  type: number; // 1: stdio, 2: sse
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled: boolean;
}

const STDIO_ENV_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'NPM_CONFIG_PREFIX',
  'NPM_CONFIG_CACHE',
  'npm_config_prefix',
  'npm_config_cache',
]);

export function buildSafeStdioEnv(
  configEnv: Record<string, string> = {},
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const safeEnv: Record<string, string> = {};

  for (const key of STDIO_ENV_ALLOWLIST) {
    const value = baseEnv[key];
    if (typeof value === 'string') {
      safeEnv[key] = value;
    }
  }

  return { ...safeEnv, ...(configEnv || {}) };
}

class MCPClient {
  client: any;
  tools: any[] = [];
  resources: any[] = [];
  prompts: any[] = [];
  status: string = 'disconnected';
  serverConfig: ServerConfig;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  type: number;
  disabled: boolean;
  private reconnectDelay = 5000; // 初始重连延迟 5 秒
  private maxReconnectDelay = 60000; // 最大重连延迟 60 秒
  private reconnectAttempts = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private mcpConfigRepository: Repository<MCPConfigEntity>;
  private updateDbTimeoutId: NodeJS.Timeout | null = null; // Add timeout ID for debounce
  private readonly debounceDbUpdateDelay: number = 2000; // 2 seconds debounce delay

  constructor(
    public name: string,
    serverConfig: ServerConfig,
    repository: Repository<MCPConfigEntity>,
  ) {
    this.serverConfig = serverConfig;
    this.type = serverConfig.type || 1;
    this.command = serverConfig.command || 'npx';
    this.args = serverConfig.args || [];
    this.env = serverConfig.env || {};
    this.url = serverConfig.url || '';
    this.headers = serverConfig.headers || {};
    this.disabled = serverConfig.disabled || false;
    this.mcpConfigRepository = repository;
  }

  async callTool(functionName: string, args: any) {
    // Logger.debug(`在客户端 ${this.name} 上调用工具 ${functionName}`, 'MCPService'); // 可选：取消注释以进行详细追踪
    if (this.status === 'disconnected') {
      Logger.warn(
        `客户端 ${this.name} 已断开。在调用工具 ${functionName} 前尝试重新连接。`,
        'MCPService',
      );
      await this.open();
    }
    try {
      return await this.client.callTool({
        name: functionName,
        arguments: args,
      });
    } catch (error) {
      Logger.error(
        `MCP 工具调用错误 (客户端: ${this.name}, 工具: ${functionName}): ${handleError(error)}`,
        'MCPService',
      );
      throw error;
    }
  }

  async callResource(uri: string) {
    // Logger.debug(`在客户端 ${this.name} 上调用资源 ${uri}`, 'MCPService'); // 可选
    if (this.status === 'disconnected') {
      Logger.warn(`客户端 ${this.name} 已断开。在调用资源 ${uri} 前尝试重新连接。`, 'MCPService');
      await this.open();
    }
    try {
      return await this.client.readResource({ uri });
    } catch (error) {
      Logger.error(
        `MCP 资源调用错误 (客户端: ${this.name}, URI: ${uri}): ${handleError(error)}`,
        'MCPService',
      );
      throw error;
    }
  }

  async callPrompt(promptName: string, args: any) {
    // Logger.debug(`在客户端 ${this.name} 上调用提示 ${promptName}`, 'MCPService'); // 可选
    if (this.status === 'disconnected') {
      Logger.warn(
        `客户端 ${this.name} 已断开。在调用提示 ${promptName} 前尝试重新连接。`,
        'MCPService',
      );
      await this.open();
    }
    try {
      return await this.client.getPrompt({ name: promptName, arguments: args });
    } catch (error) {
      Logger.error(
        `MCP 提示调用错误 (客户端: ${this.name}, 提示: ${promptName}): ${handleError(error)}`,
        'MCPService',
      );
      throw error;
    }
  }

  async open() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    try {
      // Logger.debug(`正在为 MCP 客户端 ${this.name} 打开连接...`, 'MCPService');
      if (this.type === 2) {
        await this.openSSE();
      } else {
        await this.openStdio(this.serverConfig);
      }

      if (!this.client) {
        throw new Error(`客户端 ${this.name} 在尝试打开后连接未建立。`);
      }

      const [toolsRes, resourcesRes, promptsRes] = await Promise.all([
        this.client.listTools().catch(() => ({ tools: [] })),
        this.client.listResources().catch(() => ({ resources: [] })),
        this.client.listPrompts().catch(() => ({ prompts: [] })),
      ]);

      this.client.onclose = () => {
        // Don't schedule reconnect if already scheduled by onerror
        if (!this.reconnectTimeoutId) {
          Logger.warn(
            `MCP 客户端 ${this.name} 连接已关闭。将在 ${
              this.reconnectDelay / 1000
            } 秒后尝试重连...`,
            'MCPService',
          );
          this.scheduleReconnect(); // 连接关闭时安排重连
        } else {
          Logger.warn(
            `MCP 客户端 ${this.name} 连接已关闭，但重连已由 onerror 安排。`,
            'MCPService',
          );
        }
        this.status = 'disconnected';
        this.tools = [];
        this.resources = [];
        this.prompts = [];
      };

      this.client.onerror = (e: any) => {
        let errorDetails = 'undefined';
        if (e instanceof Error) {
          errorDetails = `Error: ${e.message}${e.stack ? ' Stack: ' + e.stack : ''}`;
        } else if (typeof e === 'object' && e !== null) {
          errorDetails = JSON.stringify(e);
        } else {
          errorDetails = String(e);
        }
        Logger.error(`MCP 客户端 ${this.name} 报告错误: ${errorDetails}`, 'MCPService');

        // 标记状态并主动触发重连
        this.status = 'error';
        if (!this.reconnectTimeoutId) {
          // 避免重复调度
          Logger.warn(
            `由于错误，客户端 ${this.name} 将在 ${this.reconnectDelay / 1000} 秒后尝试重连...`,
            'MCPService',
          );
          this.scheduleReconnect();
        } else {
          // Logger.debug(`客户端 ${this.name} 遇到错误，但重连已在计划中。`, 'MCPService');
        }
      };

      this.tools = toolsRes.tools;
      this.resources = resourcesRes.resources;
      this.prompts = promptsRes.prompts;
      this.status = 'connected';
      this.reconnectAttempts = 0; // 连接成功，重置尝试次数
      this.reconnectDelay = 5000; // 连接成功，重置延迟

      await this.updateSelfStatsInDb();
    } catch (error) {
      this.status = 'error';
      Logger.error(
        `MCP 客户端 ${this.name} 连接失败: ${handleError(error)}。将在 ${
          this.reconnectDelay / 1000
        } 秒后尝试重连...`,
        'MCPService',
      );
      this.scheduleReconnect(); // 连接失败时也安排重连
      await this.updateSelfStatsInDb();
    }
  }

  // This method now handles the debouncing
  async updateSelfStatsInDb() {
    if (this.updateDbTimeoutId) {
      clearTimeout(this.updateDbTimeoutId);
    }

    this.updateDbTimeoutId = setTimeout(async () => {
      this.updateDbTimeoutId = null; // Clear the timeout ID once executed
      await this._performDbUpdate(); // Call the actual update logic
    }, this.debounceDbUpdateDelay);
  }

  // Renamed original method to contain the actual DB update logic
  private async _performDbUpdate() {
    try {
      const configEntity = await this.mcpConfigRepository.findOne({ where: { name: this.name } });
      if (configEntity) {
        let needsSave = false;
        if (configEntity.toolsCount !== this.tools.length) {
          configEntity.toolsCount = this.tools.length;
          needsSave = true;
        }
        if (configEntity.resourcesCount !== this.resources.length) {
          configEntity.resourcesCount = this.resources.length;
          needsSave = true;
        }
        if (configEntity.promptsCount !== this.prompts.length) {
          configEntity.promptsCount = this.prompts.length;
          needsSave = true;
        }
        if (configEntity.connectionStatus !== this.status) {
          configEntity.connectionStatus = this.status;
          needsSave = true;
        }
        if (this.status === 'connected') {
          configEntity.lastConnectedAt = new Date();
          needsSave = true; // Always update lastConnectedAt on connect
        } else if (this.status === 'error' || this.status === 'disconnected') {
          configEntity.connectionStatus = this.status;
          needsSave = true;
        }

        if (needsSave) {
          await this.mcpConfigRepository.save(configEntity);
          // Logger.debug(
          //   `客户端 ${this.name}: 数据库统计信息已更新 (状态: ${this.status}, 工具: ${this.tools.length})`,
          //   'MCPService',
          // );
        }
      } else {
        Logger.warn(
          `客户端 ${this.name}: 无法在数据库中找到对应的配置实体以更新统计信息。`,
          'MCPService',
        );
      }
    } catch (dbError) {
      Logger.error(
        `客户端 ${this.name}: 更新数据库统计信息失败: ${handleError(dbError)}`,
        'MCPService',
      );
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeoutId) {
      // 如果已经有重连计划，则取消它，以防多个事件触发
      clearTimeout(this.reconnectTimeoutId);
    }

    // 定义最大重试次数
    const maxAttempts = 5;

    this.reconnectAttempts++;

    // 检查是否已超过最大重试次数
    if (this.reconnectAttempts > maxAttempts) {
      Logger.error(
        `客户端 ${this.name}: 已达到最大重连尝试次数 (${maxAttempts})，将停止重连。`,
        'MCPService',
      );
      this.status = 'disconnected'; // 标记为最终断开状态
      // 更新数据库状态 (debounced)
      this.updateSelfStatsInDb();
      this.reconnectTimeoutId = null; // 确保没有设置超时
      return; // 停止安排新的重试
    }

    const delay = this.reconnectDelay;

    // Logger.debug(
    //   `客户端 ${this.name}: 安排第 ${this.reconnectAttempts}/${maxAttempts} 次重连，延迟 ${
    //     delay / 1000
    //   } 秒`,
    //   'MCPService',
    // );

    this.reconnectTimeoutId = setTimeout(async () => {
      this.reconnectTimeoutId = null;
      // Logger.log(
      //   `客户端 ${this.name}: 正在尝试重连 (第 ${this.reconnectAttempts}/${maxAttempts} 次)...`,
      //   'MCPService',
      // );
      await this.open(); // 尝试重新打开连接
    }, delay);

    // 指数退避增加延迟时间，直到达到最大值
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  async openStdio(config: any) {
    try {
      // Logger.debug(
      //   `正在通过 stdio 连接客户端 ${this.name} (命令: ${config.command})...`,
      //   'MCPService',
      // );
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: buildSafeStdioEnv(config.env),
      });
      const client = new Client({ name: this.name, version: '1.0.0' });
      await client.connect(transport);
      this.client = client;
    } catch (error) {
      Logger.error(
        `客户端 ${this.name} 的 MCP stdio 连接失败: ${handleError(error)}`,
        'MCPService',
      );
      throw error;
    }
  }

  async openSSE() {
    try {
      if (!this.url) {
        throw new Error(`客户端 ${this.name} 的 SSE 连接 URL 缺失`);
      }

      // 构建传输选项，包含自定义 headers（MCP 官方标准方式）
      const transportOptions: any = {};

      // 处理 headers：可能是 JSON 字符串或对象
      let headersObj: Record<string, string> = {};
      if (this.headers) {
        try {
          if (typeof this.headers === 'string') {
            headersObj = JSON.parse(this.headers);
          } else if (typeof this.headers === 'object') {
            headersObj = this.headers;
          }
        } catch (error) {
          Logger.error(
            `客户端 ${this.name}: 解析 headers JSON 失败: ${handleError(error)}`,
            'MCPService',
          );
          headersObj = {};
        }
      }

      if (Object.keys(headersObj).length > 0) {
        transportOptions.requestInit = {
          headers: headersObj,
        };
      }

      let connectionError: any = null;
      let clientConnected = false;

      // 优先使用 StreamableHTTPClientTransport（MCP 官方推荐）
      if (checkReadableStreamSupport() && checkFetchAPISupport()) {
        try {
          const client = new Client({ name: this.name, version: '1.0.0' });
          const transport = new StreamableHTTPClientTransport(new URL(this.url), transportOptions);
          await client.connect(transport);
          this.client = client;
          clientConnected = true;
        } catch (streamHttpError) {
          connectionError = streamHttpError;
          Logger.debug(`客户端 ${this.name}: StreamableHTTP 失败，尝试 SSE...`, 'MCPService');
        }
      }

      // 如果 StreamableHTTP 失败，回退到 SSEClientTransport
      if (!clientConnected) {
        try {
          const client = new Client({ name: this.name, version: '1.0.0' });
          const sseTransport = new SSEClientTransport(new URL(this.url), transportOptions);
          await client.connect(sseTransport);
          this.client = client;
          connectionError = null;
          clientConnected = true;
        } catch (sseError) {
          connectionError = connectionError || sseError;
        }
      }

      if (!clientConnected) {
        throw connectionError;
      }
    } catch (error) {
      Logger.error(`客户端 ${this.name} 连接失败: ${handleError(error)}`, 'MCPService');
      throw error;
    }
  }

  // 添加一个显式关闭方法，用于停止重连
  async close(stopReconnecting = true) {
    // Logger.log(`正在关闭 MCP 客户端 ${this.name}。停止重连: ${stopReconnecting}`, 'MCPService');
    if (stopReconnecting && this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
      // Logger.debug(`客户端 ${this.name}: 已取消计划的重连。`, 'MCPService');
    }
    this.status = 'disconnected'; // 标记为断开
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        Logger.error(`关闭 SDK 客户端 ${this.name} 时出错: ${handleError(error)}`, 'MCPService');
      }
      this.client = undefined; // 清理客户端实例
    }
    await this.updateSelfStatsInDb();
  }
}

function checkReadableStreamSupport() {
  return typeof ReadableStream !== 'undefined';
}

function checkFetchAPISupport() {
  return typeof fetch !== 'undefined';
}

@Injectable()
export class MCPService implements OnModuleInit {
  private mcpClients: Record<string, MCPClient> = {};
  private initialized: boolean = false;
  private cronJob: cron.ScheduledTask;

  constructor(
    @InjectRepository(MCPConfigEntity)
    private readonly mcpConfigRepository: Repository<MCPConfigEntity>,
  ) {}

  async onModuleInit() {
    this.setupScheduledRestart();
    await this.initialize();
  }

  setupScheduledRestart() {
    try {
      if (this.cronJob) {
        this.cronJob.stop();
      }
      // 每天凌晨3点执行
      this.cronJob = cron.schedule('0 3 * * *', async () => {
        // Logger.log('已触发计划的 MCP 服务重载。', 'MCPService');
        await this.reload().catch(err =>
          Logger.error(`计划的 MCP 服务重载失败: ${handleError(err)}`, 'MCPService'),
        );
      });
    } catch (error) {
      Logger.error(`设置计划的 MCP 重启失败: ${handleError(error)}`, 'MCPService');
    }
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    try {
      const allConfigs = await this.mcpConfigRepository.find();

      for (const configEntity of allConfigs) {
        if (!configEntity.isActive) {
          // Logger.debug(`跳过非活动的 MCP 配置: ${configEntity.name}`, 'MCPService');
          configEntity.connectionStatus = 'inactive';
          await this.mcpConfigRepository.save(configEntity);
          continue;
        }
        const mcpConfig = this.buildConfigFromFields(configEntity);
        const serverConfig = mcpConfig.mcpServers[configEntity.name] as ServerConfig;
        if (!serverConfig) {
          Logger.error(
            `无法为活动实体构建服务器配置: ${configEntity.name} (ID: ${configEntity.id})`,
            'MCPService',
          );
          continue;
        }
        if (serverConfig.disabled) {
          // Logger.debug(`跳过已禁用的 MCP 服务器配置: ${serverConfig.name}`, 'MCPService');
          continue;
        }

        // Logger.debug(`正在初始化 MCP 客户端: ${serverConfig.name}`, 'MCPService');
        const client = new MCPClient(serverConfig.name, serverConfig, this.mcpConfigRepository);
        this.mcpClients[serverConfig.name] = client;
      }

      this.initialized = true;

      // 异步连接所有客户端，不阻塞启动
      setImmediate(async () => {
        const openPromises = Object.values(this.mcpClients).map((client: any) =>
          client.open().catch((err: any) => {
            Logger.warn(`MCP 客户端 ${client.name} 初始化失败: ${err.message}`, 'MCPService');
          }),
        );
        await Promise.allSettled(openPromises);

        // 汇总连接状态
        const connectedClients = Object.values(this.mcpClients).filter(
          (client: any) => client.status === 'connected',
        );
        const failedClients = Object.values(this.mcpClients).filter(
          (client: any) => client.status === 'failed',
        );
        const totalTools = connectedClients.reduce(
          (sum: number, client: any) => sum + (client.tools?.length || 0),
          0,
        );

        Logger.log(
          `MCP 服务初始化完成：已连接 ${connectedClients.length}/${
            Object.keys(this.mcpClients).length
          } 个客户端，` +
            `共 ${totalTools} 个工具${
              failedClients.length > 0 ? `，${failedClients.length} 个连接失败` : ''
            }`,
          'MCPService',
        );
      });
    } catch (error) {
      Logger.error(`MCP 服务初始化严重失败: ${handleError(error)}`, 'MCPService');
      this.initialized = false;
    }
  }

  async getConfigEntity() {
    // 这会获取 *一个* 活动配置或总体上的第一个配置。看起来很特定。
    try {
      let configEntity = await this.mcpConfigRepository.findOne({ where: { isActive: true } });
      if (!configEntity) {
        // Logger.debug('未找到活动的 MCP 配置，尝试查找总体上的第一个。', 'MCPService');
        const configs = await this.mcpConfigRepository.find({ order: { id: 'ASC' }, take: 1 });
        configEntity = configs.length > 0 ? configs[0] : null;
      }
      return configEntity;
    } catch (error) {
      Logger.error(`获取 MCP 配置实体失败: ${handleError(error)}`, 'MCPService');
      return null;
    }
  }

  async getAdminConfig() {
    // 返回由 getConfigEntity 获取的 *一个* 特定实体的配置
    const configEntity = await this.getConfigEntity();
    if (!configEntity) {
      Logger.warn('未找到用于 getAdminConfig 的 MCP 配置实体。', 'MCPService');
      return { mcpServers: {} };
    }
    return this.buildConfigFromFields(configEntity);
  }

  buildConfigFromFields(configEntity: MCPConfigEntity) {
    // 此方法当前构建一个只有一个服务器条目的配置结构，
    // 使用实体的名称作为键。
    try {
      const mcpConfig: any = { mcpServers: {} };
      let args: any[] = [];
      let env: any = {};
      let headers: any = {};

      try {
        if (configEntity.args) args = JSON.parse(configEntity.args);
        if (configEntity.env) env = JSON.parse(configEntity.env);
        if (configEntity.headers) headers = JSON.parse(configEntity.headers);
      } catch (e: any) {
        Logger.error(
          `解析配置 ${configEntity.name} 的 args / env / headers JSON 失败: ${e.message}`,
          'MCPService',
        );
        // 继续使用空的 args/env/headers
      }

      const serverConfig: ServerConfig = {
        name: configEntity.name,
        displayName: `${configEntity.name} 服务`, // 考虑使 displayName 可配置
        type: configEntity.type || 1,
        disabled: !configEntity.isActive, // 与外部检查冗余，但安全
        url: undefined, // 显式初始化
        command: undefined,
        args: undefined,
        env: undefined,
        headers: undefined,
      };

      if (configEntity.type === 2) {
        // SSE
        serverConfig.url = configEntity.url;
        serverConfig.headers = headers;
        // Logger.debug(`已为 ${configEntity.name} 构建 SSE 服务器配置`, 'MCPService');
      } else {
        // Stdio (默认类型 1)
        serverConfig.command = configEntity.command || 'npx';
        serverConfig.args = args;
        serverConfig.env = env;
        // Logger.debug(`已为 ${configEntity.name} 构建 Stdio 服务器配置`, 'MCPService');
      }

      mcpConfig.mcpServers[configEntity.name] = serverConfig;
      return mcpConfig;
    } catch (e: any) {
      Logger.error(`为 ${configEntity?.name} 构建 MCP 配置结构失败: ${e.message}`, 'MCPService');
      return { mcpServers: {} }; // 失败时返回空结构
    }
  }

  // 这通过 ID 更新单个配置实体。
  async updateConfig(id: number, config: Partial<MCPConfigEntity>) {
    try {
      let configEntity = await this.mcpConfigRepository.findOne({ where: { id } });
      if (!configEntity) {
        throw new HttpException(`未找到 ID 为 ${id} 的 MCP 配置。`, HttpStatus.NOT_FOUND);
      }
      Logger.debug(
        `正在更新 MCP 配置实体 ID: ${id}, 名称: ${config.name ?? configEntity.name}`,
        'MCPService',
      );

      // 更新配置对象中提供的字段
      if (config.name !== undefined) configEntity.name = config.name;
      if (config.type !== undefined) configEntity.type = config.type;
      if (config.isActive !== undefined) configEntity.isActive = config.isActive;

      if (configEntity.type === 2) {
        // SSE
        if (config.url !== undefined) configEntity.url = config.url;
        // 直接透传 headers 字符串，不做任何处理
        if (config.headers !== undefined) configEntity.headers = config.headers;
        // 切换到 SSE 或更新 SSE 时清除 stdio 字段
        configEntity.command = null;
        configEntity.args = '[]';
        configEntity.env = '{}';
        // Logger.debug(`正在将配置 ${id} 更新为 SSE 类型。URL: ${configEntity.url}`, 'MCPService');
      } else {
        // Stdio (类型 1 或默认)
        if (config.command !== undefined) configEntity.command = config.command;
        // 确保 args/env 是字符串化的 JSON 或 null
        configEntity.args = config.args || '[]';
        configEntity.env = config.env || '{}';
        // 清除 SSE 字段
        configEntity.url = null;
        configEntity.headers = null;
        // Logger.debug(
        //   `正在将配置 ${id} 更新为 Stdio 类型。命令: ${configEntity.command}`,
        //   'MCPService',
        // );
      }

      await this.mcpConfigRepository.save(configEntity);
      // Logger.log(`MCP 配置 ${configEntity.name}(ID: ${id}) 更新成功。正在触发重载。`, 'MCPService');

      // 异步触发重载
      this.reload().catch(error => {
        Logger.error(`更新配置 ${id} 后异步重载失败: ${handleError(error)}`, 'MCPService');
      });

      return true;
    } catch (error) {
      Logger.error(`更新 MCP 配置 ID ${id} 失败: ${handleError(error)}`, 'MCPService');
      // 如果需要，重新抛出或处理特定的数据库错误
      if (error instanceof HttpException) throw error;
      return false; // 指示失败
    }
  }

  // 已弃用？updateConfig 似乎更健壮。这个基于名称更新，如果不存在则创建。
  async updateServerConfig(name: string, serverConfig: any) {
    try {
      let configEntity = await this.mcpConfigRepository.findOne({ where: { name: name } });
      let isNew = false;
      if (!configEntity) {
        isNew = true;
        configEntity = new MCPConfigEntity();
        configEntity.name = name;
        configEntity.isActive = true; // 新配置默认为活动
        // Logger.debug(`正在为 ${name} 创建新的 MCP 配置实体`, 'MCPService');
      } else {
        // Logger.debug(`正在更新 ${name} 的现有 MCP 配置实体`, 'MCPService');
      }

      configEntity.type = serverConfig.type || 1;

      if (configEntity.type === 2) {
        // SSE
        let url = serverConfig.url;
        // 基本 URL 格式化 (考虑更健壮的验证)
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://${url}`;
        }
        configEntity.url = url;
        configEntity.headers = serverConfig.headers ? JSON.stringify(serverConfig.headers) : '{}';
        configEntity.command = null;
        configEntity.args = '[]';
        configEntity.env = '{}';
        // Logger.debug(`正在将 ${name} 配置更新为 SSE 类型。URL: ${url}`, 'MCPService');
      } else {
        // Stdio
        configEntity.command = serverConfig.command || 'npx';
        configEntity.args = serverConfig.args || '[]';
        configEntity.env = serverConfig.env || '{}';
        configEntity.url = null;
        configEntity.headers = null;
        Logger.debug(
          `正在将 ${name} 配置更新为 Stdio 类型。命令: ${configEntity.command}`,
          'MCPService',
        );
      }

      // 如果 serverConfig 中提供了 isActive，则使用它，否则保留现有值或新配置的默认值
      if (serverConfig.isActive !== undefined) {
        configEntity.isActive = serverConfig.isActive;
      }

      await this.mcpConfigRepository.save(configEntity);
      // Logger.log(`MCP 配置 "${name}" ${isNew ? '已创建' : '已更新'}。正在触发重载。`, 'MCPService');

      // 同步等待重载完成
      await this.reload().catch(error => {
        Logger.error(`更新服务器配置 ${name} 后重载失败: ${handleError(error)}`, 'MCPService');
      });

      return true;
    } catch (error) {
      Logger.error(`更新/创建服务器配置 ${name} 失败: ${handleError(error)}`, 'MCPService');
      return false;
    }
  }

  async deleteMcpConfigById(id: number) {
    try {
      const configEntity = await this.mcpConfigRepository.findOne({ where: { id } });
      if (!configEntity) {
        Logger.warn(`尝试删除不存在的 MCP 配置，ID: ${id}`, 'MCPService');
        return false;
      }

      const clientName = configEntity.name;
      // Logger.log(`正在删除 MCP 配置: ${clientName} (ID: ${id})`, 'MCPService');

      if (this.mcpClients[clientName]) {
        // Logger.debug(`正在删除配置前关闭客户端 ${clientName} 并停止重连...`, 'MCPService');
        // 使用新的 close 方法停止重连并关闭
        await this.mcpClients[clientName].close(true);
        delete this.mcpClients[clientName]; // 从映射中移除
      }

      await this.mcpConfigRepository.remove(configEntity);
      // Logger.log(`MCP 配置 ${clientName} (ID: ${id}) 删除成功。`, 'MCPService');
      // 删除后不再需要触发 reload，因为实例已清理
      return true;
    } catch (error) {
      Logger.error(`删除 MCP 配置 ID ${id} 失败: ${handleError(error)}`, 'MCPService');
      return false;
    }
  }

  async reload() {
    const startTime = Date.now();

    try {
      const closePromises = Object.values(this.mcpClients).map(client => client.close(true));
      await Promise.allSettled(closePromises);

      this.mcpClients = {};
      this.initialized = false;

      await this.initialize();

      const newClientCount = Object.keys(this.mcpClients).length;
      const newConnectedCount = Object.values(this.mcpClients).filter(
        c => c.status === 'connected',
      ).length;
      Logger.log(
        `MCP 服务重载完成。活动客户端: ${newConnectedCount}/${newClientCount}。总耗时: ${
          Date.now() - startTime
        }ms`,
        'MCPService',
      );

      return true;
    } catch (error) {
      Logger.error(`MCP 服务重载失败: ${handleError(error)}`, 'MCPService');
      this.initialized = false;
      return false;
    }
  }

  // 这个函数似乎未使用或未完成。保留还是删除？暂时保留。
  async loadClients() {
    // Logger.debug('loadClients 函数被调用，但没有实现。', 'MCPService');
    return;
  }

  getClients() {
    if (!this.initialized) {
      // 也许返回空而不是抛出？取决于用法。抛出更安全。
      Logger.error('尝试获取客户端，但 MCPService 未初始化。', 'MCPService');
      throw new Error('MCP 服务未初始化或初始化失败。');
    }
    return this.mcpClients;
  }

  getClient(name: string) {
    if (!this.initialized) {
      Logger.error(`尝试获取客户端 ${name}，但 MCPService 未初始化。`, 'MCPService');
      throw new Error('MCP 服务未初始化或初始化失败。');
    }
    const client = this.mcpClients[name];
    if (!client) {
      Logger.warn(`请求的 MCP 客户端 "${name}" 未找到或非活动。`, 'MCPService');
      throw new HttpException(`MCP 客户端 "${name}" 未找到或非活动。`, HttpStatus.NOT_FOUND);
    }

    // 检查客户端是否被禁用
    if (client.disabled) {
      Logger.warn(`请求的 MCP 客户端 "${name}" 已被禁用。`, 'MCPService');
      throw new HttpException(`MCP 客户端 "${name}" 已被禁用。`, HttpStatus.SERVICE_UNAVAILABLE);
    }

    // 不再强制要求 status === 'connected'，因为调用时可能正在重连
    // 调用方需要准备处理 client.callTool 等方法可能因未连接而抛出的错误
    // 或者在这里添加检查并抛出特定错误
    // if (client.status !== 'connected') {
    //    Logger.warn(`请求的 MCP 客户端 "${name}" 当前未连接 (状态: ${client.status})。可能正在重连中。`, 'MCPService');
    //    throw new HttpException(`MCP 客户端 "${name}" 当前未连接 (状态: ${client.status})。`, HttpStatus.SERVICE_UNAVAILABLE);
    // }
    return client;
  }

  canCallTool(actor: McpActor | undefined, clientName: string, toolName: string): boolean {
    return isMcpToolAllowed(actor, clientName, toolName);
  }

  async callTool(clientName: string, toolName: string, args: any, actor: McpActor | undefined) {
    // Logger.debug(`收到在客户端 ${ clientName } 上调用工具 ${ toolName } 的请求`, 'MCPService'); // 可选
    try {
      // 处理像 'client/tool' 这样的潜在名称格式 - 已在原始代码中完成
      if (toolName.includes('/')) {
        const parts = toolName.split('/');
        clientName = parts[0]; // 如果在 toolName 中指定了 clientName，则覆盖它
        toolName = parts[1] || toolName;
        // Logger.debug(
        //   `从组合名称中提取了客户端 '${clientName}' 和工具 '${toolName}'。`,
        //   'MCPService',
        // );
      }
      if (!this.canCallTool(actor, clientName, toolName)) {
        throw new HttpException('当前身份未获授权使用该 MCP 工具', HttpStatus.FORBIDDEN);
      }
      const client = this.getClient(clientName); // 如果未找到、未初始化或未连接，则抛出
      return await client.callTool(toolName, args); // 错误处理在 client.callTool 内部
    } catch (error) {
      // 记录整体服务级调用失败的上下文
      Logger.error(
        `服务级工具调用失败(客户端: ${clientName}, 工具: ${toolName}): ${handleError(error)}`,
        'MCPService',
      );
      throw error; // 重新抛出原始错误 (可能是来自 getClient 的 HttpException 或来自 callTool 的错误)
    }
  }

  async callResource(clientName: string, uri: string) {
    // Logger.debug(`收到在客户端 ${ clientName } 上调用资源 ${ uri } 的请求`, 'MCPService'); // 可选
    try {
      const client = this.getClient(clientName); // 如果未找到、未初始化或未连接，则抛出
      return await client.callResource(uri);
    } catch (error) {
      Logger.error(
        `服务级资源调用失败(客户端: ${clientName}, URI: ${uri}): ${handleError(error)}`,
        'MCPService',
      );
      throw error;
    }
  }

  async callPrompt(clientName: string, promptName: string, args: any) {
    // Logger.debug(`收到在客户端 ${ clientName } 上调用提示 ${ promptName } 的请求`, 'MCPService'); // 可选
    try {
      const client = this.getClient(clientName); // 如果未找到、未初始化或未连接，则抛出
      return await client.callPrompt(promptName, args);
    } catch (error) {
      Logger.error(
        `服务级提示调用失败(客户端: ${clientName}, 提示: ${promptName}): ${handleError(error)}`,
        'MCPService',
      );
      throw error;
    }
  }

  // 未使用？调用空的 loadClients
  async refreshClients() {
    // Logger.debug('refreshClients 已调用。', 'MCPService');
    await this.loadClients();
  }

  // closeClient 现在主要由 reload 和 delete 使用，外部调用应谨慎
  async closeClient(clientName: string, shouldDelete: boolean = false) {
    const client = this.mcpClients[clientName];
    if (!client) {
      // Logger.debug(`尝试关闭不存在的客户端: ${clientName}`, 'MCPService');
      return;
    }
    await client.close(true); // 总是停止重连
    if (shouldDelete) {
      delete this.mcpClients[clientName];
      // Logger.debug(`客户端 ${clientName} 已从活动映射中移除。`, 'MCPService');
    }
  }

  // closeAllClients 内部已调用 client.close(true)，不再需要单独实现
  // async closeAllClients() { ... }

  async queryMcpConfig() {
    try {
      const allConfigs = await this.mcpConfigRepository.find();
      return allConfigs.map(config => ({
        id: config.id,
        name: config.name,
        type: config.type || 1,
        isActive: config.isActive,
        command: config.command,
        args: config.args ? JSON.parse(config.args || '[]') : [],
        env: config.env ? this.maskSensitiveValues(JSON.parse(config.env || '{}')) : {},
        url: config.url,
        headers: config.headers ? this.maskSensitiveValues(JSON.parse(config.headers || '{}')) : {},
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        toolsCount: config.toolsCount || 0,
        resourcesCount: config.resourcesCount || 0,
        promptsCount: config.promptsCount || 0,
        connectionStatus: config.connectionStatus || 'disconnected',
        lastConnectedAt: config.lastConnectedAt || null,
      }));
    } catch (error: any) {
      Logger.error(`查询 MCP 配置失败: ${error.message}`, 'MCPService');
      throw error;
    }
  }

  private maskSensitiveValues(obj: Record<string, any>): Record<string, any> {
    const sensitiveKeys = /key|token|secret|password|auth|credential|private/i;
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (sensitiveKeys.test(k) && typeof v === 'string' && v.length > 0) {
        result[k] = v.slice(0, 4) + '****';
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  /**
   * Merge new env/headers into the original, preserving original values
   * for any keys where the new value contains the masking placeholder "****".
   * This prevents masked display values from overwriting real credentials.
   */
  private mergePreservingOriginals(
    originalJson: string | null,
    newJson: string | Record<string, any>,
  ): string {
    let original: Record<string, any> = {};
    let incoming: Record<string, any>;

    if (originalJson) {
      try {
        original = JSON.parse(originalJson);
      } catch {}
    }

    if (typeof newJson === 'string') {
      try {
        incoming = JSON.parse(newJson);
      } catch {
        incoming = {};
      }
    } else {
      incoming = newJson;
    }

    const merged = { ...original };
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof v === 'string' && v.includes('****') && original[k] !== undefined) {
        continue;
      }
      merged[k] = v;
    }

    return JSON.stringify(merged);
  }

  // 创建一个新的 MCP 配置实体。
  async setMcpConfig(config: any) {
    // 基本验证 (考虑使用 class-validator DTO)
    if (!config.name) {
      throw new HttpException('配置名称是必需的。', HttpStatus.BAD_REQUEST);
    }

    // Logger.debug(`尝试创建新的 MCP 配置: ${config.name}`, 'MCPService');
    // 检查名称冲突
    const existingConfig = await this.mcpConfigRepository.findOne({ where: { name: config.name } });
    if (existingConfig) {
      Logger.warn(`尝试创建具有重复名称的 MCP 配置: ${config.name}`, 'MCPService');
      throw new HttpException(`配置名称 '${config.name}' 已存在。`, HttpStatus.CONFLICT);
    }

    let configEntity = new MCPConfigEntity();
    configEntity.name = config.name;
    configEntity.isActive = config.isActive !== false; // 如果未定义/null，则默认为 true
    configEntity.type = config.type || 1; // 默认为 stdio

    Logger.debug(
      `正在创建配置 '${config.name}', 类型: ${configEntity.type}, 活动: ${configEntity.isActive}`,
      'MCPService',
    );

    if (configEntity.type === 2) {
      // SSE
      let url = config.url;
      configEntity.url = url;
      configEntity.headers = config.headers || '{}';
      // Logger.debug(`新配置 ${config.name} SSE URL 设置为: ${url}`, 'MCPService');
    } else {
      // Stdio
      configEntity.command = config.command || 'npx';
      configEntity.args = config.args || '[]';
      configEntity.env = config.env || '{}';
      // Logger.debug(`新配置 ${config.name} Stdio 命令: ${configEntity.command}`, 'MCPService');
    }

    try {
      await this.mcpConfigRepository.save(configEntity);
      // Logger.log(`新 MCP 配置 '${config.name}' 创建成功。正在触发重载。`, 'MCPService');

      // 同步等待重载完成
      await this.reload().catch(error => {
        Logger.error(`创建配置 ${config.name} 后重载失败: ${handleError(error)}`, 'MCPService');
      });

      return { success: true, id: configEntity.id }; // 返回成功和 ID
    } catch (dbError) {
      Logger.error(
        `将新 MCP 配置 ${config.name} 保存到数据库时出错: ${handleError(dbError)}`,
        'MCPService',
      );
      throw new HttpException('无法将配置保存到数据库。', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // This method is now primarily for periodic sync or updating inactive/missing clients
  async updateClientStats() {
    // Logger.debug('(定期?) 正在更新数据库中的客户端统计信息...', 'MCPService');
    try {
      const allConfigs = await this.mcpConfigRepository.find();
      let updatedCount = 0;

      for (const configEntity of allConfigs) {
        const clientName = configEntity.name;
        const client = this.mcpClients[clientName];
        let needsSave = false;

        if (!client && configEntity.isActive) {
          // Active client expected but not in memory map (failed init? removed?)
          if (configEntity.connectionStatus !== 'disconnected') {
            configEntity.connectionStatus = 'disconnected';
            needsSave = true;
          }
          // *** Reset counts if client is missing ***
          if (configEntity.toolsCount !== 0) {
            configEntity.toolsCount = 0;
            needsSave = true;
          }
          if (configEntity.resourcesCount !== 0) {
            configEntity.resourcesCount = 0;
            needsSave = true;
          }
          if (configEntity.promptsCount !== 0) {
            configEntity.promptsCount = 0;
            needsSave = true;
          }
          // Optionally clear lastConnectedAt?
          // if (configEntity.lastConnectedAt !== null) { configEntity.lastConnectedAt = null; needsSave = true; }
        } else if (!client && !configEntity.isActive) {
          // Client is inactive and not in memory map, ensure status is inactive
          if (configEntity.connectionStatus !== 'inactive') {
            configEntity.connectionStatus = 'inactive';
            needsSave = true;
          }
          // *** Also reset counts for inactive clients ***
          if (configEntity.toolsCount !== 0) {
            configEntity.toolsCount = 0;
            needsSave = true;
          }
          if (configEntity.resourcesCount !== 0) {
            configEntity.resourcesCount = 0;
            needsSave = true;
          }
          if (configEntity.promptsCount !== 0) {
            configEntity.promptsCount = 0;
            needsSave = true;
          }
        }
        // Updates for clients existing in memory are handled by the client itself.

        if (needsSave) {
          await this.mcpConfigRepository.save(configEntity);
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        Logger.debug(
          `已更新数据库中 ${updatedCount} 个丢失/非活动 MCP 配置的统计信息。`,
          'MCPService',
        );
      } else {
        // Logger.debug(`数据库中的丢失/非活动客户端统计信息已是最新。`, 'MCPService');
      }
    } catch (error) {
      Logger.error(`(定期?) 更新数据库中的客户端统计信息失败: ${handleError(error)}`, 'MCPService');
    }
  }

  // 通过 ID 更新现有的 MCP 配置实体。比 updateServerConfig 更健壮。
  async updateMcpConfig(id: number, config: any) {
    // Logger.debug(`尝试更新 MCP 配置 ID: ${id}`, 'MCPService');
    const configEntity = await this.mcpConfigRepository.findOne({ where: { id } });

    if (!configEntity) {
      Logger.warn(`更新失败：未找到 ID 为 ${id} 的 MCP 配置。`, 'MCPService');
      throw new HttpException(`未找到 ID 为 ${id} 的配置。`, HttpStatus.NOT_FOUND);
    }

    const oldName = configEntity.name;
    const newName = config.name;

    // 仅当名称更改时才检查名称冲突
    if (newName && newName !== oldName) {
      // Logger.debug(
      //   `配置 ${id}: 请求将名称从 '${oldName}' 更改为 '${newName}'。正在检查冲突。`,
      //   'MCPService',
      // );
      const existingConfig = await this.mcpConfigRepository.findOne({ where: { name: newName } });
      if (existingConfig) {
        Logger.warn(`更新失败：尝试将配置 ${id} 重命名为重复名称 '${newName}'。`, 'MCPService');
        throw new HttpException(`配置名称 '${newName}' 已存在。`, HttpStatus.CONFLICT);
      }
      configEntity.name = newName;
    }

    // 如果提供了其他字段，则更新
    if (config.isActive !== undefined) configEntity.isActive = config.isActive;
    if (config.type !== undefined) configEntity.type = config.type;

    // Logger.debug(
    //   `正在更新配置 ${id} (${configEntity.name}): 类型=${configEntity.type}, 活动=${configEntity.isActive}`,
    //   'MCPService',
    // );

    // 更新特定于类型的字段
    if (configEntity.type === 2) {
      // SSE
      if (config.url !== undefined) configEntity.url = config.url;
      if (config.headers !== undefined) {
        configEntity.headers = this.mergePreservingOriginals(configEntity.headers, config.headers);
      }
      configEntity.command = null;
      configEntity.args = null;
      configEntity.env = null;
      // Logger.debug(
      //   `正在将配置 ${id} (${configEntity.name}) SSE URL 更新为: ${configEntity.url}`,
      //   'MCPService',
      // );
    } else {
      // Stdio
      if (config.command !== undefined) configEntity.command = config.command;
      if (config.args !== undefined) configEntity.args = JSON.stringify(config.args);
      if (config.env !== undefined) {
        configEntity.env = this.mergePreservingOriginals(configEntity.env, config.env);
      }
      configEntity.url = null;
      configEntity.headers = null;
      // Logger.debug(
      //   `正在将配置 ${id} (${configEntity.name}) Stdio 命令更新为: ${configEntity.command}`,
      //   'MCPService',
      // );
    }

    try {
      await this.mcpConfigRepository.save(configEntity);
      // Logger.log(
      //   `MCP 配置 ${configEntity.name} (ID: ${id}) 更新成功。正在触发重载。`,
      //   'MCPService',
      // );

      // 同步等待重载完成，确保禁用/删除操作立即生效
      await this.reload().catch(error => {
        Logger.error(`更新配置 ${id} 后重载失败: ${handleError(error)}`, 'MCPService');
      });

      return { success: true };
    } catch (dbError) {
      Logger.error(
        `更新 MCP 配置 ${id} (${configEntity.name}) 时数据库出错: ${handleError(dbError)}`,
        'MCPService',
      );
      throw new HttpException('无法在数据库中更新配置。', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
