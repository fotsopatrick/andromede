import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from './helpers.ts';
import { SEED_DOCUMENTS } from '../scripts/seed-data.ts';
import { naiveKeywordSearch } from '../agent/src/naiveRag.ts';

test('TEST 3 — Anti-RAG par mot-clé : le plein-texte ment, les relations structurées gagnent', async () => {
  const fixture = await buildFixture();
  try {
    const question = 'Quelle est la température maximale configurable du module CTRL-7 ?';

    // 1) Baseline plein-texte : elle croit lire « 75 °C » dans l'énoncé littéral.
    const naive = naiveKeywordSearch(SEED_DOCUMENTS, question);
    assert.ok(naive.length > 0, 'le baseline trouve au moins un document');
    const best = naive[0];
    assert.equal(best._id, 'rule-ctrl7-temp-spec', 'c’est la spécification qui remonte en tête');
    assert.equal(best.claimedValue, 75, 'le baseline restitue la valeur FAUSSE (75 °C)');

    // GRAVITÉ du problème : 75 ET 60 sont à ÉGALITÉ de score. Le plein-texte n'a
    // AUCUN moyen de dire quelle valeur fait autorité — il est indécidable.
    const tied = naive.filter((h) => h.score === best.score);
    const tiedIds = tied.map((h) => h._id).sort();
    assert.deepEqual(tiedIds, ['errata-ctrl7-temp-sec', 'rule-ctrl7-temp-spec']);
    const tiedValues = [...new Set(tied.map((h) => h.claimedValue))].sort((a, b) => (a ?? 0) - (b ?? 0));
    assert.deepEqual(tiedValues, [60, 75], 'le baseline présente 60 °C ET 75 °C sans pouvoir trancher');
    assert.ok(
      !tied.some((h) => h._id === 'errata-ctrl7-temp-sec' && h.claimedValue === 60 && h.score > best.score),
      'rien dans le plein-texte n’indique que l’amendement fait autorité'
    );

    // 2) Pipeline structuré : relations (targetRuleRef) + précédence → vérité.
    const answer = await fixture.agent.ask(question);
    assert.equal(answer.kind, 'verdict');
    if (answer.kind !== 'verdict') return;
    assert.equal(answer.value, 60, 'le parcours structuré donne le VRAI résultat (60 °C)');

    // 3) Écart de fidélité : les deux approches répondent différemment,
    //    et seule la structurée peut CITER les deux sources et la relation.
    assert.notEqual(best.claimedValue, answer.value);
    const ids = answer.sources.map((s) => s._id).sort();
    assert.deepEqual(ids, ['errata-ctrl7-temp-sec', 'rule-ctrl7-temp-spec']);
    assert.equal(answer.contradictionResolved, true);

    const relationCall = answer.trace.find((t) =>
      String(t.args.query).includes('targetRuleRef._ref')
    );
    assert.ok(relationCall, 'le facteur qui gagne est la relation, pas le texte');
  } finally {
    await fixture.close();
  }
});