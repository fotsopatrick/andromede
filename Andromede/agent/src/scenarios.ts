export interface Scenario {
  id: string;
  label: string;
  questionHint: string;
  ruleType: string;
  ruleTags: string[];
  answerUnit: string;
  resolutionKeywords: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'temp-max',
    label: 'Température maximale configurable',
    questionHint: 'température / thermique (module CTRL-7)',
    ruleType: 'policyOrRule',
    ruleTags: ['temperature'],
    answerUnit: '°C',
    resolutionKeywords: ['temperature', 'température'],
  },
  {
    id: 'power-max',
    label: 'Puissance électrique maximale',
    questionHint: 'puissance / power / watt (module CTRL-7)',
    ruleType: 'policyOrRule',
    ruleTags: ['power'],
    answerUnit: 'W',
    resolutionKeywords: ['power', 'puissance'],
  },
  {
    id: 'altitude-max',
    label: 'Altitude maximale d’utilisation',
    questionHint: 'altitude / hauteur d’installation ou de maintenance',
    ruleType: 'policyOrRule',
    ruleTags: ['altitude'],
    answerUnit: 'm',
    resolutionKeywords: ['altitude', 'hauteur'],
  },
];

export const CANDIDATE_RULES_PROJECTION = [
  '_id',
  '_type',
  'id',
  'title',
  'version',
  'status',
  'effectiveDate',
  'body',
  'tags',
  'scope',
  'normativeValue',
  'normativeUnit',
  'precedenceLevel',
];

export const AMENDMENT_PROJECTION = [
  '_id',
  '_type',
  'id',
  'title',
  'version',
  'status',
  'effectiveDate',
  'contradictionType',
  'amendedStatement',
  'amendedValue',
  'precedenceLevel',
  'resolutionNote',
  'sourceUrl',
];

/**
 * Échappement GROQ centralisé : TOUTE valeur interpolée dans une requête passe
 * par ici. Aujourd'hui les valeurs sont statiques (scenarios.ts) ou déjà
 * issues de documents de la KB (_ids) ; la fonction existe pour qu'aucune
 * entrée texte libre ne puisse jamais casser ou détourner une requête.
 */
export function escapeGroqString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function effectiveClause(today?: string): string {
  return today ? ` && effectiveDate <= "${today}"` : '';
}

export function candidatesQuery(
  scenario: Scenario,
  projection: string[],
  today?: string
): string {
  const tagConds = scenario.ruleTags
    .map((t) => `"${escapeGroqString(t)}" in tags`)
    .join(' && ');
  return `*[_type == "policyOrRule" && status == "active"${effectiveClause(today)} && ${tagConds}]{${projection.join(', ')}}`;
}

export function amendmentsForQuery(
  ruleId: string,
  projection: string[],
  today?: string
): string {
  return `*[_type == "errataOrAmendment" && status == "active"${effectiveClause(today)} && targetRuleRef._ref == "${escapeGroqString(ruleId)}"]{${projection.join(', ')}}`;
}

export function resolutionCaseQuery(keywords: string[], projection: string[]): string {
  const k = keywords[0] ?? '';
  return `*[_type == "resolutionCase" && queryScenario match "${escapeGroqString(k)}"][0]{${projection.join(', ')}}`;
}

export function documentByIdQuery(id: string, projection: string[]): string {
  return `*[_id == "${escapeGroqString(id)}"][0]{${projection.join(', ')}}`;
}