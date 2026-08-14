import { BadRequestException } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { promises as dns } from 'dns';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP } from 'net';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

const blockedNetworks = new BlockList();

[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) =>
  blockedNetworks.addSubnet(address as string, prefix as number, 'ipv4'),
);
blockedNetworks.addAddress('255.255.255.255', 'ipv4');

blockedNetworks.addAddress('::', 'ipv6');
blockedNetworks.addAddress('::1', 'ipv6');
blockedNetworks.addSubnet('64:ff9b::', 96, 'ipv6');
blockedNetworks.addSubnet('100::', 64, 'ipv6');
blockedNetworks.addSubnet('2001::', 32, 'ipv6');
blockedNetworks.addSubnet('2001:db8::', 32, 'ipv6');
blockedNetworks.addSubnet('2002::', 16, 'ipv6');
blockedNetworks.addSubnet('fc00::', 7, 'ipv6');
blockedNetworks.addSubnet('fe80::', 10, 'ipv6');
blockedNetworks.addSubnet('ff00::', 8, 'ipv6');

const blockedHostnames = new Set(['localhost', 'metadata', 'metadata.google.internal']);

export class RemoteUrlSecurityError extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteUrlSecurityError';
  }
}

export interface RemoteUrlGuardOptions {
  maxRedirects?: number;
}

export interface RemoteUrlFetchOptions extends RemoteUrlGuardOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

export interface RemoteUrlFetchResult {
  buffer: Buffer;
  mimeType: string;
  finalUrl: string;
}

interface SafeResolvedUrl {
  url: URL;
  hostname: string;
  addresses: Array<{ address: string; family: number }>;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '').toLowerCase();
}

function isBlockedIp(address: string): boolean {
  const ipVersion = isIP(address);
  if (!ipVersion) {
    return false;
  }

  if (ipVersion === 6) {
    const mappedIpv4 = getMappedIpv4(address);
    if (mappedIpv4) {
      return isBlockedIp(mappedIpv4);
    }
  }

  return blockedNetworks.check(address, ipVersion === 4 ? 'ipv4' : 'ipv6');
}

function getMappedIpv4(address: string): string | null {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith('::ffff:')) {
    return null;
  }

  const suffix = normalized.slice('::ffff:'.length);
  if (isIP(suffix) === 4) {
    return suffix;
  }

  const groups = suffix.split(':');
  if (groups.length !== 2) {
    return null;
  }

  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return null;
  }

  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}

function assertParsedUrlSafe(parsedUrl: URL) {
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new RemoteUrlSecurityError('仅允许访问 http/https URL');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new RemoteUrlSecurityError('远程 URL 不允许包含认证信息');
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (!hostname || blockedHostnames.has(hostname) || hostname.endsWith('.localhost')) {
    throw new RemoteUrlSecurityError('远程 URL 主机不允许访问');
  }

  const ipVersion = isIP(hostname);
  if (ipVersion && isBlockedIp(hostname)) {
    throw new RemoteUrlSecurityError('远程 URL 解析到受保护地址');
  }
}

async function resolveHostnameSafely(
  parsedUrl: URL,
): Promise<Array<{ address: string; family: number }>> {
  const hostname = normalizeHostname(parsedUrl.hostname);
  const ipVersion = isIP(hostname);
  if (ipVersion) {
    return [{ address: hostname, family: ipVersion }];
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: false });
  } catch {
    throw new RemoteUrlSecurityError('远程 URL 域名解析失败');
  }

  if (!addresses.length) {
    throw new RemoteUrlSecurityError('远程 URL 域名没有可用解析结果');
  }

  for (const address of addresses) {
    if (isBlockedIp(address.address)) {
      throw new RemoteUrlSecurityError('远程 URL DNS 解析到受保护地址');
    }
  }

  return addresses;
}

async function resolveSafeRemoteUrl(rawUrl: string): Promise<SafeResolvedUrl> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new RemoteUrlSecurityError('远程 URL 格式无效');
  }

  assertParsedUrlSafe(parsedUrl);
  const hostname = normalizeHostname(parsedUrl.hostname);
  const addresses = await resolveHostnameSafely(parsedUrl);

  return { url: parsedUrl, hostname, addresses };
}

export async function assertSafeRemoteUrl(
  rawUrl: string,
  _options: RemoteUrlGuardOptions = {},
): Promise<URL> {
  const resolvedUrl = await resolveSafeRemoteUrl(rawUrl);
  return resolvedUrl.url;
}

function getHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value[0] === undefined ? undefined : String(value[0]);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

function assertContentLengthWithinLimit(headers: any, maxBytes: number) {
  const contentLength = Number(getHeaderValue(headers?.['content-length']));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RemoteUrlSecurityError('远程 URL 响应超过大小限制');
  }
}

function toBuffer(data: any): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.from(data || '');
}

function createPinnedLookup(resolvedUrl: SafeResolvedUrl) {
  return (hostname: string, options: any, callback?: any) => {
    const cb = typeof options === 'function' ? options : callback;
    const lookupOptions = typeof options === 'function' ? {} : options || {};
    const requestedHostname = normalizeHostname(hostname);

    if (requestedHostname !== resolvedUrl.hostname) {
      cb(new RemoteUrlSecurityError('远程 URL 请求主机与已校验主机不一致'));
      return;
    }

    let candidates = resolvedUrl.addresses;
    if (lookupOptions.family === 4 || lookupOptions.family === 6) {
      candidates = candidates.filter(address => address.family === lookupOptions.family);
    }
    if (!candidates.length) {
      cb(new RemoteUrlSecurityError('远程 URL 没有匹配的已校验解析结果'));
      return;
    }

    if (lookupOptions.all) {
      cb(null, candidates);
      return;
    }

    const selected = candidates[0];
    cb(null, selected.address, selected.family);
  };
}

function createPinnedAgents(resolvedUrl: SafeResolvedUrl) {
  const lookup = createPinnedLookup(resolvedUrl);
  return {
    httpAgent: new http.Agent({ keepAlive: false, lookup }),
    httpsAgent: new https.Agent({ keepAlive: false, lookup }),
  };
}

export async function fetchRemoteUrlBuffer(
  rawUrl: string,
  options: RemoteUrlFetchOptions = {},
): Promise<RemoteUrlFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const resolvedUrl = await resolveSafeRemoteUrl(currentUrl);
    const parsedUrl = resolvedUrl.url;
    const { httpAgent, httpsAgent } = createPinnedAgents(resolvedUrl);
    const requestConfig: AxiosRequestConfig = {
      responseType: 'arraybuffer',
      timeout: timeoutMs,
      maxRedirects: 0,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      httpAgent,
      httpsAgent,
      proxy: false,
      headers: options.headers,
      validateStatus: status => status >= 200 && status < 400,
    };

    const response = await axios.get(parsedUrl.toString(), requestConfig);

    if (response.status >= 300 && response.status < 400) {
      const location = getHeaderValue(response.headers?.location);
      if (!location) {
        throw new RemoteUrlSecurityError('远程 URL 重定向缺少 Location');
      }
      if (redirectCount >= maxRedirects) {
        throw new RemoteUrlSecurityError('远程 URL 重定向次数超过限制');
      }
      currentUrl = new URL(location, parsedUrl).toString();
      continue;
    }

    assertContentLengthWithinLimit(response.headers, maxBytes);
    const buffer = toBuffer(response.data);
    if (buffer.length > maxBytes) {
      throw new RemoteUrlSecurityError('远程 URL 响应超过大小限制');
    }

    return {
      buffer,
      mimeType: getHeaderValue(response.headers?.['content-type']) || 'application/octet-stream',
      finalUrl: parsedUrl.toString(),
    };
  }

  throw new RemoteUrlSecurityError('远程 URL 重定向次数超过限制');
}
