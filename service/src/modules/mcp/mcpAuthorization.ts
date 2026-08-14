export interface McpActor {
  id?: number | string;
  role?: string;
}

export function isMcpToolAllowed(
  actor: McpActor | undefined,
  clientName: string,
  toolName: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!actor?.role) return false;
  if (actor.role === 'super') return true;

  const allowedRoles = new Set(
    String(env.MCP_TOOL_ALLOWED_ROLES || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  );
  if (!allowedRoles.has(actor.role)) return false;

  const allowlist = new Set(
    String(env.MCP_TOOL_ALLOWLIST || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  );
  return allowlist.has(`${clientName}/${toolName}`);
}
