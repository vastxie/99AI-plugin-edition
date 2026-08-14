import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * 核心表黑名单 —— 这些表对系统运行至关重要，禁止通过 dropTables 接口删除。
 * 不区分大小写匹配。
 */
const CORE_TABLE_DENYLIST: ReadonlySet<string> = new Set(
  [
    'users',
    'config',
    'orders',
    'user_balance',
    'chat_group',
    'chat_log',
    'balance_entity',
    'account_log_entity',
    'fingerprint_log',
    'models',
    'app',
    'app_cats',
    'user_apps',
    'plugin',
    'pay',
    'crami',
    'crami_package',
    'user_entity',
    'signin_entity',
    'verification',
    'share',
    'bad_words',
    'white_list_entity',
    'violation_log',
    'auto_reply',
    'preset',
    'preset_category',
    'mcp_config',
    'file_vector_cache',
    'redis_cache_entity',
    'migration',
    'typeorm_metadata',
  ].map(t => t.toLowerCase()),
);

@Injectable()
export class DatabaseCleanupService {
  private readonly logger = new Logger(DatabaseCleanupService.name);

  constructor(private readonly connection: DataSource) {}

  /**
   * 检测未在 Entity 中定义的表
   * @returns 未使用的表信息列表
   */
  async detectUnusedTables(): Promise<
    Array<{
      tableName: string;
      tableRows: number;
      dataSize: string;
    }>
  > {
    try {
      // 获取数据库所有表及其信息
      const tables = await this.connection.query(
        `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH + INDEX_LENGTH as SIZE
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         ORDER BY TABLE_NAME`,
      );

      // 获取所有 Entity 定义的表名
      const entityTables = this.connection.entityMetadatas.map(metadata => metadata.tableName);

      // 找出未使用的表
      const unusedTables = tables
        .filter(table => !entityTables.includes(table.TABLE_NAME))
        .map(table => ({
          tableName: table.TABLE_NAME,
          tableRows: table.TABLE_ROWS || 0,
          dataSize: this.formatBytes(table.SIZE || 0),
        }));

      Logger.log(`检测到 ${unusedTables.length} 个未使用的表`, 'DatabaseCleanup');

      return unusedTables;
    } catch (error) {
      Logger.error(`检测未使用表时出错: ${error.message}`, 'DatabaseCleanup');
      throw error;
    }
  }

  /**
   * 获取所有数据库表信息(包括已使用和未使用的)
   */
  async getAllTablesInfo(): Promise<{
    total: number;
    used: number;
    unused: number;
    tables: Array<{
      tableName: string;
      isUsed: boolean;
      tableRows: number;
      dataSize: string;
    }>;
  }> {
    try {
      // 获取所有表
      const tables = await this.connection.query(
        `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH + INDEX_LENGTH as SIZE
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         ORDER BY TABLE_NAME`,
      );

      // 获取 Entity 定义的表名
      const entityTables = new Set(
        this.connection.entityMetadatas.map(metadata => metadata.tableName),
      );

      const tablesInfo = tables.map(table => ({
        tableName: table.TABLE_NAME,
        isUsed: entityTables.has(table.TABLE_NAME),
        tableRows: table.TABLE_ROWS || 0,
        dataSize: this.formatBytes(table.SIZE || 0),
      }));

      const unusedCount = tablesInfo.filter(t => !t.isUsed).length;

      return {
        total: tablesInfo.length,
        used: tablesInfo.length - unusedCount,
        unused: unusedCount,
        tables: tablesInfo,
      };
    } catch (error) {
      this.logger.error(`获取表信息时出错: ${error.message}`, error.stack, 'DatabaseCleanup');
      throw error;
    }
  }

  /**
   * 删除指定的表(危险操作!)
   * 只应由前端"检测未使用表"流程调用。
   * 核心表受 CORE_TABLE_DENYLIST 保护，不可删除。
   * @param tableNames 要删除的表名数组
   */
  async dropTables(tableNames: string[]): Promise<{
    dropped: string[];
    failed: Array<{ tableName: string; reason: string }>;
    denied: string[];
  }> {
    const invalid = tableNames.filter(t => !/^[A-Za-z0-9_]+$/.test(t));
    if (invalid.length > 0) {
      return {
        dropped: [],
        failed: invalid.map(t => ({ tableName: t, reason: '表名格式不合法' })),
        denied: invalid,
      };
    }

    /* 核心表保护：检查是否有表在 denylist 中（不区分大小写） */
    const denied = tableNames.filter(t => CORE_TABLE_DENYLIST.has(t.toLowerCase()));
    if (denied.length > 0) {
      Logger.error(`拒绝删除核心表: ${denied.join(', ')}`, 'DatabaseCleanup');
      return {
        dropped: [],
        failed: denied.map(t => ({ tableName: t, reason: '核心表，禁止删除' })),
        denied,
      };
    }

    const dropped: string[] = [];
    const failed: Array<{ tableName: string; reason: string }> = [];

    Logger.log(`开始删除 ${tableNames.length} 个表`, 'DatabaseCleanup');

    for (const tableName of tableNames) {
      try {
        // 先检查表是否存在
        const exists = await this.connection.query(
          `SELECT COUNT(*) as count FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [tableName],
        );

        if (exists[0].count === 0) {
          failed.push({ tableName, reason: '表不存在' });
          continue;
        }

        // 删除表
        await this.connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        dropped.push(tableName);
      } catch (error) {
        Logger.error(`删除表 ${tableName} 失败: ${error.message}`, 'DatabaseCleanup');
        failed.push({ tableName, reason: error.message });
      }
    }

    Logger.log(`删除完成: 成功 ${dropped.length} 个,失败 ${failed.length} 个`, 'DatabaseCleanup');

    return { dropped, failed, denied: [] };
  }

  /**
   * 备份表数据(导出为 SQL)
   * @param tableName 表名
   */
  async backupTable(tableName: string): Promise<string> {
    try {
      this.logger.log(`开始备份表: ${tableName}`, 'DatabaseCleanup');

      // 获取建表语句
      const createTable = await this.connection.query(`SHOW CREATE TABLE \`${tableName}\``);

      // 获取表数据
      const rows = await this.connection.query(`SELECT * FROM \`${tableName}\``);

      // 简单生成 INSERT 语句(实际生产环境建议使用 mysqldump)
      let insertStatements = '';
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        insertStatements = `\n-- 数据\n${rows
          .map(row => {
            const values = columns.map(col => this.escapeValue(row[col]));
            return `INSERT INTO \`${tableName}\` (\`${columns.join('`,`')}\`) VALUES (${values});`;
          })
          .join('\n')}`;
      }

      const backupSql = `-- 表结构备份: ${tableName}\n-- 备份时间: ${new Date().toISOString()}\n\n-- 删除已存在的表\nDROP TABLE IF EXISTS \`${tableName}\`;\n\n-- 建表语句\n${
        createTable[0]['Create Table']
      };${insertStatements}\n`;

      this.logger.log(`表 ${tableName} 备份完成`, 'DatabaseCleanup');
      return backupSql;
    } catch (error) {
      this.logger.error(
        `备份表 ${tableName} 失败: ${error.message}`,
        error.stack,
        'DatabaseCleanup',
      );
      throw error;
    }
  }

  /**
   * 清理孤儿数据(已有的功能)
   */
  async cleanupOrphanData(): Promise<{ table: string; cleanedRows: number }[]> {
    try {
      this.logger.log('开始清理孤儿数据', 'DatabaseCleanup');

      const results = [];

      // 获取所有用户ID
      const userIds = await this.connection.query('SELECT id FROM users');
      const validUserIds = userIds.map(u => u.id);

      if (validUserIds.length === 0) {
        this.logger.warn('没有有效用户,跳过孤儿数据清理', 'DatabaseCleanup');
        return results;
      }

      // 清理各个表中的无效userId引用
      const tablesToClean = [
        'chat_group',
        'chat_log',
        'signin',
        'user_apps',
        'account_log',
        'fingerprint_log',
        'balance',
        'user_balance',
        'violation_log',
        'orders',
        'mcp_config',
      ];

      for (const table of tablesToClean) {
        try {
          const result = await this.connection.query(
            `DELETE FROM \`${table}\` WHERE userId NOT IN (${validUserIds
              .map(() => '?')
              .join(',')})`,
            validUserIds,
          );
          if (result.affectedRows > 0) {
            results.push({ table, cleanedRows: result.affectedRows });
            this.logger.log(
              `清理了表 ${table} 中的 ${result.affectedRows} 条无效记录`,
              'DatabaseCleanup',
            );
          }
        } catch (err) {
          // 表可能不存在或没有userId列,忽略错误
          this.logger.debug(`表 ${table} 清理跳过: ${err.message}`, 'DatabaseCleanup');
        }
      }

      this.logger.log(
        `孤儿数据清理完成,共清理 ${results.reduce((sum, r) => sum + r.cleanedRows, 0)} 条记录`,
        'DatabaseCleanup',
      );

      return results;
    } catch (error) {
      this.logger.error(`清理孤儿数据时出错: ${error.message}`, error.stack, 'DatabaseCleanup');
      throw error;
    }
  }

  /**
   * 格式化字节大小
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 转义 SQL 值
   */
  private escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    // 转义字符串
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}
