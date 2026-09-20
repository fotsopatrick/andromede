import { SCENARIOS, type Scenario } from './scenarios.ts';

/**
 * ROUTEUR — étape unique où une question en langage naturel devient un
 * scénario de requête typé. C'est LE point de branchement optionnel d'un LLM :
 * le pipeline décisionnel, lui, reste déterministe.
 *
 * Le routeur ne lit JAMAIS le corps des documents : il ne fait que mapper la
 * question vers un scénario du catalogue (mots-clés synonymiques explicites).
 * La vérité vient ensuite des relations structurées (schéma, tags, références,
 * précédence) — pas de la recherche plein texte.
 */

export interface RouteResult {
  status: 'ok' | 'no-scenario' | 'ambiguous';
  scenario?: Scenario;
  matches: Scenario[];
}

const normalize = (q: string): string =>
  q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ROUTES: { scenarioId: string; patterns: RegExp[] }[] = [
  {
    scenarioId: 'temp-max',
    patterns: [/temperature/, /thermiq/, /temp max/, /degre/, /°c/i],
  },
  {
    scenarioId: 'power-max',
    patterns: [/puissance/, /power/, /watt/, /electrique/],
  },
  {
    scenarioId: 'altitude-max',
    patterns: [/altitude/, /hauteur/],
  },
];

export function routeQuestion(question: string): RouteResult {
  const normalized = normalize(question);
  const matches = ROUTES.filter((r) => r.patterns.some((p) => p.test(normalized)))
    .map((r) => SCENARIOS.find((s) => s.id === r.scenarioId)!)
    .filter(Boolean);

  if (matches.length === 0) return { status: 'no-scenario', matches: [] };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'ok', scenario: matches[0], matches };
}