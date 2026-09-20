import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod/v4';

export interface GroqReply {
  meta: {
    executedQuery: string;
    perspective: string;
    resultCount: number;
    returnedCount: number;
  };
  result: unknown;
}

/**
 * Validation RT des réponses groq_query : le serveur connecté peut être le vrai
 * endpoint hébergé Sanity (non garanti par construction) — on vérifie la forme
 * avant de laisser le moteur de décision consommer le résultat.
 */
const GroqReplySchema = z.object({
  meta: z.object({
    executedQuery: z.string(),
    perspective: z.string(),
    resultCount: z.number(),
    returnedCount: z.number(),
  }),
  result: z.unknown(),
});

export interface ContextGateway {
  readonly endpointLabel: string;
  initialContext(): Promise<string>;
  schemaExplorer(type: string): Promise<Record<string, unknown>>;
  groq(query: string): Promise<GroqReply>;
  arrayFieldReader(
    documentId: string,
    field: string,
    mode?: 'range' | 'outline'
  ): Promise<string>;
  close(): Promise<void>;
}

function textOf(call: { content: { type: string; text?: string }[] }): string {
  const t = call.content.find((c) => c.type === 'text');
  if (!t || t.text === undefined) throw new Error('Réponse MCP sans contenu texte.');
  return t.text;
}

export class McpContextGateway implements ContextGateway {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  readonly endpointLabel: string;

  constructor(url: string, opts: { token?: string; label?: string } = {}) {
    this.endpointLabel = opts.label ?? url;
    const headers: Record<string, string> = { Accept: 'application/json, text/event-stream' };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    this.transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
    this.client = new Client(
      {
        name: 'aero-kit-rule-agent',
        version: '1.0.0',
      },
      { capabilities: {} }
    );
  }

  private async call(name: string, arguments_: Record<string, unknown>) {
    try {
      const raw = await this.client.callTool({ name, arguments: arguments_ });
      return raw as unknown as {
        content: { type: string; text?: string; [k: string]: unknown }[];
        isError?: boolean;
      };
    } catch (err) {
      throw new Error(`MCP tool "${name}" a échoué : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async initialContext(): Promise<string> {
    return textOf(await this.call('initial_context', {}));
  }

  async schemaExplorer(type: string): Promise<Record<string, unknown>> {
    const res = await this.call('schema_explorer', { type });
    return JSON.parse(textOf(res)) as Record<string, unknown>;
  }

  async groq(query: string): Promise<GroqReply> {
    const res = await this.call('groq_query', { query });
    if (res.isError) throw new Error(textOf(res));
    const parsed = GroqReplySchema.safeParse(JSON.parse(textOf(res)));
    if (!parsed.success) {
      throw new Error(
        `MCP tool "groq_query" a échoué : réponse hors contrat (${parsed.error.issues[0]?.message ?? 'forme inattendue'}).`
      );
    }
    return parsed.data;
  }

  async arrayFieldReader(
    documentId: string,
    field: string,
    mode: 'range' | 'outline' = 'range'
  ): Promise<string> {
    const res = await this.call('array_field_reader', { documentId, field, mode });
    if (res.isError) throw new Error(textOf(res));
    return textOf(res);
  }

  async close(): Promise<void> {
    try {
      await this.transport.close();
    } catch {
      /* déjà fermé */
    }
  }
}