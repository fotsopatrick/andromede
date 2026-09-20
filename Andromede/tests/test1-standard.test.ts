import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from './helpers.ts';

test('TEST 1 — Requête univoque → verdict conforme avec référence Sanity ID', async () => {
  const fixture = await buildFixture();
  try {
    const answer = await fixture.agent.ask(
      'Quelle est la puissance électrique maximale du module CTRL-7 ?'
    );

    assert.equal(answer.kind, 'verdict');
    if (answer.kind !== 'verdict') return;
    assert.equal(answer.value, 500);
    assert.equal(answer.unit, 'W');
    assert.equal(answer.contradictionResolved, false);
    assert.equal(answer.confidence, 'high');
    assert.match(answer.verdict, /500 W/);

    assert.equal(answer.sources.length, 1);
    const src = answer.sources[0];
    assert.equal(src._id, 'rule-ctrl7-power-spec');
    assert.equal(src.docRef, 'policyOrRule/rule-ctrl7-power-spec');
    assert.equal(src.value, 500);
    assert.equal(src.unit, 'W');
    assert.match(src.title, /Puissance/);

    const tools = answer.trace.map((t) => t.tool);
    assert.ok(tools.includes('initial_context'), 'la session utilise initial_context');
    assert.ok(tools.includes('schema_explorer'), "l'agent vérifie le schéma avant d'interroger");
    assert.ok(tools.includes('groq_query'), 'l’agent interroge via groq_query');
    const groqCalls = answer.trace.filter((t) => t.tool === 'groq_query');
    const query = groqCalls[0].args.query as string;
    assert.match(query, /_type == "policyOrRule"/);
    assert.match(query, /status == "active"/);
  } finally {
    await fixture.close();
  }
});