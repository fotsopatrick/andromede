export interface SourceCitation {
  _id: string;
  docType: string;
  docRef: string;
  title: string;
  statement: string;
  value: number | null;
  unit: string | null;
  precedenceLevel: number | null;
  version: string | null;
  status: string | null;
  sourceUrl?: string;
  contradictionType?: string | null;
}

export interface ToolTrace {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface VerdictAnswer {
  kind: 'verdict';
  verdict: string;
  value: number;
  unit: string;
  sources: SourceCitation[];
  contradictionResolved: boolean;
  resolutionNote?: string;
  confidence: 'high';
}

export interface ContradictionAnswer {
  kind: 'contradiction_unresolved';
  sources: SourceCitation[];
  message: string;
}

export interface ClarificationAnswer {
  kind: 'clarification';
  message: string;
  matchedSources: SourceCitation[];
}

export type AnswerBody = VerdictAnswer | ContradictionAnswer | ClarificationAnswer;

export type Answer = AnswerBody & { trace: ToolTrace[] };

export function formatAnswer(answer: Answer): string {
  switch (answer.kind) {
    case 'verdict': {
      const lines: string[] = [];
      lines.push(
        answer.contradictionResolved
          ? 'RÉSOLUTION — Contradiction détectée puis arbitrée formellement.'
          : 'VERDICT — Requête univoque.'
      );
      lines.push(`Valeur normative retenue : ${answer.value} ${answer.unit}`);
      lines.push(`Verdict : ${answer.verdict}`);
      if (answer.resolutionNote) lines.push(`Note d’arbitrage : ${answer.resolutionNote}`);
      lines.push('');
      lines.push('Sources citées :');
      for (const s of answer.sources) {
        lines.push(`  - ${s.docRef} — ${s.title} (réf Sanity : ${s._id})`);
        if (s.version) lines.push(`      version ${s.version} · statut ${s.status}`);
        if (s.precedenceLevel !== null)
          lines.push(`      précédence ${s.precedenceLevel} · valeur ${s.value} ${s.unit ?? ''}`);
        lines.push(`      « ${s.statement} »`);
        if (s.sourceUrl) lines.push(`      source : ${s.sourceUrl}`);
      }
      return lines.join('\n');
    }
    case 'contradiction_unresolved': {
      const lines: string[] = [];
      lines.push('GARDE-FOU — Contradiction non résolue, j’interdis l’extrapolation.');
      lines.push(answer.message);
      lines.push('Sources en conflit :');
      for (const s of answer.sources) {
        lines.push(`  - ${s.docRef} — ${s.title}`);
        lines.push(`      version ${s.version} · statut ${s.status}`);
        lines.push(
          `      précédence ${s.precedenceLevel} · valeur ${s.value} ${s.unit ?? ''}`
        );
        lines.push(`      « ${s.statement} »`);
      }
      return lines.join('\n');
    }
    case 'clarification': {
      const lines: string[] = [];
      lines.push('CLARIFICATION — Aucune extrapolation tant que la donnée n’est pas établie.');
      lines.push(answer.message);
      if (answer.matchedSources.length) {
        lines.push('Sources remontées (non suffisantes) :');
        for (const s of answer.matchedSources) {
          lines.push(`  - ${s.docRef} — ${s.title} (${s._id})`);
        }
      }
      return lines.join('\n');
    }
  }
}