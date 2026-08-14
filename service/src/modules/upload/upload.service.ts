import { fetchRemoteUrlBuffer, formatUrl, removeSpecialCharacters } from '@/common/utils';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ALIOSS from 'ali-oss';
import axios from 'axios';
import * as COS from 'cos-nodejs-sdk-v5';
import FormData from 'form-data';
import { randomBytes } from 'crypto';
// import * as fs from 'fs';
import { promises as fs } from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { RedisCacheService } from '../redisCache/redisCache.service';

// ✅ 白名单机制：只允许已知安全的文件类型
// 包含：图片、视频、文档等常见安全类型
const whitelist = [
  // 图片格式
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  // 'svg', // 已移除白名单，仅 super 管理员允许上传（见下方动态白名单逻辑）
  'ico',
  'avif',
  'tif',
  'tiff',
  'psd',
  'raw',
  'heic',
  'heif',
  // 视频格式
  'mp4',
  'avi',
  'mov',
  'wmv',
  'flv',
  'mkv',
  'webm',
  'm4v',
  'mpg',
  'mpeg',
  '3gp',
  'ogv',
  'ts',
  'm3u8',
  // 文档格式
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'rtf',
  'odt',
  'ods',
  'odp',
  'csv',
  'json',
  'xml',
  'md',
];

@Injectable()
export class UploadService implements OnModuleInit {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
  ) {}
  private tencentCos: any;

  onModuleInit() {}

  /**
   * 验证文件内容（magic bytes）与扩展名是否匹配
   * 防止通过伪造 Content-Type 头绕过白名单
   */
  private validateFileMagic(buffer: Buffer, extension: string): boolean {
    // 文件格式对应的 magic bytes（十六进制）
    const signatures: Record<string, number[][]> = {
      jpg: [[0xff, 0xd8, 0xff]],
      jpeg: [[0xff, 0xd8, 0xff]],
      png: [[0x89, 0x50, 0x4e, 0x47]],
      gif: [[0x47, 0x49, 0x46, 0x38]],
      webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF header (WebP starts with RIFF...WEBP)
      bmp: [[0x42, 0x4d]],
      avif: [[0x00, 0x00, 0x00]], // ftyp box
      ico: [[0x00, 0x00, 0x01, 0x00]],
      tif: [[0x49, 0x49, 0x2a, 0x00]],
      tiff: [[0x49, 0x49, 0x2a, 0x00]],
      psd: [[0x38, 0x42, 0x50, 0x53]],
      mp4: [[0x00, 0x00, 0x00]], // ftyp box
      avi: [[0x52, 0x49, 0x46, 0x46]],
      mkv: [[0x1a, 0x45, 0xdf, 0xa3]],
      webm: [[0x1a, 0x45, 0xdf, 0xa3]],
      mov: [[0x00, 0x00, 0x00]],
      flv: [[0x46, 0x4c, 0x56]],
      pdf: [[0x25, 0x50, 0x44, 0x46]],
      doc: [[0xd0, 0xcf, 0x11, 0xe0]], // OLE2 compound document
      xls: [[0xd0, 0xcf, 0x11, 0xe0]],
      ppt: [[0xd0, 0xcf, 0x11, 0xe0]],
      docx: [[0x50, 0x4b, 0x03, 0x04]], // ZIP-based (Office Open XML)
      xlsx: [[0x50, 0x4b, 0x03, 0x04]],
      pptx: [[0x50, 0x4b, 0x03, 0x04]],
      odt: [[0x50, 0x4b, 0x03, 0x04]], // ZIP-based
      ods: [[0x50, 0x4b, 0x03, 0x04]],
      odp: [[0x50, 0x4b, 0x03, 0x04]],
      zip: [[0x50, 0x4b, 0x03, 0x04]],
    };

    const ext = extension.toLowerCase();

    // 无固定签名的纯文本格式，跳过校验
    const textFormats = [
      'txt',
      'rtf',
      'csv',
      'json',
      'xml',
      'md',
      'svg',
      'ts',
      'm3u8',
      'mpg',
      'mpeg',
      '3gp',
      'ogv',
      'm4v',
      'wmv',
      'heic',
      'heif',
      'raw',
      'odt',
    ];
    if (textFormats.includes(ext)) {
      return true;
    }

    const expected = signatures[ext];
    if (!expected) {
      return true; // 未配置签名的格式，放行
    }

    if (!buffer || buffer.length < 4) {
      return false;
    }

    return expected.some(sig => sig.every((byte, i) => buffer[i] === byte));
  }

  // 检查用户上传频率
  private async checkUploadFrequency(userId: number): Promise<void> {
    const hourlyKey = `upload:frequency:${userId}:${new Date().getHours()}`;

    // 获取当前小时的上传次数
    const uploadCount = await this.redisCacheService.get({ key: hourlyKey });
    const count = uploadCount ? parseInt(uploadCount) : 0;

    // 检查是否超过限制(1小时100次)
    if (count >= 100) {
      throw new HttpException('您的上传频率过高，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 更新上传次数，设置过期时间为1小时
    await this.redisCacheService.set({ key: hourlyKey, val: (count + 1).toString() }, 3600);
  }

  async uploadFile(file, dir = 'others', user = null) {
    // 如果存在用户信息，则进行频率检查
    if (user && user.id) {
      await this.checkUploadFrequency(user.id);
    }

    const { buffer, mimetype, size } = file;

    // 从配置中读取文件大小限制
    const uploadFileSizeLimitRaw = await this.globalConfigService.getConfigs([
      'uploadFileSizeLimit',
    ]);
    const uploadFileSizeLimit = Number(uploadFileSizeLimitRaw) || 20;
    const maxSize = uploadFileSizeLimit * 1024 * 1024; // 转换为字节

    // 获取实际文件大小（优先使用 size，如果不存在则使用 buffer.length）
    const fileSize = size || buffer?.length || 0;

    // 检查文件大小
    if (fileSize > maxSize) {
      const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
      Logger.error(`文件过大: ${fileSizeMB}MB，限制: ${uploadFileSizeLimit}MB`, 'UploadService');
      throw new HttpException(
        `文件大小超出限制，当前: ${fileSizeMB}MB，最大支持: ${uploadFileSizeLimit}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    if (process.env.ISDEV === 'true') {
      dir = `dev/${dir}`;
    }
    // 使用 mime-types 库获取文件扩展名
    const fileExtension = mime.extension(mimetype) || '';
    if (!fileExtension) {
      Logger.error('无法识别文件类型，请检查文件', 'UploadService');

      // throw new HttpException(
      //   '无法识别文件类型，请检查文件',
      //   HttpStatus.UNSUPPORTED_MEDIA_TYPE
      // );
    }

    // 检查文件扩展名是否在白名单中（super 管理员额外允许 SVG）
    const allowedExtensions = user?.role === 'super' ? [...whitelist, 'svg'] : whitelist;
    if (!allowedExtensions.includes(fileExtension.toLowerCase())) {
      Logger.error(`不允许上传此类型的文件: ${fileExtension}`, 'UploadService');
      throw new HttpException(
        `不支持的文件类型: .${fileExtension}，仅支持图片、视频、文档格式`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    // 验证文件内容（magic bytes）与声称的扩展名是否匹配
    if (!this.validateFileMagic(buffer, fileExtension)) {
      Logger.error(`文件内容与类型不匹配: ${fileExtension}`, 'UploadService');
      throw new HttpException(
        `文件内容与声明的类型不一致，请上传真实的 .${fileExtension} 文件`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const filename = `${Date.now()}_${randomBytes(16).toString('hex')}.${fileExtension}`;

    const {
      tencentCosStatus = 0,
      aliOssStatus = 0,
      cheveretoStatus = 0,
      localStorageStatus = 0,
      s3Status = 0,
    } = await this.globalConfigService.getConfigs([
      'tencentCosStatus',
      'aliOssStatus',
      'cheveretoStatus',
      'localStorageStatus',
      's3Status',
    ]);

    if (
      !Number(tencentCosStatus) &&
      !Number(aliOssStatus) &&
      !Number(cheveretoStatus) &&
      !Number(localStorageStatus) &&
      !Number(s3Status)
    ) {
      Logger.error('未配置任何上传方式', 'UploadService');
      throw new HttpException('请先前往后台配置上传图片的方式', HttpStatus.BAD_REQUEST);
    }

    try {
      if (Number(localStorageStatus)) {
        const result = await this.uploadFileToLocal({ filename, buffer, dir });
        Logger.log('文件上传完成 (本地)', 'UploadService');
        return result;
      }
      if (Number(s3Status)) {
        const result = await this.uploadFileByS3({ filename, buffer, dir });
        Logger.log('文件上传完成 (S3)', 'UploadService');
        return result;
      }
      if (Number(tencentCosStatus)) {
        const result = await this.uploadFileByTencentCos({
          filename,
          buffer,
          dir,
        });
        Logger.log('文件上传完成 (腾讯云)', 'UploadService');
        return result;
      }
      if (Number(aliOssStatus)) {
        const result = await this.uploadFileByAliOss({
          filename,
          buffer,
          dir,
        });
        Logger.log('文件上传完成 (阿里云)', 'UploadService');
        return result;
      }
      if (Number(cheveretoStatus)) {
        const result = await this.uploadFileByChevereto({
          filename,
          buffer: buffer.toString('base64'),
        });
        Logger.log('文件上传完成 (Chevereto)', 'UploadService');
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`上传失败: ${errorMessage}`, 'UploadService');
      throw error; // 重新抛出异常，以便调用方可以处理
    }
  }

  async getUploadType() {
    const {
      tencentCosStatus = 0,
      aliOssStatus = 0,
      cheveretoStatus = 0,
      s3Status = 0,
    } = await this.globalConfigService.getConfigs([
      'tencentCosStatus',
      'aliOssStatus',
      'cheveretoStatus',
      's3Status',
    ]);
    if (Number(s3Status)) {
      return 's3';
    }
    if (Number(tencentCosStatus)) {
      return 'tencent';
    }
    if (Number(aliOssStatus)) {
      return 'ali';
    }
    if (Number(cheveretoStatus)) {
      return 'chevereto';
    }
  }

  async uploadFileFromUrl({ url, dir = 'others' }) {
    if (process.env.ISDEV === 'true') {
      dir = `dev/${dir}`;
    }

    const { buffer, mimeType } = await this.getBufferFromUrl(url);

    return await this.uploadFile({ buffer, mimetype: mimeType }, dir);
  }

  /* 通过腾讯云上传图片 */
  async uploadFileByTencentCos({ filename, buffer, dir }) {
    const { Bucket, Region, SecretId, SecretKey } = await this.getUploadConfig('tencent');
    this.tencentCos = new COS({
      SecretId,
      SecretKey,
      FileParallelLimit: 10,
    });
    try {
      return new Promise(async (resolve, reject) => {
        this.tencentCos.putObject(
          {
            Bucket: removeSpecialCharacters(Bucket),
            Region: removeSpecialCharacters(Region),
            Key: `${dir}/${filename}`,
            StorageClass: 'STANDARD',
            Body: buffer,
          },
          async (err, data) => {
            if (err) {
              Logger.error(`腾讯云COS上传失败: ${err.message}`, 'UploadService');
              return reject(err);
            }
            let locationUrl = data.Location.replace(
              /^(http:\/\/|https:\/\/|\/\/|)(.*)/,
              'https://$2',
            );
            const { acceleratedDomain } = await this.getUploadConfig('tencent');
            if (acceleratedDomain) {
              locationUrl = locationUrl.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`,
              );
            }
            return resolve(locationUrl);
          },
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`腾讯云COS上传异常: ${errorMessage}`, 'UploadService');
      throw new HttpException('上传图片失败[ten]', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过阿里云上传图片 */
  async uploadFileByAliOss({ filename, buffer, dir }) {
    const { region, bucket, accessKeyId, accessKeySecret } = await this.getUploadConfig('ali');
    const client = new ALIOSS({
      region: removeSpecialCharacters(region),
      accessKeyId,
      accessKeySecret,
      bucket: removeSpecialCharacters(bucket),
      authorizationV4: true, // 使用V4签名算法，提供更高的安全性
      secure: true,
    });
    try {
      return new Promise((resolve, reject) => {
        client
          .put(`${dir}/${filename}`, buffer)
          .then(async result => {
            const { acceleratedDomain } = await this.getUploadConfig('ali');
            if (acceleratedDomain) {
              result.url = result.url.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`,
              );
            }
            resolve(result.url);
          })
          .catch(err => {
            reject(err);
          });
      });
    } catch (error) {
      throw new HttpException('上传图片失败[ali]', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过S3上传文件 */
  async uploadFileByS3({ filename, buffer, dir }) {
    const { region, bucket, accessKeyId, secretAccessKey, endpoint, customDomain } =
      await this.getUploadConfig('s3');

    const s3Config: any = {
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    // 区域配置：如果没有设置，使用默认值 'us-east-1'
    // AWS SDK 要求必须有区域，即使是 S3 兼容服务
    if (region) {
      s3Config.region = removeSpecialCharacters(region);
    } else {
      // 为 S3 兼容服务提供默认区域，避免 SDK 报错
      s3Config.region = 'us-east-1';
    }

    // 如果有自定义端点（支持MinIO等S3兼容服务）
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true; // MinIO等服务通常需要路径样式
    }

    const s3Client = new S3Client(s3Config);

    try {
      const command = new PutObjectCommand({
        Bucket: removeSpecialCharacters(bucket),
        Key: `${dir}/${filename}`,
        Body: buffer,
        ContentType: mime.lookup(filename) || 'application/octet-stream',
      });

      const result = await s3Client.send(command);

      // 构建文件访问URL
      let fileUrl: string;
      if (customDomain) {
        // 使用自定义域名（CDN等），去除用户可能输入的协议前缀
        const cleanDomain = customDomain.replace(/^https?:\/\//, '');
        fileUrl = `https://${cleanDomain}/${dir}/${filename}`;
      } else if (endpoint) {
        // 使用自定义端点
        const endpointUrl = endpoint.replace(/^https?:\/\//, '');
        fileUrl = `https://${endpointUrl}/${bucket}/${dir}/${filename}`;
      } else if (region) {
        // 使用标准AWS S3 URL（需要区域）
        fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${dir}/${filename}`;
      } else {
        // 默认S3 URL格式（无区域）
        fileUrl = `https://${bucket}.s3.amazonaws.com/${dir}/${filename}`;
      }

      return fileUrl;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`S3上传失败: ${errorMessage}`, 'UploadService');
      Logger.error(
        `S3配置状态 - 区域: ${s3Config.region ? '已设置' : '未设置'}, 存储桶: ${
          bucket ? '已设置' : '未设置'
        }, 自定义端点: ${endpoint ? '已设置' : '未设置'}, 访问密钥: ${
          accessKeyId ? '已设置' : '未设置'
        }`,
        'UploadService',
      );
      throw new HttpException(`上传文件失败[S3]: ${errorMessage}`, HttpStatus.BAD_REQUEST);
    }
  }

  // 假设 uploadFileToLocal 是类的一个方法
  async uploadFileToLocal({ filename, buffer, dir = 'others' }) {
    // 确保目录名只包含安全字符（字母、数字、斜杠、连字符、下划线）
    const sanitizedDir = dir.replace(/[^a-zA-Z0-9\/\-_]/g, '');
    const normalizedDir = path.normalize(sanitizedDir).replace(/^(\.\.(\/|\\|$))+/, '');
    const normalizedFilename = path.basename(filename);

    const projectRoot = process.cwd(); // 获取项目根目录
    const uploadDir = path.join(projectRoot, 'public', 'file', normalizedDir);
    const filePath = path.join(uploadDir, normalizedFilename);

    // 确保最终路径在预期的目录内
    if (!filePath.startsWith(path.join(projectRoot, 'public', 'file'))) {
      throw new Error('非法路径，禁止访问目录之外的位置');
    }

    // 确保目录存在
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {
      Logger.error('创建本地上传目录失败', err?.stack, 'UploadService');
      throw err;
    }

    // // 将文件buffer写入到指定路径
    // try {
    //   await fs.writeFile(filePath, buffer);
    // } catch (err) {
    //   Logger.error(`文件保存失败: ${filePath}`, err);
    //   throw err;
    // }

    // 将文件buffer写入到指定路径并设置为只读
    try {
      await fs.writeFile(filePath, buffer, { mode: 0o444 }); // 设置文件为只读
    } catch (err) {
      Logger.error('本地上传文件保存失败', err?.stack, 'UploadService');
      throw err;
    }

    // 使用环境变量中定义的基础URL来构建完整的文件访问URL
    let fileUrl = `file/${normalizedDir}/${normalizedFilename}`;
    const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
    if (siteUrl) {
      const url = formatUrl(siteUrl);
      fileUrl = `${url}/${fileUrl}`;
    }
    // 返回文件访问的URL
    return fileUrl;
  }

  /* 通过三方图床上传图片 */
  async uploadFileByChevereto({ filename = '', buffer }) {
    const { key, uploadPath } = await this.getUploadConfig('chevereto');
    const url = uploadPath.endsWith('/') ? uploadPath.slice(0, -1) : uploadPath;
    const formData = new FormData();
    const fromBuffer = buffer.toString('base64');
    formData.append('source', fromBuffer);
    formData.append('key', key);
    formData.append('title', filename);
    try {
      const res = await axios.post(url, formData, {
        headers: { 'X-API-Key': key },
      });
      if (res?.status === 200) {
        return res.data.image.url;
      } else {
        Logger.error(
          `Chevereto上传失败 - 状态码: ${res?.data.code}, 错误信息: ${res?.data.error.message}`,
          'UploadService',
        );
        Logger.error('上传图片失败[Chevereto]', undefined, 'UploadService');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`Chevereto上传异常: ${errorMessage}`, 'UploadService');

      // 类型守卫：检查是否有 response 属性
      const errorResponse = error as any;
      const errorDetail = errorResponse?.response?.data?.error?.message || errorMessage;

      throw new HttpException(
        `上传图片失败[Chevereto|buffer] --> ${errorDetail}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 获取cos上传配置 */
  async getUploadConfig(type) {
    if (type === 'ali') {
      const {
        aliOssRegion: region,
        aliOssBucket: bucket,
        aliOssAccessKeyId: accessKeyId,
        aliOssAccessKeySecret: accessKeySecret,
        aliOssAcceleratedDomain: acceleratedDomain,
      } = await this.globalConfigService.getConfigs([
        'aliOssRegion',
        'aliOssBucket',
        'aliOssAccessKeyId',
        'aliOssAccessKeySecret',
        'aliOssAcceleratedDomain',
      ]);

      return {
        region,
        bucket,
        accessKeyId,
        accessKeySecret,
        acceleratedDomain,
      };
    }
    if (type === 'tencent') {
      const {
        cosBucket: Bucket,
        cosRegion: Region,
        cosSecretId: SecretId,
        cosSecretKey: SecretKey,
        tencentCosAcceleratedDomain: acceleratedDomain,
      } = await this.globalConfigService.getConfigs([
        'cosBucket',
        'cosRegion',
        'cosSecretId',
        'cosSecretKey',
        'tencentCosAcceleratedDomain',
      ]);
      return { Bucket, Region, SecretId, SecretKey, acceleratedDomain };
    }
    if (type === 's3') {
      const {
        s3Region: region,
        s3Bucket: bucket,
        s3AccessKeyId: accessKeyId,
        s3SecretAccessKey: secretAccessKey,
        s3Endpoint: endpoint,
        s3CustomDomain: customDomain,
      } = await this.globalConfigService.getConfigs([
        's3Region',
        's3Bucket',
        's3AccessKeyId',
        's3SecretAccessKey',
        's3Endpoint',
        's3CustomDomain',
      ]);
      return { region, bucket, accessKeyId, secretAccessKey, endpoint, customDomain };
    }
    if (type === 'chevereto') {
      const { cheveretoKey: key, cheveretoUploadPath: uploadPath } =
        await this.globalConfigService.getConfigs(['cheveretoKey', 'cheveretoUploadPath']);
      return { key, uploadPath };
    }
  }

  async getBufferFromUrl(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const { buffer, mimeType } = await fetchRemoteUrlBuffer(url, {
      timeoutMs: 30000,
      maxBytes: 20 * 1024 * 1024,
      maxRedirects: 3,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    Logger.debug(`成功下载远程资源，大小: ${buffer.length} bytes`, 'UploadService');
    return { buffer, mimeType };
  }
}
