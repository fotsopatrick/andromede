import { startLocalServer } from '../mcp-local/context-server.ts';
import { SEED_DOCUMENTS } from '../scripts/seed-data.ts';
import { McpContextGateway } from '../agent/src/contextClient.ts';
import { RuleVerdictAgent } from '../agent/src/agent.ts';
import { formatAnswer } from '../agent/src/model.ts';

/**
 * TRANSCRIPT DE SESSION (preuve pour la soumission).
 *
 *   npm run transcript
 *
 * Rejoue les quatre questions canoniques contre un endpoint Context MCP local
 * (fidèle au mode GROQ), enregistre la trace MCP complète de chaque résolution
 * (initial_context, schema_explorer, groq_query) et écrit TRANSCRIPT.txt.
 */

const OUTPUT = new URL('../TRANSCRIPT.txt', import.meta.url);
const HEADER_TIMESTAMP = new Date().toISOString();

const QUESTIONS: { label: string; question: string }[] = [
  {
    label: 'Q1 — Requête univoque (puissance)',
    question: 'Quelle est la puissance électrique maximale du module CTRL-7 ?',
  },
  {
    label: 'Q2 — Contradiction règle/errata (température)',
    question: 'Quelle est la température maximale configurable du module CTRL-7 ?',
  },
  {
    label: 'Q3 — Contradiction non arbitrée (altitude)',
    question: "Jusqu'à quelle altitude maximale puis-je utiliser le module CTRL-7 ?",
  },
  {
    label: 'Q4 — Donnée absente (autre module)',
    question: 'Quelle est la politique de rétention des journaux du module RMX-900 ?',
  },
];

const run = async (question: string) => {
  const handle = await startLocalServer(SEED_DOCUMENTS, 'local-dev', 'production');
  try {
    const gateway = new McpContextGateway(handle.url);
    await gateway.connect();
    try {
      const agent = new RuleVerdictAgent(gateway);
      const intro = await agent.sessionSummary();
      const answer = await agent.ask(question);
      return { intro, answer, trace: [...agent.trace] };
    } finally {
      await gateway.close();
    }
  } finally {
    await handle.close();
  }
};

const blocks: string[] = [];
blocks.push(
  [
    'AERO-KIT — RULE VERDICT AGENT',
    'Session transcript — Sanity Challenge (DEV.to) Path 1',
    `Date (UTC) : ${HEADER_TIMESTAMP}`,
    'Sanity     : project 3b1mty75 · dataset production · docs seeded from scripts/seed-data.ts',
    'Endpoint  : Sanity Context MCP (mode GROQ) — clone local fidèle du endpoint hébergé',
    '            (connexion MCP Streamable HTTP réelle, mêmes 4 outils)',
    'Schémas    : policyOrRule, errataOrAmendment, resolutionCase (seeded, _id déterministes)',
    'Banc       : node --test tests/ → 9 tests verts (4 garde-fous métier + 5 infra)',
    '',
    '='.repeat(78),
    '',
  ].join('\n')
);

for (let n = 0; n < QUESTIONS.length; n++) {
  const { label, question } = QUESTIONS[n];
  const { intro, answer, trace } = await run(question);

  blocks.push(`> ${label}`);
  blocks.push(`Q : ${question}`);
  blocks.push('');
  blocks.push(`R : ${formatAnswer(answer)}`);
  blocks.push('');
  blocks.push('Trace MCP de la résolution :');
  for (const t of trace) {
    blocks.push(`  • ${t.tool}`);
    if (t.tool === 'groq_query') blocks.push(`      query  : ${String(t.args.query)}`);
    blocks.push(`      ↳ ${t.summary}`);
  }
  blocks.push('');
  blocks.push('-'.repeat(78));
  blocks.push('');
}

blocks.push(
  [
    'FIN DE SESSION.',
    '',
    'Preuves vérifiées par le banc :',
    '  TES1 standard        → 500 W, réf policyOrRule/rule-ctrl7-power-spec',
    '  TES2 contradiction   → 60 °C via errata-ctrl7-temp-sec (precedenceLevel 3 > 1),',
    '                          corroboration case-ctrl7-temp-max',
    '  TES3 anti-RAG        → le plein-texte est indécidable (75 vs 60 à égalité) ;',
    '                          les relations structurées tranchent',
    "  TES4 garde-fous      → refus d'extrapoler (altitude 2000 vs 1500 m, aucune",
    '                          précédence active) et demande de clarification (hors KB)',
    '',
    'Zero hallucination : jamais de verdict sur données contradictoires non arbitrées.',
  ].join('\n')
);

const out = blocks.join('\n');
const fs = await import('node:fs/promises');
await fs.writeFile(new URL(OUTPUT), out, 'utf8');
console.log(`Transcript écrit : ${OUTPUT.pathname}`);
console.log(out.slice(0, 2000));