export type RuleStatus = 'draft' | 'active' | 'deprecated';
export type ContradictionType =
  | 'security-override'
  | 'operational-conflict'
  | 'version-drift'
  | 'editorial-fix';

export interface PolicyOrRuleDoc {
  _id: string;
  _type: 'policyOrRule';
  id: string;
  title: string;
  version: string;
  status: RuleStatus;
  effectiveDate: string;
  body: string;
  tags: string[];
  scope: string;
  normativeValue: number;
  normativeUnit: string;
  precedenceLevel: number;
}

export interface ErrataOrAmendmentDoc {
  _id: string;
  _type: 'errataOrAmendment';
  id: string;
  title: string;
  version: string;
  status: RuleStatus;
  effectiveDate: string;
  targetRuleRef: { _type: 'reference'; _ref: string };
  contradictionType: ContradictionType;
  amendedStatement: string;
  amendedValue: number;
  precedenceLevel: number;
  resolutionNote: string;
  sourceUrl: string;
  tags: string[];
}

export interface ResolutionCaseDoc {
  _id: string;
  _type: 'resolutionCase';
  id: string;
  title: string;
  queryScenario: string;
  authoritativeSourceRef: { _type: 'reference'; _ref: string };
  conflictingSources: { _type: 'reference'; _ref: string }[];
  finalVerdict: string;
  decidedBy: string;
  decisionDate: string;
}

export type SanityDoc = PolicyOrRuleDoc | ErrataOrAmendmentDoc | ResolutionCaseDoc;

const ruleRef = (_ref: string) => ({ _type: 'reference' as const, _ref });

export const SEED_DOCUMENTS: SanityDoc[] = [
  // ---------------------------------------------------------------------
  // Règle 1 : la spécification officielle que l'amendement de sécurité va
  // contredire. C'est l'objet du TEST 2 (contradiction détectée + arbitrage).
  // ---------------------------------------------------------------------
  {
    _id: 'rule-ctrl7-temp-spec',
    _type: 'policyOrRule',
    id: 'AERO-POL-2026-104',
    title: 'Spécification officielle — Régulation thermique du module CTRL-7',
    version: '1.0',
    status: 'active',
    effectiveDate: '2026-01-15',
    body:
      'Conformément à la spécification produit AERO-POL-2026-104, la température ' +
      'maximale configurable du module de régulation CTRL-7 est de 75 °C.',
    tags: ['temperature', 'spec', 'ctrl-7'],
    scope: 'module:ctrl-7',
    normativeValue: 75,
    normativeUnit: '°C',
    precedenceLevel: 1,
  },

  // ---------------------------------------------------------------------
  // Règle 2 : requête UNIVOQUE (TEST 1). Aucun amendement ne la contredit.
  // ---------------------------------------------------------------------
  {
    _id: 'rule-ctrl7-power-spec',
    _type: 'policyOrRule',
    id: 'AERO-POL-2026-105',
    title: 'Spécification officielle — Puissance du module CTRL-7',
    version: '1.0',
    status: 'active',
    effectiveDate: '2026-01-15',
    body:
      'La puissance électrique maximale du module CTRL-7 est de 500 W.',
    tags: ['power', 'spec', 'ctrl-7'],
    scope: 'module:ctrl-7',
    normativeValue: 500,
    normativeUnit: 'W',
    precedenceLevel: 1,
  },

  // ---------------------------------------------------------------------
  // Règles 3 & 4 : deux sources ACTIVES contradictoires SANS relation
  // d'arbitrage. Objet du TEST 4 (garde-fou : refuser d'extrapoler).
  // ---------------------------------------------------------------------
  {
    _id: 'rule-ctrl7-altitude-install',
    _type: 'policyOrRule',
    id: 'AERO-POL-2026-107',
    title: "Contrainte d'installation — Altitude maximale du CTRL-7",
    version: '1.0',
    status: 'active',
    effectiveDate: '2026-02-01',
    body:
      "Le module CTRL-7 peut être installé jusqu'à une altitude de 2000 m.",
    tags: ['altitude', 'installation', 'ctrl-7'],
    scope: 'installation:ctrl-7',
    normativeValue: 2000,
    normativeUnit: 'm',
    precedenceLevel: 1,
  },
  {
    _id: 'rule-ctrl7-altitude-maintenance',
    _type: 'policyOrRule',
    id: 'AERO-POL-2026-108',
    title: 'Contrainte de maintenance — Altitude maximale du CTRL-7',
    version: '1.1',
    status: 'active',
    effectiveDate: '2026-03-10',
    body:
      "La garantie de maintenance du module CTRL-7 cesse au-delà d'une altitude " +
      'de 1500 m : toute intervention couverte est exclue au-dessus de ce seuil.',
    tags: ['altitude', 'maintenance', 'ctrl-7'],
    scope: 'maintenance:ctrl-7',
    normativeValue: 1500,
    normativeUnit: 'm',
    precedenceLevel: 1,
  },

  // ---------------------------------------------------------------------
  // L'amendement de sécurité : il cible la règle 1 (targetRuleRef) et
  // dispose d'un precedenceLevel supérieur. C'est LUI qui arbitre (TEST 2).
  // ---------------------------------------------------------------------
  {
    _id: 'errata-ctrl7-temp-sec',
    _type: 'errataOrAmendment',
    id: 'AERO-ERR-2026-091',
    title: 'Amendement de sécurité — CTRL-7 : plafond thermique',
    version: '1.2',
    status: 'active',
    effectiveDate: '2026-06-01',
    targetRuleRef: ruleRef('rule-ctrl7-temp-spec'),
    contradictionType: 'security-override',
    amendedStatement:
      "En application du bulletin de sécurité CTRL7-SEC-2026-02, la température " +
      'maximale configurable du module CTRL-7 est ramenée à 60 °C.',
    amendedValue: 60,
    precedenceLevel: 3,
    resolutionNote:
      "L'avis de sécurité (niveau de précédence 3) prime sur la spécification " +
      'produit (niveau 1) tant qu\'il est actif. La règle AERO-POL-2026-104 reste ' +
      "lue à travers cet amendement.",
    sourceUrl: 'https://kb.aero-kit.example/security/CTRL7-SEC-2026-02',
    tags: ['temperature', 'security', 'ctrl-7'],
  },

  // ---------------------------------------------------------------------
  // Dossier d'arbitrage (ResolutionCase) : la conclusion formelle posée par
  // un humain. L'agent la recoupe avec sa propre dérivation, il ne s'y fie
  // jamais aveuglément.
  // ---------------------------------------------------------------------
  {
    _id: 'case-ctrl7-temp-max',
    _type: 'resolutionCase',
    id: 'AERO-CASE-2026-011',
    title: 'Arbitrage — Température maximale configurable du CTRL-7',
    queryScenario: 'Maximum configurable temperature',
    authoritativeSourceRef: ruleRef('errata-ctrl7-temp-sec'),
    conflictingSources: [
      ruleRef('rule-ctrl7-temp-spec'),
      ruleRef('errata-ctrl7-temp-sec'),
    ],
    finalVerdict:
      "60 °C — l'amendement de sécurité AERO-ERR-2026-091 (bulletin " +
      'CTRL7-SEC-2026-02) prévaut sur la spécification AERO-POL-2026-104.',
    decidedBy: 'AERO-KIT — Responsable conformité',
    decisionDate: '2026-06-15',
  },
];

export function seedByType<T extends SanityDoc['_type']>(
  type: T
): Extract<SanityDoc, { _type: T }>[] {
  return SEED_DOCUMENTS.filter((d) => d._type === type) as Extract<
    SanityDoc,
    { _type: T }
  >[];
}