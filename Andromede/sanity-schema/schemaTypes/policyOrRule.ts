import { defineType, defineField } from 'sanity';

export const policyOrRule = defineType({
  name: 'policyOrRule',
  title: 'Policy / Rule',
  type: 'document',
  description:
    'Une règle normative : une spécification officielle, une contrainte technique ' +
    "ou de sécurité, datée et taguée, avec sa valeur chiffrée formelle (normativeValue).",
  fields: [
    defineField({
      name: 'id',
      title: 'Rule ID',
      type: 'string',
      description: 'Identifiant contractuel de la règle, ex : AERO-POL-2026-104.',
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
      name: 'scope',
      title: 'Scope',
      type: 'string',
      description: 'Portée de la règle, ex : module:ctrl-7.',
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      description: 'Énoncé complet en langage naturel.',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
    }),
    defineField({
      name: 'normativeValue',
      title: 'Normative value',
      type: 'number',
      description:
        'La valeur chiffrée que la règle impose. C’est le champ sur lequel l’agent ' +
        'raisonne formellement, il ne parse jamais le corps de texte.',
    }),
    defineField({
      name: 'normativeUnit',
      title: 'Normative unit',
      type: 'string',
      description: 'Unité de la valeur normative, ex : °C, W, m.',
    }),
    defineField({
      name: 'precedenceLevel',
      title: 'Precedence level',
      type: 'number',
      description: 'Niveau de précédence de la règle (1 = base, plus haut = prioritaire).',
      initialValue: 1,
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'id' },
  },
});