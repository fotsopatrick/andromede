import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_DOCUMENTS } from './seed-data.ts';

/**
 * Fabrique kb-fixtures/documents.json — le magasin local exact alimenté par le
 * serveur MCP de contexte. Ce fichier est un artefact de PREUVE : il contient
 * exactement ce que le Content Lake contiendra après l'exécution du seed réel.
 */
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'kb-fixtures', 'documents.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(SEED_DOCUMENTS, null, 2) + '\n', 'utf8');
console.log(`[seed:local] ${SEED_DOCUMENTS.length} documents écrits dans ${out}`);