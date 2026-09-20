import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer } from '../mcp-local/context-server.ts';
import { McpContextGateway } from '../agent/src/contextClient.ts';
import { RuleVerdictAgent } from '../agent/src/agent.ts';
import { SEED_DOCUMENTS, type SanityDoc } from '../scripts/seed-data.ts';
import { evaluateGroq } from '../mcp-local/miniGroq.ts';

/**
 * BANC COMPLÉMENTAIRE — les angles morts que le banc de 9 tests ne couvrait
 * pas (cf. analyse du recode complet) :
 *   - slices GROQ exclusifs [n...m] vs inclusifs [n..m] (parité réelle with GROQ)
 *   - comparaison de dates de chaînes (effectiveDate) par l'interpréteur
 *   - DEUX amendements actifs à même precedenceLevel, valeurs contradictoires
 *     → ne doit PAS produire « valeur non amendée » (silence) mais refuser
 *   - deux amendements à même précédence, MÊME valeur → verdict unique (merge)
 *   - filtres négatifs status == "active" (règle deprecated ignorée)
 *   - référence d'autorité cassée (resolutionCase → _ref introuvable) → anomalie
 *   - entrée en vigueur future (effectiveDate) : amendement ET règle non appliqués
 *   - chemin d'erreur de l'outil MCP remonté proprement par le client
 *   - array_field_reader exercé à travers le vrai canal MCP (outil vivant)
 */

const SEED = (): SanityDoc[] => JSON.parse(JSON.stringify(SEED_DOCUMENTS)) as SanityDoc[];
const ruleRef = (_ref: string) => ({ _type: 'reference' as const, _ref });

function amendment(
  overrides: Partial<Extract<SanityDoc, { _type: 'errataOrAmendment' }>> & { _id: string }
): Extract<SanityDoc, { _type: 'errataOrAmendment' }> {
  return {
    _type: 'errataOrAmendment',
    id: 'AERO-ERR-TIE-001',
    title: 'Amendement de test',
    version: '1.0',
    status: 'active',
    effectiveDate: '2026-07-01',
    targetRuleRef: ruleRef('rule-ctrl7-power-spec'),
    contradictionType: 'security-override',
    amendedStatement: 'Valeur d’essai émise par un amendement.',
    amendedValue: 400,
    precedenceLevel: 5,
    resolutionNote: '',
    sourceUrl: 'https://kb.aero-kit.example/tests',
    tags: ['power'],
    ...overrides,
  };
}

async function withAgent(
  docs: SanityDoc[],
  fn: (a: { agent: RuleVerdictAgent; gateway: McpContextGateway }) => Promise<void>
): Promise<void> {
  const handle = await startLocalServer(docs, 'corners-fixture', 'production');
  const gateway = new McpContextGateway(handle.url);
  await gateway.connect();
  const agent = new RuleVerdictAgent(gateway);
  try {
    await fn({ agent, gateway });
  } finally {
    await gateway.close();
    await handle.close();
  }
}

test('INFRA — slice exclusif [n...m] distinct du slice inclusif [n..m]', () => {
  const inclusive = evaluateGroq(SEED_DOCUMENTS, '*[_type == "policyOrRule"][0..2]') as SanityDoc[];
  const exclusive = evaluateGroq(SEED_DOCUMENTS, '*[_type == "policyOrRule"][0...2]') as SanityDoc[];
  const single = evaluateGroq(SEED_DOCUMENTS, '*[_type == "policyOrRule"][0]');
  assert.equal(inclusive.length, 3, '[0..2] inclusif = 3 éléments');
  assert.equal(exclusive.length, 2, '[0...2] exclusif = 2 éléments');
  assert.equal(exclusive[0]._id, 'rule-ctrl7-temp-spec');
  assert.equal(exclusive[1]._id, 'rule-ctrl7-power-spec');
  assert.ok(single && typeof single === 'object' && !Array.isArray(single));
});

test('INFRA — comparaison de dates (chaînes ISO) par les opérateurs d’ordre stricts', () => {
  const early = evaluateGroq(
    SEED_DOCUMENTS,
    '*[_type == "policyOrRule" && effectiveDate < "2026-02-01"]{_id}'
  ) as Array<{ _id: string }>;
  assert.deepEqual(early.map((d) => d._id).sort(), ['rule-ctrl7-power-spec', 'rule-ctrl7-temp-spec']);
  const late = evaluateGroq(
    SEED_DOCUMENTS,
    '*[_type == "policyOrRule" && effectiveDate > "2026-02-01"]{_id}'
  ) as Array<{ _id: string }>;
  assert.deepEqual(late.map((d) => d._id), ['rule-ctrl7-altitude-maintenance']);
});

test('TEST 6a — deux amendements actifs, même précédence, valeurs contradictoires → refus de deviner', async () => {
  const docs = [
    ...SEED(),
    amendment({ _id: 'err-ctrl7-power-a', amendedValue: 400, title: 'Plafond A' }),
    amendment({ _id: 'err-ctrl7-power-b', amendedValue: 450, title: 'Plafond B' }),
  ];
  await withAgent(docs, async ({ agent }) => {
    const answer = await agent.ask('Quelle est la puissance électrique maximale du module CTRL-7 ?');
    assert.equal(answer.kind, 'contradiction_unresolved');
    if (answer.kind !== 'contradiction_unresolved') return;
    const ids = answer.sources.map((s) => s._id);
    assert.ok(ids.includes('rule-ctrl7-power-spec'));
    assert.ok(ids.includes('err-ctrl7-power-a'));
    assert.ok(ids.includes('err-ctrl7-power-b'));
    assert.match(answer.message, /mêmes précédences|même précédence/);
  });
});

test('TEST 6b — deux amendements à même précédence et MÊME valeur → verdict unique (merge)', async () => {
  const docs = [
    ...SEED(),
    amendment({ _id: 'err-ctrl7-power-a', amendedValue: 400 }),
    amendment({ _id: 'err-ctrl7-power-b', amendedValue: 400 }),
  ];
  await withAgent(docs, async ({ agent }) => {
    const answer = await agent.ask('Quelle est la puissance électrique maximale du module CTRL-7 ?');
    assert.equal(answer.kind, 'verdict');
    if (answer.kind !== 'verdict') return;
    assert.equal(answer.value, 400);
    assert.equal(answer.contradictionResolved, true);
  });
});

test('TEST 6c — règle deprecated ignorée par le filtre status == "active"', async () => {
  const legacy: SanityDoc = {
    _id: 'rule-ctrl7-power-legacy',
    _type: 'policyOrRule',
    id: 'AERO-POL-2019-001',
    title: 'Spécification obsolète — Puissance (retirée)',
    version: '0.9',
    status: 'deprecated',
    effectiveDate: '2019-01-01',
    body: 'Puissance maximale de 999 W.',
    tags: ['power'],
    scope: 'module:ctrl-7',
    normativeValue: 999,
    normativeUnit: 'W',
    precedenceLevel: 1,
  };
  const docs = [...SEED(), legacy];
  await withAgent(docs, async ({ agent }) => {
    const answer = await agent.ask('Quelle est la puissance électrique maximale du module CTRL-7 ?');
    assert.equal(answer.kind, 'verdict');
    if (answer.kind !== 'verdict') return;
    assert.equal(answer.value, 500);
    const ids = answer.sources.map((s) => s._id);
    assert.ok(!ids.includes('rule-ctrl7-power-legacy'));
  });
});

test('TEST 6d — resolutionCase dont la source d’autorité est introuvable → anomalie, pas de verdict', async () => {
  const docs = SEED().map((d) =>
    d._id === 'case-ctrl7-temp-max' ? { ...d, authoritativeSourceRef: ruleRef('errata-missing') } : d
  ) as SanityDoc[];
  await withAgent(docs, async ({ agent }) => {
    const answer = await agent.ask(
      'Quelle est la température maximale configurable du module CTRL-7 ?'
    );
    assert.equal(answer.kind, 'contradiction_unresolved');
    if (answer.kind !== 'contradiction_unresolved') return;
    assert.match(answer.message, /source d'autorité|introuvable/);
  });
});

test('TEST 6e — amendement à entrée en vigueur FUTURE → non appliqué, règle inchangée', async () => {
  const docs = [
    ...SEED(),
    amendment({
      _id: 'err-ctrl7-power-fut',
      amendedValue: 1,
      precedenceLevel: 9,
      effectiveDate: '2099-01-01',
    }),
  ];
  await withAgent(docs, async ({ agent }) => {
    const answer = await agent.ask('Quelle est la puissance électrique maximale du module CTRL-7 ?');
    assert.equal(answer.kind, 'verdict');
    if (answer.kind !== 'verdict') return;
    assert.equal(answer.value, 500);
    const ids = answer.sources.map((s) => s._id);
    assert.ok(!ids.includes('err-ctrl7-power-fut'));
  });
});

test('TEST 6f — règle à entrée en vigueur FUTURE → non candidate → clarification', async () => {
  const docs = SEED().map((d) =>
    d._id === 'rule-ctrl7-power-spec' ? { ...d, effectiveDate: '2099-01-01' } : d
  ) as SanityDoc[];
  await withAgent(docs, async ({ agent }) => {
    const answer = await agent.ask('Quelle est la puissance électrique maximale du module CTRL-7 ?');
    assert.equal(answer.kind, 'clarification');
  });
});

test('TEST 6g — erreur d’exécution GROQ remontée par le client MCP (chemin d’erreur réel)', async () => {
  const handle = await startLocalServer(SEED(), 'corners-fixture', 'production');
  const gateway = new McpContextGateway(handle.url);
  await gateway.connect();
  try {
    await assert.rejects(
      () => gateway.groq('*[_type == "policyOrRule" && (a == 1 || b == 2)]'),
      /Erreur GROQ/
    );
  } finally {
    await gateway.close();
    await handle.close();
  }
});

test('TEST 6h — array_field_reader vivant à travers le canal MCP (mode range + outline)', async () => {
  const handle = await startLocalServer(SEED(), 'corners-fixture', 'production');
  const gateway = new McpContextGateway(handle.url);
  await gateway.connect();
  try {
    const range = JSON.parse(
      await gateway.arrayFieldReader('rule-ctrl7-power-spec', 'tags', 'range')
    ) as { field: string; items: string[] };
    assert.equal(range.field, 'tags');
    assert.deepEqual(range.items, ['power', 'spec', 'ctrl-7']);

    const outline = JSON.parse(
      await gateway.arrayFieldReader('rule-ctrl7-power-spec', 'tags', 'outline')
    ) as { length: number; counts: Record<string, number> };
    assert.equal(outline.length, 3);
    assert.ok(outline.counts && typeof outline.counts === 'object');
  } finally {
    await gateway.close();
    await handle.close();
  }
});