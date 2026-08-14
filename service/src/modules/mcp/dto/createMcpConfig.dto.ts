import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateMcpConfigDto {
  @ApiProperty({ description: '配置名称', example: 'brave-search' })
  @IsString()
  name: string;

  @ApiProperty({ description: '是否启用', example: true, default: true })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({
    description: 'MCP类型: 1=stdio, 2=sse',
    example: 1,
    default: 1,
    enum: [1, 2],
  })
  @IsInt()
  @Min(1)
  @Max(2)
  type: number;

  @ApiProperty({
    description: '执行命令（stdio模式使用）',
    example: 'npx',
    required: false,
  })
  @IsString()
  @IsOptional()
  command?: string;

  @ApiProperty({
    description: '命令参数（stdio模式使用）',
    example: '-y @modelcontextprotocol/server-github',
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  args?: string;

  @ApiProperty({
    description: '环境变量（stdio模式使用）',
    example: JSON.stringify({ GITHUB_PERSONAL_ACCESS_TOKEN: '<YOUR_TOKEN>' }),
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  env?: string;

  @ApiProperty({
    description: 'SSE连接URL（sse模式使用）',
    example: 'https://mcp.amap.com/sse?key=您在高德官网上申请的key',
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: '请输入有效的URL地址' })
  url?: string;

  @ApiProperty({
    description: 'HTTP请求头（SSE/HTTP模式使用）',
    example: JSON.stringify({ Authorization: 'Bearer your_api_key' }),
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  headers?: string;
}
