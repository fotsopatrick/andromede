import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import type { Request, Response } from 'express';
import type { SanityDoc } from '../scripts/seed-data.ts';
import { LocalStore } from './localStore.ts';
import { SCHEMA_REGISTRY, SCHEMA_TYPE_NAMES, buildInitialContext } from './schemaRegistry.ts';

/**
 * SERVEUR MCP LOCAL — clone d'exposition « Sanity Context » (mode GROQ).
 *
 * Il expose EXACTEMENT les outils du mode GROQ de Sanity Context
 * (initial_context, schema_explorer, groq_query, array_field_reader) sur un
 * endpoint Streamable HTTP. Les tests et le transcript s'y connectent via le
 * même client MCP que celui utilisé contre le vrai endpoint hébergé
 * (https://api.sanity.io/v1/context/organizations/{org}/mcp/{endpoint}).
 *
 * Commandes :
 *   npm run mcp:local        → endpoint local : http://127.0.0.1:8970/mcp
 *   MCP_PORT=9000 npm run mcp:local
 */

export interface LocalServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const stringWith = (description: string) => z.string().min(1).describe(description);

function buildServer(documents: SanityDoc[], projectId: string, dataset: string) {
  const store = new LocalStore(documents);

  const server = new McpServer(
    {
      name: 'sanity-context-local (aero-kit kb)',
      version: '1.0.0',
    },
    {
      capabilities: { tools: {} },
    }
  );

  server.registerTool(
    'initial_context',
    {
      title: 'Initial Context',
      description:
        "Aperçu du contexte de l'endpoint : mode (GROQ), schéma exposé, relations de précédence. " +
        "Appelé au début de chaque résolution pour s'orienter avant d'interroger.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: buildInitialContext(projectId, dataset) }],
    })
  );

  server.registerTool(
    'schema_explorer',
    {
      title: 'Schema Explorer',
      description:
        'Retourne la définition détaillée d\'un type de document (champs, types, descriptions) ou ' +
        "d'un champ précis via path (notation pointée).",
      inputSchema: {
        type: stringWith(`Nom du type de document. Types disponibles : ${SCHEMA_TYPE_NAMES.join(', ')}.`),
        path: z
          .string()
          .optional()
          .describe('Chemin vers un champ, ex : metadata.tags. Omission = type entier.'),
      },
    },
    async ({ type, path }) => {
      const schema = SCHEMA_REGISTRY[type ?? ''];
      if (!schema) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Type "${type}" inconnu. Types exposés : ${SCHEMA_TYPE_NAMES.join(', ')}.`,
            },
          ],
        };
      }
      const target = path
        ? (() => {
            const parts = path.split('.');
            let cursor: unknown = schema;
            for (const p of parts) {
              if (!cursor || typeof cursor !== 'object') return undefined;
              const next = (cursor as Record<string, unknown>)[p];
              if (Array.isArray(next)) {
                cursor = (next[0] as Record<string, unknown>)?.['name'] === undefined && next.length === 1 ? next[0] : undefined;
                continue;
              }
              cursor = next;
              if (cursor && typeof cursor === 'object' && 'fields' in (cursor as object)) break;
            }
            return cursor;
          })()
        : schema;
      if (target === undefined) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Chemin "${path}" introuvable sur le type "${type}".` }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(target, null, 2) }] };
    }
  );

  server.registerTool(
    'groq_query',
    {
      title: 'Groq Query',
      description:
        'Exécute une requête GROQ contre la base de connaissances. Réponse : { meta, result }. ' +
        'Le champ result est un tableau (ou un objet unique si la requête utilise un slice [0]).',
      inputSchema: {
        query: stringWith(
          'Requête GROQ. Sous-ensemble supporté : *[_type == "..." && cond]{proj}[slice].'
        ),
      },
    },
    async ({ query }) => {
      try {
        const { result, meta } = store.execute(query);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ meta, result }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Erreur GROQ : ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    'array_field_reader',
    {
      title: 'Array Field Reader',
      description:
        'Lit un champ tableau volumineux (mode range) ou une vue structurelle (mode outline) d’un document.',
      inputSchema: {
        mode: z.enum(['range', 'outline']).describe('range = tranche d’index, outline = vue structurelle.'),
        documentId: stringWith('_id du document.'),
        field: stringWith('Nom du champ tableau à lire.'),
        range: z
          .object({
            startIndex: z.number().int().optional().describe('Inclusif, défaut 0.'),
            endIndex: z.number().int().optional().describe('Exclusif, défaut longueur.'),
          })
          .optional(),
      },
    },
    async ({ mode, documentId, field, range }) => {
      const doc = store.getDocument(documentId);
      if (!doc) {
        return { isError: true, content: [{ type: 'text', text: `Document ${documentId} introuvable.` }] };
      }
      const value = (doc as unknown as Record<string, unknown>)[field ? String(field) : ''];
      if (!Array.isArray(value)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Le champ "${field}" de ${documentId} n'est pas un tableau.` }],
        };
      }
      if (mode === 'outline') {
        const counts = value.reduce<Record<string, number>>((acc, item) => {
          const t = (item as { _type?: string })?._type ?? 'item';
          acc[t] = (acc[t] ?? 0) + 1;
          return acc;
        }, {});
        return { content: [{ type: 'text', text: JSON.stringify({ field, length: value.length, counts }, null, 2) }] };
      }
      const start = range?.startIndex ?? 0;
      const end = range?.endIndex ?? value.length;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ field, range: [start, end], items: value.slice(start, end) }, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

export function createLocalContextApp(documents: SanityDoc[], projectId: string, dataset: string) {
  const app = createMcpExpressApp();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const handle = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = String(req.headers['mcp-session-id'] ?? '');
      let transport: StreamableHTTPServerTransport | undefined = sessionId ? transports.get(sessionId) : undefined;
      if (transport) {
        await transport.handleRequest(req, res, req.body);
        return;
      }
      if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        transport.onclose = () => {
          if (transport!.sessionId) transports.delete(transport!.sessionId!);
        };
        const server = buildServer(documents, projectId, dataset);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        if (transport.sessionId) {
          transports.set(transport.sessionId, transport);
        }
        return;
      }
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
          id: null,
        });
      }
    }
  };

  app.post('/mcp', handle);
  app.post('/mcp/message', handle);
  app.get('/mcp', handle);
  app.delete('/mcp', handle);
  app.delete('/mcp/message', handle);

  return { app, transports };
}

export async function startLocalServer(
  documents: SanityDoc[],
  projectId: string,
  dataset: string,
  port = 0
): Promise<LocalServerHandle> {
  const { app, transports } = createLocalContextApp(documents, projectId, dataset);
  const httpServer = await new Promise<import('node:http').Server>((resolve, reject) => {
    const srv = app.listen(port, '127.0.0.1', () => {
      resolve(srv);
    });
    srv.on('error', reject);
  });
  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    url: `http://127.0.0.1:${actualPort}/mcp`,
    port: actualPort,
    close: async () => {
      for (const t of transports.values()) await t.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

const isMain = () => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
};

if (isMain()) {
  const { SEED_DOCUMENTS } = await import('../scripts/seed-data.ts');
  const port = parseInt(process.env.MCP_PORT ?? '8970', 10);
  const projectId = process.env.SANITY_PROJECT_ID ?? 'local-dev';
  const dataset = process.env.SANITY_DATASET ?? 'production';
  const handle = await startLocalServer(SEED_DOCUMENTS, projectId, dataset, port);
  console.log(`[sanity-context-local] GROQ mode — ${handle.url}`);
  console.log(`[sanity-context-local] projectId=${projectId} dataset=${dataset} docs=${SEED_DOCUMENTS.length}`);
  console.log('[sanity-context-local] outils : initial_context, schema_explorer, groq_query, array_field_reader');
}