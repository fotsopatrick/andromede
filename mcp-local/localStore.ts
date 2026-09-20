import { evaluateGroqWithMeta } from './miniGroq.ts';
import type { SanityDoc } from '../scripts/seed-data.ts';

/**
 * Magasin local — l'équivalent du Content Lake pour le serveur MCP local.
 *
 * Il est alimenté par les mêmes documents canoniques que le script de seed
 * réel (scripts/seed-data.ts). Le serveur MCP d'exposition (context-server.ts)
 * l'interroge en GROQ via l'interpréteur déterministe miniGroq.
 */

export interface GroqExecutionResult {
  result: unknown;
  meta: {
    executedQuery: string;
    perspective: string;
    resultCount: number;
    returnedCount: number;
  };
}

export class LocalStore {
  private documents: SanityDoc[];

  constructor(documents: SanityDoc[]) {
    this.documents = documents;
  }

  get documentsAll(): SanityDoc[] {
    return this.documents;
  }

  getDocument(id: string): SanityDoc | null {
    return this.documents.find((d) => d._id === id) ?? null;
  }

  execute(query: string): GroqExecutionResult {
    const { result, resultCount, returnedCount } = evaluateGroqWithMeta(this.documents, query);
    return {
      result,
      meta: {
        executedQuery: query,
        perspective: 'raw',
        resultCount,
        returnedCount,
      },
    };
  }
}