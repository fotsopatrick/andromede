import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from './helpers.ts';

test('TEST 4a — Donnée absente → refus d’extrapoler + demande de clarification', async () => {
  const fixture = await buildFixture();
  try {
    const answer = await fixture.agent.ask(
      'Quelle est la politique de rétention des journaux du module RMX-900 ?'
    );
    assert.equal(answer.kind, 'clarification');
    if (answer.kind !== 'clarification') return;
    assert.match(answer.message, /aucun scénario/);
    assert.equal(answer.matchedSources.length, 0);
  } finally {
    await fixture.close();
  }
});

test('TEST 4b — Contradiction sans arbitrage → l’agent refuse de deviner', async () => {
  const fixture = await buildFixture();
  try {
    const answer = await fixture.agent.ask(
      "Jusqu'à quelle altitude maximale puis-je utiliser le module CTRL-7 ?"
    );

    // Deux règles ACTIVES tiennent des valeurs différentes, aucun amendement
    // ni resolutionCase ne tranche → l'agent ne peut PAS produire de verdict.
    assert.equal(answer.kind, 'contradiction_unresolved');
    assert.notEqual(answer.kind, 'verdict');
    if (answer.kind !== 'contradiction_unresolved') return;

    const ids = answer.sources.map((s) => s._id);
    assert.ok(ids.includes('rule-ctrl7-altitude-install'));
    assert.ok(ids.includes('rule-ctrl7-altitude-maintenance'));

    const values = new Set(answer.sources.map((s) => s.value));
    assert.deepEqual([...values].sort(), [1500, 2000]);

    assert.match(
      answer.message,
      /aucun amendement actif ni dossier d'arbitrage cohérent ne tranche/
    );
    assert.match(answer.message, /interdit de deviner|extrapolation/);
  } finally {
    await fixture.close();
  }
});

test('TEST 4c — Question ambiguë (multi-scénarios) → clarification, pas de choix arbitraire', async () => {
  const fixture = await buildFixture();
  try {
    const answer = await fixture.agent.ask(
      'Température et puissance du CTRL-7 : quelles sont les limites ?'
    );
    assert.equal(answer.kind, 'clarification');
    if (answer.kind !== 'clarification') return;
    assert.match(answer.message, /ambiguë/);
  } finally {
    await fixture.close();
  }
});