import { defineType, defineField } from 'sanity';

export const resolutionCase = defineType({
  name: 'resolutionCase',
  title: 'Resolution Case',
  type: 'document',
  description:
    'Dossier d’arbitrage : la photographie d’un conflit tranché — le scénario de requête, ' +
    'les sources en conflit, la source faisant autorité, le verdict final posé par un humain.',
  fields: [
    defineField({
      name: 'id',
      title: 'Case ID',
      type: 'string',
      description: 'Ex : AERO-CASE-2026-011.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'queryScenario',
      title: 'Query scenario',
      type: 'string',
      description:
        'Le scénario de question auquel ce dossier répond. L’agent y mappe les questions utilisateur.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'authoritativeSourceRef',
      title: 'Authoritative source',
      type: 'reference',
      to: [{ type: 'policyOrRule' }, { type: 'errataOrAmendment' }],
      description: 'La source qui fait autorité pour ce scénario.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'conflictingSources',
      title: 'Conflicting sources',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'policyOrRule' }, { type: 'errataOrAmendment' }] }],
      description: 'Les sources qui se contredisaient avant l’arbitrage.',
    }),
    defineField({
      name: 'finalVerdict',
      title: 'Final verdict',
      type: 'text',
      description: 'Le verdict formel posé, tel qu’il doit être restitué.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'decidedBy',
      title: 'Decided by',
      type: 'string',
    }),
    defineField({
      name: 'decisionDate',
      title: 'Decision date',
      type: 'date',
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'id' },
  },
});