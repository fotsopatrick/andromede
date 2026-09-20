import type { SanityDoc } from '../../scripts/seed-data.ts';

/**
 * BASELINE « RAG PAR MOT-CLÉ » — la référence que le pipeline structuré doit
 * battre (TEST 3).
 *
 * Ce module simule honnêtement une recherche plein-texte/sémantique naïve sur
 * le corpus : tokens de la question vs texte concaténé des documents, score de
 * recouvrement, échantillon le plus proche. Il n'a AUCUNE connaissance du
 * schéma, des tags, des références ni de la précédence.
 *
 * Résultat voulu : sur la question thermique, ce baseline tombe sur l'énoncé
 * littéral de la spécification (75 °C) alors que la vérité normative est la
 * valeur amendée (60 °C).
 */

export interface NaiveHit {
  _id: string;
  _type: string;
  title: string;
  snippet: string;
  claimedValue: number | null;
  claimedUnit: string | null;
  score: number;
}

const normalize = (q: string): string =>
  q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function phraseOf(doc: SanityDoc): string {
  const stmt =
    doc._type === 'errataOrAmendment'
      ? doc.amendedStatement
      : 'body' in doc && typeof doc.body === 'string'
        ? doc.body
        : '';
  const tags = (doc as SanityDoc & { tags?: string[] }).tags ?? [];
  return `${doc.title} ${stmt} ${tags.join(' ')}`;
}

export function figureOf(text: string): { value: number | null; unit: string | null } {
  const m = /(\d+(?:[.,]\d+)?)\s*(°C|°C|W|m)\b/.exec(text);
  if (!m) return { value: null, unit: null };
  return { value: parseFloat(m[1].replace(',', '.')), unit: m[2] === 'W' ? 'W' : m[2] === 'm' ? 'm' : '°C' };
}

export function naiveKeywordSearch(corpus: SanityDoc[], question: string): NaiveHit[] {
  const tokens = normalize(question)
    .split(' ')
    .filter((w) => w.length > 2);
  const scored = corpus
    .map((doc) => {
      const text = phraseOf(doc);
      const nText = normalize(text);
      let score = 0;
      let matched = 0;
      for (const t of tokens) {
        if (nText.includes(t)) {
          score++;
          matched++;
        }
      }
      return { doc, text, score, matched };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.matched - b.matched);

  return scored.map(({ doc, text, score }) => {
    const fig = figureOf(text);
    return {
      _id: doc._id,
      _type: doc._type,
      title: doc.title,
      snippet: text,
      claimedValue: fig.value,
      claimedUnit: fig.unit,
      score,
    };
  });
}