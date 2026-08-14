import { isMcpToolAllowed } from './mcpAuthorization';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('MCP tool authorization', () => {
  it('denies missing actors and regular users by default', () => {
    expect(isMcpToolAllowed(undefined, 'files', 'read', {})).toBe(false);
    expect(isMcpToolAllowed({ id: 1, role: 'user' }, 'files', 'read', {})).toBe(false);
  });

  it('allows super administrators', () => {
    expect(isMcpToolAllowed({ id: 1, role: 'super' }, 'files', 'write', {})).toBe(true);
  });

  it('requires both an allowed role and an exact client/tool entry', () => {
    const env = {
      MCP_TOOL_ALLOWED_ROLES: 'user',
      MCP_TOOL_ALLOWLIST: 'files/read,calendar/list',
    } as NodeJS.ProcessEnv;

    expect(isMcpToolAllowed({ id: 2, role: 'user' }, 'files', 'read', env)).toBe(true);
    expect(isMcpToolAllowed({ id: 2, role: 'user' }, 'files', 'write', env)).toBe(false);
    expect(isMcpToolAllowed({ id: 3, role: 'visitor' }, 'files', 'read', env)).toBe(false);
  });
});
