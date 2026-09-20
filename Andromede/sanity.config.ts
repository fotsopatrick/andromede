import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity-schema/schemaTypes/index.ts';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? 'changeme';
const dataset = process.env.SANITY_STUDIO_DATASET ?? 'production';

export default defineConfig({
  name: 'aero-kit-knowledge-base',
  title: 'Sanity Challenge — Agent de règles',
  projectId,
  dataset,
  plugins: [structureTool()],
  schema: { types: schemaTypes },
});