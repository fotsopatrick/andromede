import { RuleVerdictAgent } from './agent.ts';
import { McpContextGateway } from './contextClient.ts';
import { formatAnswer } from './model.ts';
import { startLocalServer } from '../../mcp-local/context-server.ts';
import { SEED_DOCUMENTS } from '../../scripts/seed-data.ts';

/**
 * CLI DE L'AGENT.
 *
 *   npm run agent -- "Quelle est la température maximale configurable ?"
 *   npm run agent -- --trace "Jusqu'à quelle altitude puis-je installer le module CTRL-7 ?"
 *
 * Connexion MCP :
 *   - par défaut : serveur Context MCP LOCAL (fidèle au mode GROQ de Sanity
 *     Context) démarré en mémoire par ce process ;
 *   - sinon --endpoint <url> ou MCP_ENDPOINT_URL → vrai endpoint hébergé
 *     (https://api.sanity.io/v1/context/organizations/{org}/mcp/{endpoint}),
 *     avec MCP_ENDPOINT_TOKEN en Bearer.
 */

async function main() {
  const args = process.argv.slice(2);
  let showTrace = false;
  let asJson = false;
  let endpoint = process.env.MCP_ENDPOINT_URL ?? '';
  const questionParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--trace') showTrace = true;
    else if (a === '--json') asJson = true;
    else if (a === '--endpoint') endpoint = args[++i] ?? '';
    else if (a.startsWith('--endpoint=')) endpoint = a.slice('--endpoint='.length);
    else if (a === '--help' || a === '-h') {
      console.log(
        'usage: npm run agent -- [--trace] [--json] [--endpoint <url>] [--token <secret>] "question"'
      );
      process.exit(0);
    } else {
      questionParts.push(a);
    }
  }

  const token = process.env.MCP_ENDPOINT_TOKEN;
  const question = questionParts.join(' ').trim();

  let localHandle: Awaited<ReturnType<typeof startLocalServer>> | null = null;
  let gateway: McpContextGateway;
  if (endpoint) {
    gateway = new McpContextGateway(endpoint, { token, label: endpoint });
  } else {
    // mode déterminisme local : on démoule un endpoint Context MCP fidèle in-process
    localHandle = await startLocalServer(SEED_DOCUMENTS, process.env.LOCAL_PROJECT_ID ?? 'local-dev', process.env.LOCAL_DATASET ?? 'production');
    gateway = new McpContextGateway(localHandle.url);
  }

  try {
    await gateway.connect();
    const agent = new RuleVerdictAgent(gateway);

    const intro = await agent.sessionSummary();
    if (!question) {
      console.log('Connection établie vers le Context MCP endpoint :');
      console.log(`  ${gateway.endpointLabel}`);
      console.log('');
      console.log(intro);
      console.log('');
      console.log('Posez une question, ex :');
      console.log('  npm run agent -- "Quelle est la puissance maximale du CTRL-7 ?"');
      process.exit(0);
    }

    const answer = await agent.ask(question);
    if (asJson) {
      console.log(JSON.stringify(answer, null, 2));
    } else {
      console.log(formatAnswer(answer));
    }
    if (showTrace) {
      console.log('');
      console.log('--- Trace MCP (appels d’outils de la session) ---');
      for (const t of agent.trace) {
        console.log(`  • ${t.tool} ${JSON.stringify(t.args)}`);
        console.log(`      ↳ ${t.summary}`);
      }
    }
  } finally {
    await gateway.close();
    if (localHandle) await localHandle.close();
  }
}

main().catch((err) => {
  console.error(`ERR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});