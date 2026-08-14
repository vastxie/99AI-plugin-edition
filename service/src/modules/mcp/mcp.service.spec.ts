import { buildSafeStdioEnv } from './mcp.service';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('buildSafeStdioEnv', () => {
  it('keeps only safe host environment variables and lets explicit config env win', () => {
    const result = buildSafeStdioEnv(
      {
        PATH: '/custom/bin',
        API_KEY: 'explicit-key',
      },
      {
        PATH: '/usr/bin',
        HOME: '/Users/service',
        USER: 'service',
        HTTP_PROXY: 'http://proxy.local:8080',
        NPM_CONFIG_CACHE: '/tmp/npm-cache',
        API_KEY: 'host-secret',
        LD_PRELOAD: '/tmp/inject.so',
        DYLD_INSERT_LIBRARIES: '/tmp/inject.dylib',
        NODE_OPTIONS: '--require /tmp/hook.js',
      },
    );

    expect(result).toMatchObject({
      PATH: '/custom/bin',
      HOME: '/Users/service',
      USER: 'service',
      HTTP_PROXY: 'http://proxy.local:8080',
      NPM_CONFIG_CACHE: '/tmp/npm-cache',
      API_KEY: 'explicit-key',
    });
    expect(result).not.toHaveProperty('LD_PRELOAD');
    expect(result).not.toHaveProperty('DYLD_INSERT_LIBRARIES');
    expect(result).not.toHaveProperty('NODE_OPTIONS');
    expect(result).not.toHaveProperty('API_KEY', 'host-secret');
  });
});
