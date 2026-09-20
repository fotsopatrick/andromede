import { createClient } from '@sanity/client';
import { SEED_DOCUMENTS } from './seed-data.ts';

/**
 * SEED DU CONTENT LAKE réel.
 *
 *   SANITY_PROJECT_ID=xxxx SANITY_DATASET=production SANITY_TOKEN=sk... npm run seed
 *
 * Les `_id` sont déterministes : le script est idempotent (createOrReplace).
 * Les documents injectés sont STRICTEMENT les mêmes que ceux du magasin local
 * (seed-data.ts) : le banc de tests local reproduit donc le comportement du
 * vrai endpoint jusqu'à ce qu'il soit pointé sur le projet.
 */

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET ?? 'production';
const token = process.env.SANITY_TOKEN;

if (!projectId || !token) {
  console.error(
    '[seed-sanity] REFUS : variables requises absentes. Aucun seed n\'est injecté à l\'aveugle.'
  );
  console.error('  - SANITY_PROJECT_ID : identifiant du projet Sanity (ex : xxxxxxxx)');
  console.error('  - SANITY_TOKEN      : jeton d\'API Server-side (obligatoire, jamais en clair dans le repo)');
  console.error('  - SANITY_DATASET    : dataset cible (défaut : production)');
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: '2026-09-20',
  useCdn: false,
});

async function main() {
  console.log(`[seed-sanity] projet ${projectId} / dataset ${dataset}`);
  console.log(`[seed-sanity] ${SEED_DOCUMENTS.length} documents à injecter (createOrReplace, _id déterministes)`);
  for (const doc of SEED_DOCUMENTS) {
    const res = await client.createOrReplace(doc as Parameters<typeof client.createOrReplace>[0]);
    console.log(`[seed-sanity]   ✓ ${res._id} (${doc._type})`);
  }
  console.log('[seed-sanity] SUCCES — base de connaissances prête pour le Context MCP.');
  console.log(`Dataset public : https://${projectId}.apicdn.sanity.io/v2026-09-20/data/query/${dataset}?query=*[_type=%22policyOrRule%22]`);
}

main().catch((err) => {
  console.error(`[seed-sanity] ECHEC : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});