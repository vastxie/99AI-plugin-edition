/**
 * 规范化API基础URL
 * @param baseUrl - 需要规范化的API基础URL
 * @returns 规范化后的URL字符串
 */
export async function correctApiBaseUrl(baseUrl: string) {
  if (!baseUrl) return '';

  // 去除两端空格
  let url = baseUrl.trim();

  // 如果URL以斜杠'/'结尾，则移除这个斜杠
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // 对于通用视频服务，不自动添加版本号
  // 用户应该提供完整的 API 地址，例如 https://api.example.com/v2

  // 只对标准的OpenAI兼容API添加/v1（如果URL不包含版本号且不是特殊服务）
  const isSpecialService = url.includes('/v2') || url.includes('/v3') || url.includes('/api/v');

  if (!isSpecialService && !/\/v\d+(?:beta|alpha)?/.test(url)) {
    // 如果不包含任何版本号且不是特殊服务，添加 /v1
    return `${url}/v1`;
  }

  return url;
}
