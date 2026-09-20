/**
 * REGISTRE DE SCHÉMA — miroir local des définitions Sanity (sanity-schema/).
 *
 * Sanity Context en mode GROQ expose un compressed schema overview via
 * `initial_context` et des détails par type via `schema_explorer`. Ce registre
 * reproduit les trois types Document de la base de connaissances (mêmes noms,
 * mêmes champs, mêmes descriptions) pour que le serveur MCP local soit fidèle
 * à ce qu'exposerait le vrai endpoint.
 *
 * Un test (tests/test-schema-mirror.test.ts) vérifie que ce miroir est
 * synchrone avec les définitions du Studio : aucun champ ne peut diverger
 * sans faire rougir le banc.
 */

export interface MirrorField {
  name: string;
  type: string;
  title: string;
  description?: string;
  required: boolean;
  options?: { list?: string[] };
}

export interface MirrorType {
  name: string;
  title: string;
  description: string;
  fields: MirrorField[];
}

const stringField = (name: string, title: string, opts: Partial<MirrorField> = {}): MirrorField => ({
  name,
  type: 'string',
  title,
  required: false,
  ...opts,
});

const numberField = (name: string, title: string, opts: Partial<MirrorField> = {}): MirrorField => ({
  name,
  type: 'number',
  title,
  required: false,
  ...opts,
});

export const SCHEMA_REGISTRY: Record<string, MirrorType> = {
  policyOrRule: {
    name: 'policyOrRule',
    title: 'Policy / Rule',
    description:
      'Une règle normative : une spécification officielle, une contrainte technique ' +
      'ou de sécurité, datée et taguée, avec sa valeur chiffrée formelle (normativeValue).',
    fields: [
      stringField('id', 'Rule ID', { required: true, description: 'Ex : AERO-POL-2026-104.' }),
      stringField('title', 'Title', { required: true }),
      stringField('version', 'Version', { required: true }),
      stringField('status', 'Status', {
        options: { list: ['draft', 'active', 'deprecated'] },
        description: 'Supports les filtres status == "active".',
      }),
      stringField('effectiveDate', 'Effective date', { description: 'Date ISO AAAA-MM-JJ.' }),
      stringField('scope', 'Scope', { description: 'Ex : module:ctrl-7.' }),
      stringField('body', 'Body', { description: 'Énoncé complet en langage naturel.' }),
      { name: 'tags', type: 'array<string>', title: 'Tags', required: false },
      numberField('normativeValue', 'Normative value', {
        description: "La valeur chiffrée formelle que l'agent compare — il ne parse pas le corps de texte.",
      }),
      stringField('normativeUnit', 'Normative unit', { description: 'Ex : °C, W, m.' }),
      numberField('precedenceLevel', 'Precedence level', { description: '1 = base, plus haut = prioritaire.' }),
    ],
  },
  errataOrAmendment: {
    name: 'errataOrAmendment',
    title: 'Errata / Amendment',
    description:
      'Un amendement ou errata qui cible une règle existante (targetRuleRef), modifie ' +
      'son énoncé, et porte un niveau de précédence permettant l’arbitrage automatique.',
    fields: [
      stringField('id', 'Amendment ID', { required: true, description: 'Ex : AERO-ERR-2026-091.' }),
      stringField('title', 'Title', { required: true }),
      stringField('version', 'Version', { required: true }),
      stringField('status', 'Status', {
        options: { list: ['draft', 'active', 'deprecated'] },
        description: 'Seuls les amendements actifs tranchent.',
      }),
      stringField('effectiveDate', 'Effective date', { description: 'Date ISO AAAA-MM-JJ.' }),
      stringField('targetRuleRef', 'Target rule', {
        required: true,
        description: 'Reference vers policyOrRule via targetRuleRef._ref.',
      }),
      stringField('contradictionType', 'Contradiction type', {
        options: {
          list: ['security-override', 'operational-conflict', 'version-drift', 'editorial-fix'],
        },
      }),
      stringField('amendedStatement', 'Amended statement', { description: "L'énoncé qui remplace celui de la règle." }),
      numberField('amendedValue', 'Amended value', { description: 'La nouvelle valeur chiffrée formelle.' }),
      numberField('precedenceLevel', 'Precedence level', {
        description: 'Strictement supérieur à celui de la règle ciblée → l’amendement prime.',
      }),
      stringField('resolutionNote', 'Resolution note', { description: 'Justification de l’arbitrage.' }),
      stringField('sourceUrl', 'Source URL', { description: 'Lien vers le document source.' }),
      { name: 'tags', type: 'array<string>', title: 'Tags', required: false },
    ],
  },
  resolutionCase: {
    name: 'resolutionCase',
    title: 'Resolution Case',
    description:
      'Dossier d’arbitrage : la photographie d’un conflit tranché — scénario, sources en ' +
      'conflit, source faisant autorité, verdict final posé par un humain.',
    fields: [
      stringField('id', 'Case ID', { required: true, description: 'Ex : AERO-CASE-2026-011.' }),
      stringField('title', 'Title', { required: true }),
      stringField('queryScenario', 'Query scenario', {
        required: true,
        description: "Scénario auquel l'agent mappe les questions utilisateur.",
      }),
      stringField('authoritativeSourceRef', 'Authoritative source', {
        required: true,
        description: 'Reference vers la source qui fait autorité.',
      }),
      { name: 'conflictingSources', type: 'array<reference>', title: 'Conflicting sources', required: false },
      stringField('finalVerdict', 'Final verdict', { required: true, description: 'Le verdict formel posé.' }),
      stringField('decidedBy', 'Decided by', {}),
      stringField('decisionDate', 'Decision date', { description: 'Date ISO AAAA-MM-JJ.' }),
    ],
  },
};

export const SCHEMA_TYPE_NAMES = Object.keys(SCHEMA_REGISTRY);

export function buildInitialContext(projectId: string, dataset: string): string {
  const lines: string[] = [];
  lines.push('SANITY CONTEXT — MODE GROQ');
  lines.push(`Project : ${projectId} / dataset : ${dataset}`);
  lines.push('Endpoint : read-only. L\'agent interroge le schéma, jamais la mémoire du modèle.');
  lines.push('');
  lines.push('Types de documents exposés :');
  for (const type of SCHEMA_TYPE_NAMES) {
    const t = SCHEMA_REGISTRY[type];
    lines.push(`- ${t.name} (${t.title}) : ${t.fields.map((f) => f.name).join(', ')}`);
  }
  lines.push('');
  lines.push(
    "Relations de précédence : policyOrRule.precedenceLevel vs errataOrAmendment.precedenceLevel. " +
      "Un amendement actif (targetRuleRef._ref) dont la précédence est strictement supérieure prime " +
      "sur sa règle ciblée ; amendedValue remplace normativeValue."
  );
  lines.push(
    'Dossiers d\'arbitrage : resolutionCase.queryScenario, authoritativeSourceRef, finalVerdict.'
  );
  return lines.join('\n');
}