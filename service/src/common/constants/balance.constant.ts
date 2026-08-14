export const ChatType = {
  NORMAL_CHAT: 1, // 普通对话
  PAINT: 2, // 图片生成
  VIDEO: 3, // 视频生成
  MUSIC: 4, // 音乐生成
  OTHER: 5, // 其他类型
};

/**
 * @description: 账户充值类型
 * @param {type}
 * 1: 注册赠送  2: 受邀请赠送  3: 邀请人赠送  4: 购买套餐赠送  5: 管理员赠送 6：扫码支付 7: 退款 8: 签到奖励 9: 管理员批量充值
 * 10-14: 消费类型（对话、图片、视频、音乐、其他）
 */
export const RechargeType = {
  // 充值类型（1-9）
  REG_GIFT: 1,
  INVITE_GIFT: 2,
  REFER_GIFT: 3,
  PACKAGE_GIFT: 4,
  ADMIN_GIFT: 5,
  SCAN_PAY: 6,
  REFUND: 7, // 退款（任务失败、服务异常等场景的积分退还）
  SIGN_IN: 8,
  RECHARGE_BY_ADMIN: 9, // 管理员批量充值
  // 消费类型（10-14）
  CHAT_DEDUCT: 10, // 对话消费
  IMAGE_DEDUCT: 11, // 图片生成消费
  VIDEO_DEDUCT: 12, // 视频生成消费
  MUSIC_DEDUCT: 13, // 音乐生成消费
  OTHER_DEDUCT: 14, // 其他消费
};
