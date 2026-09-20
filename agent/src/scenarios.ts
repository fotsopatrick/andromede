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

export function candidatesQuery(scenario: Scenario, projection: string[]): string {
  const tagConds = scenario.ruleTags.map((t) => `"${t}" in tags`).join(' && ');
  return `*[_type == "policyOrRule" && status == "active" && ${tagConds}]{${projection.join(', ')}}`;
}

export function amendmentsForQuery(ruleId: string, projection: string[]): string {
  return `*[_type == "errataOrAmendment" && status == "active" && targetRuleRef._ref == "${ruleId}"]{${projection.join(', ')}}`;
}

export function resolutionCaseQuery(keywords: string[], projection: string[]): string {
  const k = keywords[0] ?? '';
  return `*[_type == "resolutionCase" && queryScenario match "${k}"][0]{${projection.join(', ')}}`;
}

export function documentByIdQuery(id: string, projection: string[]): string {
  return `*[_id == "${id}"][0]{${projection.join(', ')}}`;
}