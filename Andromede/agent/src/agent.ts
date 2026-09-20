import type { ContextGateway, GroqReply } from './contextClient.ts';
import type { Answer, ToolTrace } from './model.ts';
import { routeQuestion } from './nlu.ts';
import { SCENARIOS, candidatesQuery, amendmentsForQuery, resolutionCaseQuery, documentByIdQuery, type Scenario } from './scenarios.ts';
import { decide, type FetchedAmendment, type FetchedCase, type FetchedRule, type FetchedSource } from './decision.ts';

/**
 * AGENT DE VÉRIFICATION DE RÈGLES — "AERO-KIT".
 *
 * Orchestration :
 *   1. initial_context  → l'agent s'oriente (mode GROQ, schéma, précédence).
 *   2. routeur          → question → scénario typé (jamais de lecture plein-texte).
 *   3. schema_explorer  → il vérifie le schéma AVANT d'écrire la moindre requête.
 *   4. groq_query       → candidates (règles actives taguées), amendements par
 *                         relation, dossier d'arbitrage si le scénario en a un.
 *   5. decide()         → règles R1-R4 (arbitrage structuré, garde-fous).
 *
 * Chaque appel d'outil MCP est enregistré dans `trace` : c'est ce qui alimente
 * le transcript de session exporté et les tests (preuve formelle).
 */

export class RuleVerdictAgent {
  private readonly gateway: ContextGateway;
  private readonly traces: ToolTrace[] = [];
  private initialCtx: string | null = null;
  private readonly schemaCache = new Map<string, Record<string, unknown>>();
  readonly scenarioCatalog: Scenario[];

  constructor(gateway: ContextGateway, scenarioCatalog: Scenario[] = SCENARIOS) {
    this.gateway = gateway;
    this.scenarioCatalog = scenarioCatalog;
  }

  get trace(): readonly ToolTrace[] {
    return this.traces;
  }

  async sessionSummary(): Promise<string> {
    await this.initialContext();
    return this.initialCtx!;
  }

  private async initialContext(): Promise<void> {
    if (this.initialCtx) return;
    this.initialCtx = await this.gateway.initialContext();
    this.traces.push({
      tool: 'initial_context',
      args: {},
      summary: `mode GROQ, schéma : ${[...new Set(this.scenarioCatalog.map((s) => s.ruleType))].join(', ')}`, 
    });
  }

  private async schemaOf(type: string): Promise<Record<string, unknown>> {
    if (!this.schemaCache.has(type)) {
      this.schemaCache.set(type, await this.gateway.schemaExplorer(type));
      this.traces.push({
        tool: 'schema_explorer',
        args: { type },
        summary: `champs de ${type} vérifiés avant requête`,
      });
    }
    return this.schemaCache.get(type)!;
  }

  private async runGroq(query: string, summary: string): Promise<GroqReply> {
    const reply = await this.gateway.groq(query);
    this.traces.push({
      tool: 'groq_query',
      args: { query },
      summary: `${summary} (${reply.meta.resultCount} document(s))`,
    });
    return reply;
  }

  private async fetchAmendments(ruleId: string, today: string): Promise<FetchedAmendment[]> {
    const projection = ['_id', '_type', 'id', 'title', 'version', 'status', 'effectiveDate', 'targetRuleRef', 'contradictionType', 'amendedStatement', 'amendedValue', 'precedenceLevel', 'resolutionNote', 'sourceUrl'];
    const reply = await this.runGroq(
      amendmentsForQuery(ruleId, projection, today),
      `amendements cibles de ${ruleId} (targetRuleRef)`
    );
    return (reply.result as FetchedAmendment[]) ?? [];
  }

  async ask(question: string): Promise<Answer> {
    await this.initialContext();

    // Aujourd'hui (ISO AAAA-MM-JJ) : aucune règle ni amendement à entrée en
    // vigueur FUTURE ne doit déjà régir ("grandeur de précédence réelle").
    const today = new Date().toISOString().slice(0, 10);

    const route = routeQuestion(question);
    if (route.status === 'no-scenario') {
      return {
        kind: 'clarification',
        message:
          `« ${question} » ne correspond à aucun scénario couvert par la base de connaissances ` +
          `(température, puissance, altitude sur le module CTRL-7). Je ne peux pas répondre : ` +
          `aucune donnée ne porte sur ce sujet. Précisez la question ou le paramètre à vérifier.`,
        matchedSources: [],
        trace: [...this.traces],
      };
    }
    if (route.status === 'ambiguous') {
      return {
        kind: 'clarification',
        message:
          `« ${question} » correspond à ${route.matches.length} scénarios à la fois ` +
          `(${route.matches.map((m) => `« ${m.label} »`).join(', ')}) : la question est ambiguë. ` +
          `Posez une question qui cible UN paramètre à la fois.`,
        matchedSources: [],
        trace: [...this.traces],
      };
    }

    const scenario = route.scenario!;
    await this.schemaOf(scenario.ruleType);

    const candidatesProj = ['_id', '_type', 'id', 'title', 'version', 'status', 'effectiveDate', 'body', 'tags', 'scope', 'normativeValue', 'normativeUnit', 'precedenceLevel'];
    const candReply = await this.runGroq(
      candidatesQuery(scenario, candidatesProj, today),
      `règles actives taguées ${scenario.ruleTags.map((t) => `#${t}`).join(', ')}`
    );
    const candidates = ((candReply.result as FetchedRule[]) ?? []).filter((r) => r._type === 'policyOrRule');

    const allAmendments: FetchedAmendment[] = [];
    for (const c of candidates) {
      const amds = await this.fetchAmendments(c._id, today);
      allAmendments.push(...amds);
    }

    let resolutionCase: FetchedCase | null = null;
    if (scenario.resolutionKeywords.length > 0) {
      const caseProj = ['_id', '_type', 'id', 'title', 'queryScenario', 'authoritativeSourceRef', 'conflictingSources', 'finalVerdict', 'decidedBy', 'decisionDate'];
      const caseReply = await this.runGroq(
        resolutionCaseQuery(scenario.resolutionKeywords, caseProj),
        `dossier d'arbitrage du scénario (${scenario.resolutionKeywords.join(', ')})`
      );
      if (caseReply.result && typeof caseReply.result === 'object' && '_id' in (caseReply.result as object)) {
        resolutionCase = caseReply.result as FetchedCase;
      }
    }

    let resolutionAuthority: FetchedSource | 'missing' | null = null;
    if (resolutionCase?.authoritativeSourceRef?._ref) {
      const authReply = await this.runGroq(
        documentByIdQuery(resolutionCase.authoritativeSourceRef._ref, ['_id', '_type', 'id', 'title', 'version', 'status', 'body', 'normativeValue', 'normativeUnit', 'precedenceLevel', 'amendedStatement', 'amendedValue', 'resolutionNote', 'sourceUrl']),
        `source d'autorité ${resolutionCase.authoritativeSourceRef._ref} du dossier`
      );
      if (authReply.result && typeof authReply.result === 'object') {
        resolutionAuthority = authReply.result as FetchedSource;
      } else {
        // Référence d'autorité CASSEÉ : un dossier existe mais son verdict
        // s'appuie sur un document absent → anomalie, gérée par decide() (R5).
        resolutionAuthority = 'missing';
      }
    }

    const withoutTrace = decide({
      question,
      scenario,
      candidates,
      amendments: allAmendments,
      resolutionCase,
      resolutionAuthority,
    });

    return { ...withoutTrace, trace: [...this.traces] };
  }
}