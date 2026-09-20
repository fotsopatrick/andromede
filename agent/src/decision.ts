import type {
  AnswerBody,
  SourceCitation,
  ToolTrace,
} from './model.ts';
import type { Scenario } from './scenarios.ts';

/**
 * PIPELINE DE DÉCISION — le cœur de l'agent.
 *
 * Toute l'arbitration se fait sur des champs STRUCTURÉS (normativeValue,
 * amendedValue, precedenceLevel, targetRuleRef, status) — aucune lecture
 * heuristique du corps de texte. Les règles sont simples et vérifiées par des
 * preuves formelles :
 *
 *  R1. Une seule source active et non amendée → verdict (valeur normative).
 *  R2. Un amendement actif ciblant la règle (targetRuleRef._ref), avec
 *      precedenceLevel strictement supérieur → l'amendement PRIME : sa valeur
 *      remplace celle de la règle ; les DEUX sources sont citées.
 *  R3. Plusieurs sources actives donnent des valeurs différentes et aucune
 *      relation de précédence ne tranche → REFUS d'extrapoler, sauf si un
 *      dossier d'arbitrage (resolutionCase) cohérent existe.
 *  R4. Aucun document ne couvre le scénario → clarification, jamais d'invention.
 */

export interface FetchedRule {
  _id: string;
  _type: 'policyOrRule';
  id: string;
  title: string;
  version: string;
  status: string;
  effectiveDate?: string;
  body: string;
  tags: string[];
  scope: string;
  normativeValue: number;
  normativeUnit: string;
  precedenceLevel: number;
}

export interface FetchedAmendment {
  _id: string;
  _type: 'errataOrAmendment';
  id: string;
  title: string;
  version: string;
  status: string;
  effectiveDate?: string;
  contradictionType?: string;
  targetRuleRef?: { _type?: string; _ref: string };
  amendedStatement: string;
  amendedValue: number;
  precedenceLevel: number;
  resolutionNote: string;
  sourceUrl: string;
}

export interface FetchedCase {
  _id: string;
  _type: 'resolutionCase';
  id: string;
  title: string;
  queryScenario: string;
  authoritativeSourceRef: { _type: string; _ref: string };
  conflictingSources: { _type: string; _ref: string }[];
  finalVerdict: string;
  decidedBy?: string;
  decisionDate?: string;
}

export type FetchedSource = FetchedRule | FetchedAmendment;

export interface DecideInput {
  question: string;
  scenario: Scenario;
  candidates: FetchedRule[];
  amendments: FetchedAmendment[]; // déjà filtrés status == "active"
  resolutionCase: FetchedCase | null;
  resolutionAuthority: FetchedSource | null;
}

interface EffectiveSource {
  source: FetchedSource;
  value: number;
  unit: string;
  statement: string;
  precedenceLevel: number;
  resolutionNote: string | null;
}

interface Grouped {
  key: string;
  value: number;
  unit: string;
  effectives: EffectiveSource[];
  ruleIds: string[];
}

const clip = (s: string, n = 260): string => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

function toCitation(e: EffectiveSource): SourceCitation {
  const s = e.source;
  if (s._type === 'errataOrAmendment') {
    return {
      _id: s._id,
      docType: s._type,
      docRef: `${s._type}/${s._id}`,
      title: s.title,
      statement: clip(s.amendedStatement),
      value: s.amendedValue,
      unit: e.unit,
      precedenceLevel: s.precedenceLevel,
      version: s.version,
      status: s.status,
      sourceUrl: s.sourceUrl,
      contradictionType: s.contradictionType ?? null,
    };
  }
  return {
    _id: s._id,
    docType: s._type,
    docRef: `${s._type}/${s._id}`,
    title: s.title,
    statement: clip(s.body),
    value: s.normativeValue,
    unit: s.normativeUnit,
    precedenceLevel: s.precedenceLevel,
    version: s.version,
    status: s.status,
  };
}

function effectiveOf(rule: FetchedRule, amendments: FetchedAmendment[]): EffectiveSource {
  const winners = amendments.filter((a) => a.precedenceLevel > rule.precedenceLevel);
  if (winners.length) {
    const maxLevel = Math.max(...winners.map((w) => w.precedenceLevel));
    const top = winners.filter((w) => w.precedenceLevel === maxLevel);
    if (top.length === 1) {
      const a = top[0];
      return {
        source: a,
        value: a.amendedValue,
        unit: rule.normativeUnit,
        statement: a.amendedStatement,
        precedenceLevel: a.precedenceLevel,
        resolutionNote: a.resolutionNote || null,
      };
    }
  }
  return {
    source: rule,
    value: rule.normativeValue,
    unit: rule.normativeUnit,
    statement: rule.body,
    precedenceLevel: rule.precedenceLevel,
    resolutionNote: null,
  };
}

function groupBy(effectives: EffectiveSource[]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const e of effectives) {
    const key = `${e.value}|${e.unit}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        value: e.value,
        unit: e.unit,
        effectives: [],
        ruleIds: [],
      });
    }
    const g = map.get(key)!;
    g.effectives.push(e);
  }
  return [...map.values()];
}

function effectiveValueOfSource(source: FetchedSource): { value: number; unit: string } | null {
  if (source._type === 'errataOrAmendment') return { value: source.amendedValue, unit: 'unknown' };
  return { value: source.normativeValue, unit: source.normativeUnit };
}

export function decide(input: DecideInput): AnswerBody {
  const { question, scenario, candidates, amendments, resolutionCase, resolutionAuthority } = input;

  if (candidates.length === 0) {
    return {
      kind: 'clarification',
      message:
        `Aucun document de la base de connaissances ne couvre « ${question} ». ` +
        `Aucune règle active taguée ${scenario.ruleTags.map((t) => `#${t}`).join(', ')} n'existe. ` +
        `Je ne peux pas répondre sans donnée. Veuillez préciser le module, ou demander un sujet ` +
        `couvert (température, puissance, altitude).`,
      matchedSources: [],
    };
  }

  const byRuleId = new Map<string, FetchedRule>();
  for (const c of candidates) byRuleId.set(c._id, c);

  const effectives: EffectiveSource[] = [];
  const ruleSourcesForCitation: FetchedRule[] = [];
  for (const rule of candidates) {
    const amd = amendments.filter((a) => a.targetRuleRef?._ref === rule._id);
    const eff = effectiveOf(rule, amd);
    effectives.push(eff);
    ruleSourcesForCitation.push(rule);
  }

  const groups = groupBy(effectives);

  if (groups.length === 1) {
    const g = groups[0];
    const amending = g.effectives.filter((e) => e.source._type === 'errataOrAmendment');
    const sources: SourceCitation[] = [];
    for (const rule of ruleSourcesForCitation) {
      sources.push(
        toCitation({
          source: rule,
          value: rule.normativeValue,
          unit: rule.normativeUnit,
          statement: rule.body,
          precedenceLevel: rule.precedenceLevel,
          resolutionNote: null,
        })
      );
    }
    for (const e of g.effectives) {
      if (e.source._type === 'errataOrAmendment') sources.push(toCitation(e));
    }

    // Croisement de cohérence : si un dossier d'arbitrage humain existe pour ce
    // scénario, notre dérivation formelle et lui doivent s'accorder. Sinon la
    // donnée est anormale et l'agent refuse (jamais de verdict sur données fausses).
    if (resolutionCase && resolutionAuthority) {
      const authVal = effectiveValueOfSource(resolutionAuthority);
      const agree =
        authVal !== null &&
        authVal.value === g.value &&
        (authVal.unit === 'unknown' || authVal.unit === g.unit);
      if (!agree) {
        return {
          kind: 'contradiction_unresolved',
          message:
            `Incohérence détectée entre la dérivation formelle et le dossier d'arbitrage ` +
            `${resolutionCase._id} : la dérivation conclut ${g.value} ${g.unit} mais la source ` +
            `d'autorité du dossier donne ${authVal ? `${authVal.value} ${authVal.unit}` : 'inconnue'}. ` +
            `Data anomaly — pas de verdict tant que la base n'est pas corrigée.`,
          sources: effectives.map(toCitation),
        };
      }
      const resolutionNote =
        `Dossier ${resolutionCase._id} (${resolutionCase.decisionDate ?? 'date non renseignée'}, ` +
        `${resolutionCase.decidedBy ?? 'auteur non renseigné'}) : ${clip(resolutionCase.finalVerdict, 320)}.`;
      if (amending.length > 0) {
        const a = amending[0].source as FetchedAmendment;
        return {
          kind: 'verdict',
          value: g.value,
          unit: g.unit,
          verdict:
            `${a.amendedValue} ${g.unit} — l'amendement ${a.id} (${a.contradictionType ?? 'amendement'}) ` +
            `prévaut sur sa règle ciblée : precedenceLevel ${a.precedenceLevel} > ` +
            `${ruleSourcesForCitation.map((r) => r.precedenceLevel).join('/')}. ` +
            `Cohérent avec le dossier d'arbitrage ${resolutionCase._id}.`,
          sources,
          contradictionResolved: true,
          resolutionNote,
          confidence: 'high',
        };
      }
      return {
        kind: 'verdict',
        value: g.value,
        unit: g.unit,
        verdict: `${g.value} ${g.unit} — valeur unique, corroborée par le dossier ${resolutionCase._id}.`,
        sources,
        contradictionResolved: false,
        resolutionNote,
        confidence: 'high',
      };
    }

    if (amending.length > 0) {
      const a = amending[0].source as FetchedAmendment;
      return {
        kind: 'verdict',
        value: g.value,
        unit: g.unit,
        verdict:
          `${a.amendedValue} ${g.unit} — l'amendement ${a.id} (${a.contradictionType ?? 'amendement'}) ` +
          `prévaut sur sa règle ciblée : precedenceLevel ${a.precedenceLevel} > ` +
          `${ruleSourcesForCitation.map((r) => r.precedenceLevel).join('/')}.`,
        sources,
        contradictionResolved: true,
        resolutionNote: amending.find((x) => x.resolutionNote)?.resolutionNote ?? undefined,
        confidence: 'high',
      };
    }
    return {
      kind: 'verdict',
      value: g.value,
      unit: g.unit,
      verdict: `${g.value} ${g.unit} — valeur normative unique et non amendée.`,
      sources,
      contradictionResolved: false,
      confidence: 'high',
    };
  }

  // Plusieurs valeurs différentes : contradiction réelle. L'arbitrage humain
  // (resolutionCase) peut la trancher s'il est COHÉRENT avec notre dérivation.
  if (resolutionCase && resolutionAuthority) {
    const authVal = effectiveValueOfSource(resolutionAuthority);
    const consistent =
      authVal !== null && groups.some((g) => g.value === authVal.value && (authVal.unit === 'unknown' || authVal.unit === g.unit));
    if (consistent) {
      const group = groups.find((g) => g.value === authVal!.value)!;
      const sources: SourceCitation[] = [];
      for (const rule of ruleSourcesForCitation) {
        sources.push(
          toCitation({
            source: rule,
            value: rule.normativeValue,
            unit: rule.normativeUnit,
            statement: rule.body,
            precedenceLevel: rule.precedenceLevel,
            resolutionNote: null,
          })
        );
      }
      for (const e of group.effectives) sources.push(toCitation(e));
      return {
        kind: 'verdict',
        value: group.value,
        unit: group.unit,
        verdict:
          `${group.value} ${group.unit} — arbitré par le dossier humain ${resolutionCase._id} ` +
          `(source d'autorité ${resolutionAuthority._id}).`,
        sources,
        contradictionResolved: true,
        resolutionNote: clip(resolutionCase.finalVerdict, 320),
        confidence: 'high',
      };
    }
  }

  return {
    kind: 'contradiction_unresolved',
    message:
      `${groups.length} valeurs actives différentes se contredisent pour « ${question} » et aucun ` +
      `amendement actif ni dossier d'arbitrage cohérent ne tranche. ` +
      `J'écarte toute extrapolation : une contradiction non arbitrée interdit de deviner. ` +
      `Pour trancher il faut (a) un errataOrAmendment actif ciblant l'une des règles avec ` +
      `precedenceLevel supérieur, ou (b) un resolutionCase posé par un humain.`,
    sources: effectives.map(toCitation),
  };
}

export { effectiveValueOfSource, groupBy, toCitation };