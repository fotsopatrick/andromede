import type { SanityDoc } from '../scripts/seed-data.ts';

/**
 * INTERPRÉTEUR GROQ — sous-ensemble documenté et borné.
 *
 * Ce n'est pas un moteur GROQ complet : c'est un interpréteur déterministe qui
 * couvre EXACTEMENT la grammaire que l'agent émet (voir agent/src/scenarios.ts).
 * Toute syntaxe hors de ce sous-ensemble refuse de s'exécuter (pas de faux
 * résultat silencieux). Le comportement est vérifié par les tests sur le
 * sous-ensemble couvert : filtres de type (==, in), conditions (==, !=, >, <,
 * >=, <= — chaînes comparées lexicographiquement pour les dates ISO), "in" sur
 * tableaux, match (sous-chaîne), projections et slices [n], [n..m], [n...m].
 * Ce n'est PAS une garantie de parité au-delà de ce sous-ensemble testé.
 *
 * Grammaire supportée :
 *
 *   query  := '*' '[' typeCond ( '&&' cond )* ']' proj? slice?
 *   typeCond := '_type' '==' string | '_type' 'in' '[' string (',' string)* ']'
 *   cond   := path op value | string 'in' path | path sp 'match' sp string
 *   op     := '==' | '!=' | '>' | '<' | '>=' | '<='
 *   path   := ident ('.' ident)* ('[]')?     // '[]' final = champ tableau
 *   proj   := '{' ident (',' ident)* '}'
 *   slice  := '[' num ']' | '[' num '..' num ']' | '[' num '...' num ']'
 */

export class GroqSyntaxError extends Error {
  readonly query: string;
  constructor(message: string, query: string) {
    super(`[miniGROQ] ${message}\n    query : ${query}`);
    this.name = 'GroqSyntaxError';
    this.query = query;
  }
}

interface Cond {
  pathParts: string[];
  arrayField: boolean;
  op: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'match';
  value: unknown;
}

interface ParsedQuery {
  typeConds: { op: '==' | 'in'; value: unknown }[];
  conds: Cond[];
  projection: string[] | null;
  slice: { start: number; end?: number; exclusive?: boolean } | null;
}

const STR_RE = /^"((?:\\.|[^"\\])*)"$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;

function parseString(raw: string, query: string): string {
  const m = STR_RE.exec(raw);
  if (!m) throw new GroqSyntaxError(`chaîne invalide : ${raw}`, query);
  if (raw.includes('\\"')) {
    return JSON.parse(raw);
  }
  return m[1];
}

function parseValue(raw: string, query: string): string | number | boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (NUM_RE.test(raw)) return parseFloat(raw);
  if (STR_RE.test(raw)) return parseString(raw, query);
  throw new GroqSyntaxError(`valeur invalide : ${raw}`, query);
}

function tokenizeConds(filters: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (let i = 0; i < filters.length; i++) {
    const c = filters[i];
    if (c === '"') {
      inString = !inString;
      current += c;
      continue;
    }
    if (!inString) {
      if (c === '[' || c === '(') depth++;
      else if (c === ']' || c === ')') depth--;
      else if (c === '&' && depth === 0) {
        if (filters[i + 1] === '&') {
          if (current.trim().length) out.push(current.trim());
          current = '';
          i++; // saute le second '&'
          continue;
        }
      }
    }
    current += c;
  }
  if (inString) throw new GroqSyntaxError(`chaîne non fermée`, filters);
  if (current.trim().length) out.push(current.trim());
  return out;
}

const PATH_RE = /^(\w[\w]*(?:\.\w[\w]*)*)(\[\])?$/;

function parseCond(raw: string, query: string): Cond {
  const inMatch = /^"(.+)"\s+in\s+(\w[\w]*(?:\.\w[\w]*)*)(\[\])?$/.exec(raw);
  if (inMatch) {
    const p = PATH_RE.exec(inMatch[2]);
    if (!p) throw new GroqSyntaxError(`chemin invalide dans 'in' : ${inMatch[2]}`, query);
    return {
      pathParts: p[1].split('.'),
      arrayField: p[2] === '[]',
      op: 'in',
      value: parseString(`"${inMatch[1]}"`, query),
    };
  }
  const matchRe = /^(\w[\w]*(?:\.\w[\w]*)*)(\[\])?\s+match\s+(.+)$/.exec(raw);
  if (matchRe) {
    return {
      pathParts: matchRe[1].split('.'),
      arrayField: matchRe[2] === '[]',
      op: 'match',
      value: parseValue(matchRe[3], query),
    };
  }
  const opRe = /^(\w[\w]*(?:\.\w[\w]*)*)(\[\])?\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(raw);
  if (opRe) {
    return {
      pathParts: opRe[1].split('.'),
      arrayField: opRe[2] === '[]',
      op: opRe[3] as Cond['op'],
      value: parseValue(opRe[4], query),
    };
  }
  throw new GroqSyntaxError(`condition non reconnue : ${raw}`, query);
}

export function parseGroq(query: string): ParsedQuery {
  const trimmed = query.trim();
  if (!trimmed.startsWith('*[')) {
    throw new GroqSyntaxError('la requête doit commencer par *[', query);
  }
  const body = trimmed.slice(2);
  let i = 0;
  let depth = 0;
  let inString = false;
  for (; i < body.length; i++) {
    const c = body[i];
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === '[') depth++;
    if (c === ']') {
      if (depth > 0) depth--;
      else break; // fermeture du filtre (le `[` ouvreur a déjà été consommé)
    }
  }
  if (i >= body.length) throw new GroqSyntaxError('filtre [..] non fermé', query);
  const filterRaw = body.slice(0, i);
  let rest = body.slice(i + 1);

  const typeConds: ParsedQuery['typeConds'] = [];
  const conds: ParsedQuery['conds'] = [];
  for (const raw of tokenizeConds(filterRaw)) {
    const teq = /^_type\s+==\s+(.+)$/.exec(raw);
    const tin = /^_type\s+in\s+\[\s*(.+)\s*\]$/.exec(raw);
    if (teq) {
      typeConds.push({ op: '==', value: parseString(teq[1], query) });
      continue;
    }
    if (tin) {
      const vals = tin[1]
        .split(',')
        .map((s) => s.trim())
        .map((s) => parseValue(s, query));
      typeConds.push({ op: 'in', value: vals });
      continue;
    }
    conds.push(parseCond(raw, query));
  }

  let projection: string[] | null = null;
  let slice: ParsedQuery['slice'] = null;
  rest = rest.trim();
  while (rest.length) {
    if (rest.startsWith('{') && projection === null) {
      const end = rest.indexOf('}');
      if (end === -1) throw new GroqSyntaxError('projection {..} non fermée', query);
      const inner = rest.slice(1, end).trim();
      projection = inner.length ? inner.split(',').map((s) => s.trim()) : [];
      rest = rest.slice(end + 1).trim();
      continue;
    }
    if (rest.startsWith('[') && slice === null) {
      const end = rest.indexOf(']');
      if (end === -1) throw new GroqSyntaxError('slice [..] non fermé', query);
      const inner = rest.slice(1, end).trim();
      const one = /^(\d+)$/.exec(inner);
      const rr = /^(\d+)\s*\.\.\s*(\d+)$/.exec(inner);
      const rex = /^(\d+)\s*\.\.\.\s*(\d+)$/.exec(inner);
      if (one) slice = { start: parseInt(one[1], 10) };
      else if (rr) slice = { start: parseInt(rr[1], 10), end: parseInt(rr[2], 10) };
      else if (rex) slice = { start: parseInt(rex[1], 10), end: parseInt(rex[2], 10), exclusive: true };
      else throw new GroqSyntaxError(`slice invalide : ${inner}`, query);
      rest = rest.slice(end + 1).trim();
      continue;
    }
    throw new GroqSyntaxError(`syntaxe non supportée après la requête : ${rest}`, query);
  }

  return { typeConds, conds, projection, slice };
}

function walkPath(doc: SanityDoc, parts: string[]): unknown {
  let cur: unknown = doc;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function compare(a: unknown, op: Cond['op'], b: unknown): boolean {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
  // Ordre : les chaînes sont comparées LEXICOGRAPHIQUEMENT (nécessaire pour les
  // dates ISO AAAA-MM-JJ de effectiveDate), tout le reste numériquement.
  if (typeof a === 'string' && typeof b === 'string') {
    switch (op) {
      case '>':
        return a > b;
      case '<':
        return a < b;
      case '>=':
        return a >= b;
      case '<=':
        return a <= b;
    }
  }
  switch (op) {
    case '>':
      return (a as number) > (b as number);
    case '<':
      return (a as number) < (b as number);
    case '>=':
      return (a as number) >= (b as number);
    case '<=':
      return (a as number) <= (b as number);
    default:
      throw new GroqSyntaxError(`opérateur ${op} illégal en comparaison directe`, '');
  }
}

function evalCond(doc: SanityDoc, cond: Cond): boolean {
  if (cond.op === 'in') {
    if (cond.arrayField) {
      if (cond.value === null || cond.value === undefined) return false;
      const arr = walkPath(doc, cond.pathParts);
      return Array.isArray(arr) && arr.includes(cond.value);
    }
    // "<valeur> in <champ>" : le champ doit être un tableau contenant la valeur
    const arr = walkPath(doc, cond.pathParts);
    return Array.isArray(arr) && arr.includes(cond.value);
  }
  if (cond.op === 'match') {
    if (cond.arrayField) {
      const arr = walkPath(doc, cond.pathParts);
      if (!Array.isArray(arr)) return false;
      const needle = String(cond.value).toLowerCase();
      return arr.some((item) => String(item).toLowerCase().includes(needle));
    }
    const val = walkPath(doc, cond.pathParts);
    if (val === null || val === undefined) return false;
    return String(val)
      .toLowerCase()
      .includes(String(cond.value).toLowerCase());
  }
  const val = walkPath(doc, cond.pathParts);
  return compare(val, cond.op, cond.value);
}

export interface GroqMeta {
  resultCount: number;
  returnedCount: number;
}

export function evaluateGroqWithMeta(
  documents: SanityDoc[],
  query: string
): { result: unknown; resultCount: number; returnedCount: number } {
  const parsed = parseGroq(query);
  let rows: SanityDoc[] = documents;
  if (parsed.typeConds.length) {
    rows = rows.filter((d) =>
      parsed.typeConds.every((tc) =>
        tc.op === '==' ? d._type === tc.value : (tc.value as string[]).includes(d._type)
      )
    );
  }
  for (const cond of parsed.conds) {
    rows = rows.filter((d) => evalCond(d, cond));
  }
  const resultCount = rows.length;
  let result: unknown = rows.map((d) => {
    if (!parsed.projection) return d;
    const out: Record<string, unknown> = {};
    for (const key of parsed.projection) out[key] = walkPath(d, key.split('.'));
    return out;
  });
  if (parsed.slice) {
    const s = parsed.slice;
    const arr = result as unknown[];
    if (s.end === undefined) {
      result = arr.slice(s.start, s.start + 1)[0];
    } else if (s.exclusive) {
      // [n...m] : fin EXCLUSIVE (m non inclus), comme le moteur GROQ de Sanity.
      result = arr.slice(s.start, s.end);
    } else {
      // [n..m] : fin INCLUSIVE.
      result = arr.slice(s.start, s.end + 1);
    }
  }
  return { result, resultCount, returnedCount: Array.isArray(result) ? result.length : result === undefined ? 0 : 1 };
}

export function evaluateGroq(documents: SanityDoc[], query: string): unknown {
  return evaluateGroqWithMeta(documents, query).result;
}