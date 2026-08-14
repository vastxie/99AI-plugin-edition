/**
 * 认证相关配置
 */
export const AuthConfig = {
  // JWT 配置
  jwt: {
    expiresIn: '30d', // Token 有效期 30天
    refreshExpiresIn: '60d', // 刷新Token有效期 60天
    algorithm: 'HS256' as const,
  },

  // 设备限制配置
  device: {
    maxDevices: 3, // 最大设备数默认限制为3个（动态配置可在管理端修改）
    checkWhitelistRoles: ['visitor', 'super'], // 白名单角色，跳过设备限制检查
  },

  // Redis 配置
  redis: {
    tokenPrefix: 'tokens:', // 用户token集合前缀
    tokenDataPrefix: 'token:data:', // token数据前缀
    refreshTokenPrefix: 'refresh:token:', // 刷新token前缀
    tokenTTL: 30 * 24 * 60 * 60, // Token在Redis中的TTL：30天（秒）
    refreshTokenTTL: 60 * 24 * 60 * 60, // 刷新Token在Redis中的TTL：60天（秒）
  },

  // 密码加密配置
  bcrypt: {
    rounds: process.env.NODE_ENV === 'production' ? 10 : 5, // 生产环境10轮，开发环境5轮
  },

  // 权限缓存配置
  cache: {
    permissionCacheTTL: 5 * 60 * 1000, // 权限缓存时间：5分钟（毫秒）
    jwtSecretCacheTTL: 60 * 60 * 1000, // JWT密钥缓存时间：1小时（毫秒）
  },

  // 验证码配置
  verification: {
    codeTTL: 5 * 60, // 验证码有效期：5分钟（秒）
    codeLength: 6, // 验证码长度
    maxAttempts: 5, // 最大尝试次数
    cooldown: 60, // 发送间隔：60秒
  },

  // 登录配置
  login: {
    maxLoginAttempts: 5, // 最大登录尝试次数
    lockoutDuration: 15 * 60, // 锁定时长：15分钟（秒）
  },
};

// 导出类型定义
export type AuthConfigType = typeof AuthConfig;
