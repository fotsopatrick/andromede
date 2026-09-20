import { startLocalServer, type LocalServerHandle } from '../mcp-local/context-server.ts';
import { McpContextGateway } from '../agent/src/contextClient.ts';
import { RuleVerdictAgent } from '../agent/src/agent.ts';
import { SEED_DOCUMENTS } from '../scripts/seed-data.ts';

/**
 * Montage de banc : un endpoint Context MCP local (fidèle au mode GROQ) est
 * démarré sur un port éphémère, puis l'agent s'y connecte via le VRAI client
 * MCP Streamable HTTP. Les tests rejouent donc le protocole complet
 * (initialize → tools/list → tools/call), pas des fonctions mockées.
 */
export interface Fixture {
  agent: RuleVerdictAgent;
  gateway: McpContextGateway;
  handle: LocalServerHandle;
  close: () => Promise<void>;
}

export async function buildFixture(): Promise<Fixture> {
  const handle = await startLocalServer(SEED_DOCUMENTS, 'challenge-fixture', 'production');
  const gateway = new McpContextGateway(handle.url);
  await gateway.connect();
  const agent = new RuleVerdictAgent(gateway);
  return {
    agent,
    gateway,
    handle,
    close: async () => {
      await gateway.close();
      await handle.close();
    },
  };
}