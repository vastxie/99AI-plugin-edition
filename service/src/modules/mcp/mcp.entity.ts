import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'mcp_config' })
export class MCPConfigEntity extends BaseEntity {
  @Column({ comment: '配置名称', default: 'default' })
  name: string;

  @Column({ comment: '是否启用', default: true })
  isActive: boolean;

  @Column({ comment: 'MCP类型: 1=stdio, 2=sse', default: 1 })
  type: number;

  @Column({ comment: '命令', default: 'npx', nullable: true })
  command: string;

  @Column({ comment: '参数', type: 'text', nullable: true })
  args: string;

  @Column({ comment: '环境变量', type: 'text', nullable: true })
  env: string;

  @Column({ comment: 'HTTP请求头（SSE/HTTP模式使用）', type: 'text', nullable: true })
  headers: string;

  @Column({ comment: 'SSE连接URL', nullable: true })
  url: string;

  @Column({ comment: '工具数量', default: 0 })
  toolsCount: number;

  @Column({ comment: '资源数量', default: 0 })
  resourcesCount: number;

  @Column({ comment: '提示数量', default: 0 })
  promptsCount: number;

  @Column({ comment: '连接状态', default: 'disconnected' })
  connectionStatus: string;

  @Column({ comment: '最后连接时间', nullable: true })
  lastConnectedAt: Date;
}
