export interface JwtPayload {
  username: string;
  client: string;
  // 业务用户为数字 ID；游客在运行时使用 `visitor:<hash>`，各游客分支会先按 role 收窄并转字符串。
  id?: number;
  sid?: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      abortController?: AbortController;
    }
  }
}
