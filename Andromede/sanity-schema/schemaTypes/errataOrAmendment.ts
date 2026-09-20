import { defineType, defineField } from 'sanity';

export const errataOrAmendment = defineType({
  name: 'errataOrAmendment',
  title: 'Errata / Amendment',
  type: 'document',
  description:
    'Un amendement ou errata qui cible une règle existante (targetRuleRef), modifie ' +
    'son énoncé, et porte un niveau de précédence permettant l’arbitrage automatique.',
  fields: [
    defineField({
      name: 'id',
      title: 'Amendment ID',
      type: 'string',
      description: 'Ex : AERO-ERR-2026-091.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: { list: ['draft', 'active', 'deprecated'] },
      initialValue: 'draft',
    }),
    defineField({
      name: 'effectiveDate',
      title: 'Effective date',
      type: 'date',
    }),
    defineField({
      name: 'targetRuleRef',
      title: 'Target rule',
      type: 'reference',
      to: [{ type: 'policyOrRule' }],
      description: 'La règle originale que cet amendement corrige.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'contradictionType',
      title: 'Contradiction type',
      type: 'string',
      options: {
        list: [
          { title: 'Security override', value: 'security-override' },
          { title: 'Operational conflict', value: 'operational-conflict' },
          { title: 'Version drift', value: 'version-drift' },
          { title: 'Editorial fix', value: 'editorial-fix' },
        ],
      },
    }),
    defineField({
      name: 'amendedStatement',
      title: 'Amended statement',
      type: 'text',
      description: 'L’énoncé qui remplace celui de la règle ciblée.',
    }),
    defineField({
      name: 'amendedValue',
      title: 'Amended value',
      type: 'number',
      description: 'La nouvelle valeur chiffrée formelle.',
    }),
    defineField({
      name: 'precedenceLevel',
      title: 'Precedence level',
      type: 'number',
      description:
        'Niveau de précédence de l’amendement. S’il est strictement supérieur à celui ' +
        'de la règle ciblée, l’amendement prime.',
    }),
    defineField({
      name: 'resolutionNote',
      title: 'Resolution note',
      type: 'text',
      description: 'Justification textuelle de l’arbitrage.',
    }),
    defineField({
      name: 'sourceUrl',
      title: 'Source URL',
      type: 'url',
      description: 'Lien vers le document source (bulletin, avis, PDF officiel).',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'id' },
  },
});