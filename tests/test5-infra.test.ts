import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_DOCUMENTS } from '../scripts/seed-data.ts';
import { evaluateGroq, parseGroq, GroqSyntaxError } from '../mcp-local/miniGroq.ts';
import { SCHEMA_REGISTRY } from '../mcp-local/schemaRegistry.ts';
import { schemaTypes } from '../sanity-schema/schemaTypes/index.ts';

test('INFRA — miniGROQ : sous-ensemble correct et déterministe', () => {
  const all = evaluateGroq(SEED_DOCUMENTS, '*[_type == "policyOrRule"]');
  assert.equal(Array.isArray(all), true);
  assert.equal((all as unknown[]).length, 4);

  const tagged = evaluateGroq(
    SEED_DOCUMENTS,
    '*[_type == "policyOrRule" && status == "active" && "temperature" in tags]'
  ) as unknown[];
  assert.equal(tagged.length, 1);
  assert.equal((tagged[0] as { _id: string })._id, 'rule-ctrl7-temp-spec');

  const errata = evaluateGroq(
    SEED_DOCUMENTS,
    '*[_type == "errataOrAmendment" && targetRuleRef._ref == "rule-ctrl7-temp-spec"]'
  ) as unknown[];
  assert.equal(errata.length, 1);
  assert.equal((errata[0] as { id: string }).id, 'AERO-ERR-2026-091');

  const proj = evaluateGroq(
    SEED_DOCUMENTS,
    '*[_type == "resolutionCase"]{_id, title, finalVerdict}'
  ) as Array<Record<string, unknown>>;
  assert.equal(proj.length, 1);
  assert.deepEqual(Object.keys(proj[0]).sort(), ['_id', 'finalVerdict', 'title']);

  const single = evaluateGroq(
    SEED_DOCUMENTS,
    '*[_type == "resolutionCase" && queryScenario match "temperature"][0]{_id, finalVerdict}'
  );
  assert.ok(single && typeof single === 'object' && !Array.isArray(single));
  assert.equal((single as { _id: string })._id, 'case-ctrl7-temp-max');

  assert.throws(
    () => parseGroq('*[_type == "policyOrRule" && (a == 1 || b == 2)]'),
    GroqSyntaxError
  );
});

test('INFRA — miroir de schéma : le registre MCP local est synchrone avec le Studio Sanity', () => {
  for (const def of schemaTypes) {
    const mirror = SCHEMA_REGISTRY[def.name];
    assert.ok(mirror, `le registre local doit exposer le type "${def.name}"`);
    const schemaFieldNames = (def.fields ?? []).map((f) => f.name).sort();
    const mirrorFieldNames = mirror.fields.map((f) => f.name).sort();
    assert.deepEqual(
      mirrorFieldNames,
      schemaFieldNames,
      `champs de "${def.name}" divergents entre Studio et miroir local`
    );
  }
  assert.deepEqual(Object.keys(SCHEMA_REGISTRY).sort(), ['errataOrAmendment', 'policyOrRule', 'resolutionCase']);
});

test('INFRA — tous les documents de seed respectent les champs déclarés du schéma', () => {
  const fieldNamesOf = (type: string) =>
    (schemaTypes.find((s) => s.name === type)!.fields ?? []).map((f) => f.name);
  for (const doc of SEED_DOCUMENTS) {
    const allowed = new Set(['_id', '_type', ...fieldNamesOf(doc._type)]);
    for (const key of Object.keys(doc)) {
      assert.ok(
        allowed.has(key),
        `document ${doc._id} : champ "${key}" non déclaré au schéma`
      );
    }
  }
});