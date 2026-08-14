import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '../../common/auth/superAuth.guard';
import { MCPController } from './mcp.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('MCPController guards', () => {
  const configMethods = ['queryMcpConfig', 'createConfig', 'deleteMcpConfig', 'updateConfig'];

  it('protects MCP configuration management with SuperAuthGuard', () => {
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, MCPController) || [];

    expect(classGuards).toContain(SuperAuthGuard);
    expect(classGuards).not.toContain(JwtAuthGuard);
  });

  it('does not downgrade MCP configuration methods to JwtAuthGuard', () => {
    configMethods.forEach(methodName => {
      const methodGuards =
        Reflect.getMetadata(GUARDS_METADATA, MCPController.prototype[methodName]) || [];

      expect(methodGuards).not.toContain(JwtAuthGuard);
    });
  });
});
