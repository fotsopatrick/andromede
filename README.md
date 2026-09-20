# AERO-KIT — Rule Verdict Agent through Sanity Context MCP

Submission for the **Sanity Challenge 2026 — Path One: "Ship an agent that queries real content"** (tag `#sanitychallenge`).

A small, deterministic **MCP agent** that answers operational questions about a modular instrument (the "CTRL-7"). It never guesses: when the Knowledge Base contains two active rules that contradict each other, the agent either resolves the conflict **formally** (through structured relations and precedence levels) or **refuses to answer** and says so.

The whole point is that it works **because the content is structured**, not despite it. A board-game errata flavor, applied to hardware constraints: the *errata* overrides the *rulebook*, and only the structured data can prove it.

- **Knowledge Base**: custom Sanity content model — `policyOrRule`, `errataOrAmendment`, `resolutionCase`.
- **Agent**: TypeScript, connects over MCP (Streamable HTTP) to a **Sanity Context** endpoint in **GROQ mode**.
- **Proof**: a deterministic test suite (`npm test`) + a CLI session transcript (`TRANSCRIPT.txt`).

---

## What was built

- `sanity-schema/` — content model (Studio-ready, `defineType`).
- `scripts/seed-data.ts` — canonical documents. `scripts/seed-sanity.ts` seeds the real Content Lake (refuses to run without credentials). `scripts/build-local-store.ts` builds the local fixture.
- `mcp-local/` — a **local clone of the Sanity Context endpoint (GROQ mode)** exposing the exact same tools as the hosted endpoint: `initial_context`, `schema_explorer`, `groq_query`, `array_field_reader` — plus a deterministic GROQ-subset interpreter (`miniGroq.ts`).
- `agent/` — the MCP client (`McpContextGateway` over the official `@modelcontextprotocol/sdk`), the decision engine (`decision.ts`, rules R1–R4 below), and a CLI (`npm run agent`).
- `tests/` — 9 deterministic tests (`node --test`).

### How the agent decides (structured, not heuristic)

| Rule | Situation | Behaviour |
|---|---|---|
| R1 | exactly one active rule matches | verdict = its normative value (with source reference) |
| R2 | an active `errataOrAmendment` targets the rule (`targetRuleRef`) with **strictly higher** `precedenceLevel` | the amendment **primes**; both conflicting claims are surfaced side by side, with sources |
| R3 | several active rules disagree and nothing arbitrates | **refuses** to extrapolate (`contradiction_unresolved`), lists all values + sources |
| R4 | nothing matches the scenario | asks for clarification, never invents data |

A human `resolutionCase` can arbitrate a conflict — but only if our formal derivation and the case **agree**. Otherwise the agent treats the data as anomalous and refuses a verdict.

The demonstrated scenario: the rulebook says **75 °C**, the errata says **60 °C** (security override, precedence 3 > 1), and a human arbitration record confirms **60 °C**. The anti-RAG test proves a plain keyword search cannot tell which claim wins (both docs score a tie) while the structured pipeline resolves it with citations.

## Sanity Project ID

- **Sanity project ID**: `3b1mty75`
- **Dataset**: `production`
- **Organization ID**: `o4gse4k6t` (for the hosted Sanity Context endpoint)
- **Public dataset URL**: <https://3b1mty75.apicdn.sanity.io/v2026-09-20/data/query/production?query=*%5B_type%3D%3D%22policyOrRule%22%5D>

The Content Lake is **seeded** (`npm run seed` from the canonical documents in `scripts/seed-data.ts`, deterministic `_id`s, idempotent) and **verified read-only**: `count(*)` returns the 6 documents, and the `errataOrAmendment` carries its `targetRuleRef` relation to `policyOrRule` (see [Public GROQ](https://3b1mty75.apicdn.sanity.io/v2026-09-20/data/query/production?query=count(*[]))). The tests/transcript run against the faithful local clone of the Context endpoint — the same tools and the same client code path (`Client.connect` → `initialize` → `tools/call` over Streamable HTTP).

### Hosted Sanity Context endpoint

The agent connects to the real hosted endpoint (GROQ mode) at `https://api.sanity.io/v1/context/organizations/o4gse4k6t/mcp/aero-kit` (reference: [Context MCP](https://www.sanity.io/docs/ai/sanity-context-mcp)). Live-probed status:

1. **Endpoint**: created — `name: aero-kit`, single **dataset source** `{"type":"dataset","id":"3b1mty75.production"}` → serves **GROQ mode**.
2. **Auth (verified live)**: the endpoint *requires* an **organization API token holding `sanity.knowledge-base.read`** (Context Viewer or higher), created in the org's **Manage → API → Tokens**. A project-level token is refused with JSON-RPC `-32007` (verified). Pass the org token as `MCP_ENDPOINT_TOKEN`.
3. **Schema registry (deployed)**: `npx sanity schema deploy` (Studio v6.15 ≥ v5.1.0) deployed `schemaId: _.schemas.aero-kit-knowledge-base` for `3b1mty75.production`, and the Studio app was re-deployed as an app ≥ 5.1 (`appId: u0cif6tjk9y1jkj0dwp67j0w`, hosted at https://aero-kit-studio.sanity.studio). Both steps run headless with `SANITY_STUDIO_PROJECT_ID=3b1mty75`, `SANITY_STUDIO_DATASET=production`, `SANITY_AUTH_TOKEN=<token>`.
4. **Verified live**: `initialize` → 200 (`sanity-context` v1.0.0); `tools/list` → the four tools `initial_context`, `groq_query`, `schema_explorer`, `array_field_reader`; `groq_query` serves the real lake (`count(*[])` = 19 including system groups, the 6 KB documents intact, `*[_type == "policyOrRule"]` = 4). The agent run against the hosted endpoint answers the three canonical questions: power → **500 W** (univocal), temperature → **60 °C** (errata precedence 3 > 1, corroborated by the resolution case), altitude → **guard-rail** (2000 m vs 1500 m unresolved, refuses to extrapolate).
5. **GROQ mode quirk**: the hosted server re-serializes queries and drops the quotes around **single-quoted** type literals (`_type == 'policyOrRule'` → `_type == policyOrRule`), which then matches 0 documents. Use **double quotes** — as our canonical queries do (`*[_type == "policyOrRule" ...]`).

```bash
MCP_ENDPOINT_URL="https://api.sanity.io/v1/context/organizations/o4gse4k6t/mcp/aero-kit" \
MCP_ENDPOINT_TOKEN="<org-context-viewer-bearer>" \
npm run agent -- "Quelle est la température maximale configurable du module CTRL-7 ?"
```

## Getting started

Requires **Node.js ≥ 24** (native TypeScript support — no build step).

```bash
npm install
npm run seed:local     # build the local fixture from the canonical seed
npm test               # 9 deterministic tests
npm run transcript     # regenerate TRANSCRIPT.txt (session proof)
```

### CLI

```bash
# Local endpoint (clone of Sanity Context, GROQ mode), in-process:
npm run agent -- "Quelle est la température maximale configurable du module CTRL-7 ?"
npm run agent -- --trace "Jusqu'à quelle altitude maximale puis-je utiliser le module CTRL-7 ?"

# Against the REAL hosted Sanity Context endpoint:
MCP_ENDPOINT_URL="https://api.sanity.io/v1/context/organizations/o4gse4k6t/mcp/aero-kit" \
MCP_ENDPOINT_TOKEN="<org-context-viewer-bearer>" \
npm run agent -- "Quelle est la puissance maximale du module CTRL-7 ?"
```

### Standalone Context endpoint (MCP for any client)

```bash
npm run mcp:local          # http://127.0.0.1:8970/mcp
MCP_PORT=9000 npm run mcp:local
```

Any MCP-compatible client can connect to it (see `mcp/mcp.example.json`).

### Seeding the real Content Lake

Requires a token with write access. Never commit it:

```bash
SANITY_PROJECT_ID=3b1mty75 SANITY_DATASET=production SANITY_TOKEN=sk-xxx npm run seed
```

The documents are seeded with deterministic `_id`s (`createOrReplace`, idempotent) and are **exactly** the ones in `scripts/seed-data.ts`, so the local test bench reproduces the hosted behaviour byte-for-byte.

## How Sanity is used

1. **Content model** — three linked types. `errataOrAmendment.targetRuleRef` points at the rule it corrects; `resolutionCase.authoritativeSourceRef` records the human decision and `conflictingSources` the fight it settled. That *is* the knowledge graph the agent walks.
2. **Sanity Context MCP (GROQ mode)** — the agent uses the hosted endpoint's four tools: `initial_context` to orient, `schema_explorer` to verify fields before writing any query, `groq_query` to fetch candidates, amendments *through the relation* (`targetRuleRef._ref == ...`) and arbitration records, and `array_field_reader` for array fields.
3. **Knowledge Base** — the sources are seeded as structured documents in the Content Lake (`policyOrRule`, `errataOrAmendment`, `resolutionCase`), each entry staying linked to its source (`sourceUrl`), so every claim in an answer carries its reference.

## Tests (the proof)

- `TEST 1 — standard`: univocal question → verdict with a real Sanity `_id` reference (`policyOrRule/rule-ctrl7-power-spec`), and trace proving `initial_context`, `schema_explorer`, `groq_query` were actually called.
- `TEST 2 — contradiction`: rule + errata → formal arbitration (`precedenceLevel 3 > 1`), both sources cited, corroborated by the human `resolutionCase`.
- `TEST 3 — anti-RAG`: the keyword baseline scores **75 °C and 60 °C as a tie** and cannot decide; the structured pipeline answers 60 °C with citations.
- `TEST 4 — guard-rails`: unknown subject → clarification; altitude conflict with no arbitration (2000 m vs 1500 m) → refused verdict; ambiguous question → clarification.
- `TEST 5 — infra`: GROQ interpreter correctness (including rejecting unsupported syntax), schema mirror == Studio schema, seed documents valid against the declared schema.

```bash
npm test
# tests 9 · pass 9 · fail 0
```

## Layout

```
sanity-schema/schemaTypes/   Sanity content model (policyOrRule, errataOrAmendment, resolutionCase)
scripts/                     seed-data (canonical), seed-sanity (Content Lake), build-local-store, run-transcript
mcp-local/                   Sanity Context (GROQ mode) clone: miniGroq, schema registry, local store, HTTP server
agent/src/                   MCP gateway, NLU router, decision engine (R1–R4), CLI
tests/                       deterministic suite (9 tests)
SUBMISSION.md                Path One submission template (draft)
TRANSCRIPT.txt               CLI session transcript (proof)
```

## Demo

The hosted Context endpoint is **live** and verified (see the endpoint section above). The walkable proof stays the transcript, regenerated against the faithful local clone so it is byte-deterministic:

```bash
npm run transcript && cat TRANSCRIPT.txt
```

---

*This submission only works because the content is structured. If a keyword search would have answered it, it wouldn't be here.*