import { Logger } from '@nestjs/common';
import { fetchRemoteUrlBuffer } from './remoteUrlGuard';

/**
 * 将图片 URL 转换为 base64 编码
 * @param imageUrl 图片 URL
 * @returns base64 编码（带 data URI 前缀）
 */
export async function convertImageToBase64(imageUrl: string): Promise<string> {
  try {
    Logger.debug('开始转换远程图片为 base64', 'ImageUtil');

    const { buffer, mimeType } = await fetchRemoteUrlBuffer(imageUrl, {
      timeoutMs: 30000,
      maxBytes: 10 * 1024 * 1024,
      maxRedirects: 3,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': '99AI-Image-Fetch/1.0',
      },
    });

    // 转换为 base64
    const base64 = buffer.toString('base64');

    // 返回带前缀的 data URI
    const result = `data:${mimeType || 'image/png'};base64,${base64}`;
    Logger.debug(`图片转换成功，原始大小: ${buffer.length} bytes`, 'ImageUtil');

    return result;
  } catch (error: any) {
    if (error?.name === 'RemoteUrlSecurityError') {
      Logger.warn(`转换图片被安全策略拦截: ${error.message}`, 'ImageUtil');
      throw new Error(`无法转换图片: ${error.message}`);
    }

    Logger.error(`转换图片失败: ${error.message}`, error?.stack, 'ImageUtil');
    throw new Error(`无法转换图片: ${error.message}`);
  }
}

/**
 * 批量转换图片 URL 为 base64
 * @param imageUrls 图片 URL 数组
 * @returns base64 数组
 */
export async function convertImagesToBase64(imageUrls: string[]): Promise<string[]> {
  const promises = imageUrls.map(url => convertImageToBase64(url));
  return Promise.all(promises);
}

/**
 * 从文本中提取所有图片 URL
 * @param text 文本内容
 * @returns 图片 URL 数组
 */
export function extractImageUrls(text: string): string[] {
  const urlPattern = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp))/gi;
  const matches = text.match(urlPattern);
  return matches || [];
}
