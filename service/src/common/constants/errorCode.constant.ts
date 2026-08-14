/**
 * 错误码常量定义
 * 错误码格式: XXXYYY
 * XXX: 模块代码 (100-999)
 * YYY: 具体错误代码 (001-999)
 */

export enum ErrorCode {
  // ============ 通用错误 100XXX ============
  SUCCESS = 0,
  UNKNOWN_ERROR = 100001,
  INVALID_PARAM = 100002,
  SYSTEM_ERROR = 100003,
  DATABASE_ERROR = 100004,
  NETWORK_ERROR = 100005,
  PERMISSION_DENIED = 100006,
  OPERATION_FAILED = 100007,
  RESOURCE_NOT_FOUND = 100008,
  RATE_LIMIT_EXCEEDED = 100009,

  // ============ 认证相关 101XXX ============
  USER_NOT_FOUND = 101001,
  PASSWORD_ERROR = 101002,
  USER_DISABLED = 101003,
  USER_BANNED = 101004,
  TOKEN_INVALID = 101005,
  TOKEN_EXPIRED = 101006,
  LOGIN_REQUIRED = 101007,
  USERNAME_OR_EMAIL_EXISTS = 101008,
  VERIFICATION_CODE_ERROR = 101009,
  VERIFICATION_CODE_EXPIRED = 101010,
  PHONE_NOT_BOUND = 101011,
  REAL_NAME_AUTH_REQUIRED = 101012,

  // ============ 会话相关 102XXX ============
  CONVERSATION_NOT_FOUND = 102001,
  CONVERSATION_CREATE_FAILED = 102002,
  CONVERSATION_UPDATE_FAILED = 102003,
  CONVERSATION_DELETE_FAILED = 102004,
  APP_CONVERSATION_NAME_READONLY = 102005,
  CONVERSATION_REQUIRED = 102006,

  // ============ 应用相关 103XXX ============
  APP_NOT_FOUND = 103001,
  APP_DISABLED = 103002,
  APP_INVALID = 103003,

  // ============ 余额相关 104XXX ============
  BALANCE_INSUFFICIENT = 104001,
  QUOTA_EXCEEDED = 104002,
  MEMBER_REQUIRED = 104003,
  MEMBER_EXPIRED = 104004,

  // ============ 上传相关 105XXX ============
  UPLOAD_FAILED = 105001,
  UPLOAD_RATE_LIMIT = 105002,
  UPLOAD_CONFIG_MISSING = 105003,
  FILE_TOO_LARGE = 105004,
  FILE_TYPE_NOT_SUPPORTED = 105005,
  IMAGE_FETCH_FAILED = 105006,

  // ============ 支付相关 106XXX ============
  PAYMENT_FAILED = 106001,
  PAYMENT_TIMEOUT = 106002,
  PAYMENT_NOT_ENABLED = 106003,
  PAYMENT_NOT_COMPLETED = 106004,

  // ============ 内容相关 107XXX ============
  CONTENT_VIOLATION = 107001,
  SENSITIVE_CONTENT = 107002,
  CONTENT_TOO_LONG = 107003,

  // ============ 配置相关 108XXX ============
  CONFIG_NOT_FOUND = 108001,
  CONFIG_INVALID = 108002,
  CONFIG_UPDATE_FAILED = 108003,

  // ============ 自动回复相关 109XXX ============
  AUTO_REPLY_NOT_FOUND = 109001,
  AUTO_REPLY_UPDATE_FAILED = 109002,
  AUTO_REPLY_DELETE_FAILED = 109003,

  // ============ 分享相关 110XXX ============
  SHARE_CREATE_FAILED = 110001,
  SHARE_NOT_FOUND = 110002,
  SHARE_EXPIRED = 110003,

  // ============ 工作流相关 111XXX ============
  WORKFLOW_EXECUTION_FAILED = 111001,
  WORKFLOW_NODE_ERROR = 111002,
  WORKFLOW_TIMEOUT = 111003,

  // ============ MCP工具相关 112XXX ============
  MCP_TOOL_NOT_FOUND = 112001,
  MCP_TOOL_EXECUTION_FAILED = 112002,
  MCP_TOOL_DISABLED = 112003,

  // ============ 模型相关 113XXX ============
  MODEL_NOT_FOUND = 113001,
  MODEL_DISABLED = 113002,
  MODEL_QUOTA_EXCEEDED = 113003,
  MODEL_REQUEST_FAILED = 113004,

  // ============ PDF相关 114XXX ============
  PDF_PARSE_FAILED = 114001,
  PDF_TOO_LARGE = 114002,

  // ============ 数据库初始化相关 115XXX ============
  INIT_SUPER_ADMIN_FAILED = 115001,
  INIT_CONFIG_FAILED = 115002,
}

/**
 * 错误码到消息键的映射
 * 前端使用这个键从语言文件中获取对应的错误消息
 */
export const ErrorCodeMessageKey: Record<ErrorCode, string> = {
  [ErrorCode.SUCCESS]: 'error.success',
  [ErrorCode.UNKNOWN_ERROR]: 'error.unknownError',
  [ErrorCode.INVALID_PARAM]: 'error.invalidParam',
  [ErrorCode.SYSTEM_ERROR]: 'error.systemError',
  [ErrorCode.DATABASE_ERROR]: 'error.databaseError',
  [ErrorCode.NETWORK_ERROR]: 'error.networkError',
  [ErrorCode.PERMISSION_DENIED]: 'error.permissionDenied',
  [ErrorCode.OPERATION_FAILED]: 'error.operationFailed',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'error.resourceNotFound',
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'error.rateLimitExceeded',

  [ErrorCode.USER_NOT_FOUND]: 'error.userNotFound',
  [ErrorCode.PASSWORD_ERROR]: 'error.passwordError',
  [ErrorCode.USER_DISABLED]: 'error.userDisabled',
  [ErrorCode.USER_BANNED]: 'error.userBanned',
  [ErrorCode.TOKEN_INVALID]: 'error.tokenInvalid',
  [ErrorCode.TOKEN_EXPIRED]: 'error.tokenExpired',
  [ErrorCode.LOGIN_REQUIRED]: 'error.loginRequired',
  [ErrorCode.USERNAME_OR_EMAIL_EXISTS]: 'error.usernameOrEmailExists',
  [ErrorCode.VERIFICATION_CODE_ERROR]: 'error.verificationCodeError',
  [ErrorCode.VERIFICATION_CODE_EXPIRED]: 'error.verificationCodeExpired',
  [ErrorCode.PHONE_NOT_BOUND]: 'error.phoneNotBound',
  [ErrorCode.REAL_NAME_AUTH_REQUIRED]: 'error.realNameAuthRequired',

  [ErrorCode.CONVERSATION_NOT_FOUND]: 'error.conversationNotFound',
  [ErrorCode.CONVERSATION_CREATE_FAILED]: 'error.conversationCreateFailed',
  [ErrorCode.CONVERSATION_UPDATE_FAILED]: 'error.conversationUpdateFailed',
  [ErrorCode.CONVERSATION_DELETE_FAILED]: 'error.conversationDeleteFailed',
  [ErrorCode.APP_CONVERSATION_NAME_READONLY]: 'error.appConversationNameReadonly',
  [ErrorCode.CONVERSATION_REQUIRED]: 'error.conversationRequired',

  [ErrorCode.APP_NOT_FOUND]: 'error.appNotFound',
  [ErrorCode.APP_DISABLED]: 'error.appDisabled',
  [ErrorCode.APP_INVALID]: 'error.appInvalid',

  [ErrorCode.BALANCE_INSUFFICIENT]: 'error.balanceInsufficient',
  [ErrorCode.QUOTA_EXCEEDED]: 'error.quotaExceeded',
  [ErrorCode.MEMBER_REQUIRED]: 'error.memberRequired',
  [ErrorCode.MEMBER_EXPIRED]: 'error.memberExpired',

  [ErrorCode.UPLOAD_FAILED]: 'error.uploadFailed',
  [ErrorCode.UPLOAD_RATE_LIMIT]: 'error.uploadRateLimit',
  [ErrorCode.UPLOAD_CONFIG_MISSING]: 'error.uploadConfigMissing',
  [ErrorCode.FILE_TOO_LARGE]: 'error.fileTooLarge',
  [ErrorCode.FILE_TYPE_NOT_SUPPORTED]: 'error.fileTypeNotSupported',
  [ErrorCode.IMAGE_FETCH_FAILED]: 'error.imageFetchFailed',

  [ErrorCode.PAYMENT_FAILED]: 'error.paymentFailed',
  [ErrorCode.PAYMENT_TIMEOUT]: 'error.paymentTimeout',
  [ErrorCode.PAYMENT_NOT_ENABLED]: 'error.paymentNotEnabled',
  [ErrorCode.PAYMENT_NOT_COMPLETED]: 'error.paymentNotCompleted',

  [ErrorCode.CONTENT_VIOLATION]: 'error.contentViolation',
  [ErrorCode.SENSITIVE_CONTENT]: 'error.sensitiveContent',
  [ErrorCode.CONTENT_TOO_LONG]: 'error.contentTooLong',

  [ErrorCode.CONFIG_NOT_FOUND]: 'error.configNotFound',
  [ErrorCode.CONFIG_INVALID]: 'error.configInvalid',
  [ErrorCode.CONFIG_UPDATE_FAILED]: 'error.configUpdateFailed',

  [ErrorCode.AUTO_REPLY_NOT_FOUND]: 'error.autoReplyNotFound',
  [ErrorCode.AUTO_REPLY_UPDATE_FAILED]: 'error.autoReplyUpdateFailed',
  [ErrorCode.AUTO_REPLY_DELETE_FAILED]: 'error.autoReplyDeleteFailed',

  [ErrorCode.SHARE_CREATE_FAILED]: 'error.shareCreateFailed',
  [ErrorCode.SHARE_NOT_FOUND]: 'error.shareNotFound',
  [ErrorCode.SHARE_EXPIRED]: 'error.shareExpired',

  [ErrorCode.WORKFLOW_EXECUTION_FAILED]: 'error.workflowExecutionFailed',
  [ErrorCode.WORKFLOW_NODE_ERROR]: 'error.workflowNodeError',
  [ErrorCode.WORKFLOW_TIMEOUT]: 'error.workflowTimeout',

  [ErrorCode.MCP_TOOL_NOT_FOUND]: 'error.mcpToolNotFound',
  [ErrorCode.MCP_TOOL_EXECUTION_FAILED]: 'error.mcpToolExecutionFailed',
  [ErrorCode.MCP_TOOL_DISABLED]: 'error.mcpToolDisabled',

  [ErrorCode.MODEL_NOT_FOUND]: 'error.modelNotFound',
  [ErrorCode.MODEL_DISABLED]: 'error.modelDisabled',
  [ErrorCode.MODEL_QUOTA_EXCEEDED]: 'error.modelQuotaExceeded',
  [ErrorCode.MODEL_REQUEST_FAILED]: 'error.modelRequestFailed',

  [ErrorCode.PDF_PARSE_FAILED]: 'error.pdfParseFailed',
  [ErrorCode.PDF_TOO_LARGE]: 'error.pdfTooLarge',

  [ErrorCode.INIT_SUPER_ADMIN_FAILED]: 'error.initSuperAdminFailed',
  [ErrorCode.INIT_CONFIG_FAILED]: 'error.initConfigFailed',
};
