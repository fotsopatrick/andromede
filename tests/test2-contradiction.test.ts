import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from './helpers.ts';

test('TEST 2 — Contradiction détectée (règle vs errata) → arbitrage formel structuré', async () => {
  const fixture = await buildFixture();
  try {
    const answer = await fixture.agent.ask(
      'Quelle est la température maximale configurable du module CTRL-7 ?'
    );

    assert.equal(answer.kind, 'verdict');
    if (answer.kind !== 'verdict') return;

    // La vérité normative : la valeur amendée, pas celle de la spécification.
    assert.equal(answer.value, 60);
    assert.equal(answer.unit, '°C');
    assert.equal(answer.contradictionResolved, true);

    // Les DEUX sources contradictoires sont détectées et citées côte à côte.
    const ids = answer.sources.map((s) => s._id);
    assert.deepEqual(ids.sort(), ['errata-ctrl7-temp-sec', 'rule-ctrl7-temp-spec']);

    const rule = answer.sources.find((s) => s._id === 'rule-ctrl7-temp-spec')!;
    const amd = answer.sources.find((s) => s._id === 'errata-ctrl7-temp-sec')!;
    assert.equal(rule.value, 75);
    assert.equal(amd.value, 60);
    assert.equal(amd.precedenceLevel, 3);
    assert.equal(rule.precedenceLevel, 1);
    assert.ok(rule.statement.includes('75'));
    assert.ok(amd.statement.includes('60'));

    // L'arbitrage est EXPRIMÉ FORMELLEMENT avec citations des deux sources.
    assert.match(answer.verdict, /precedenceLevel 3 > 1/);

    // Corroboration avec le dossier d'arbitrage humain (resolutionCase).
    assert.match(answer.verdict, /case-ctrl7-temp-max/);
    assert.ok(answer.resolutionNote && answer.resolutionNote.length > 0);

    // Preuve que le parcours a suivi la RELATION structurée targetRuleRef.
    const relationCall = answer.trace.find(
      (t) => t.tool === 'groq_query' && String(t.args.query).includes('targetRuleRef._ref')
    );
    assert.ok(relationCall, 'l’agent traverse la relation errata → targetRuleRef');
    assert.match(String(relationCall!.args.query), /rule-ctrl7-temp-spec/);
  } finally {
    await fixture.close();
  }
});