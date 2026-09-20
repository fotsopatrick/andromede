---
title: AERO-KIT — an MCP rule-verdict agent that refuses to hallucinate
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path One: Ship an Agent That Queries Real Content](https://dev.to/challenges/sanity-2026-09-16)*

## What I Built

**AERO-KIT** is a small, deterministic MCP agent that answers operational questions about a modular instrument (the "CTRL-7") — from a Sanity Knowledge Base structured as `policyOrRule`, `errataOrAmendment` and `resolutionCase`. Its job is exactly the kind a rulebook-vs-errata board-game companion faces: when two active rules contradict each other, the agent either resolves the conflict **formally** or **refuses to answer and says why**.

The rulebook says the CTRL-7 may be configured up to **75 °C**. The errata says **60 °C** (security override). A human arbitration record confirms 60 °C. A keyword search scores both claims as a tie and cannot decide. The agent answers 60 °C with both sources cited, the precedence relation shown (`precedenceLevel 3 > 1`), and the arbitration record corroborating it. And when the Knowledge Base holds *two* active altitude rules (2000 m vs 1500 m) with nothing to arbitrate, the agent refuses to extrapolate.

## Demo

The walkable proof is the CLI session:

```bash
npm run transcript && cat TRANSCRIPT.txt
```

`TRANSCRIPT.txt` contains four resolutions (univocal, contradicted, unresolved-contradiction, out-of-KB) with the full MCP tool trace (`initial_context`, `schema_explorer`, `groq_query`) of each, replayed against a faithful local clone of the Context endpoint so it is byte-deterministic.

The **hosted** Context endpoint is live too: `initialize` → 200, `tools/list` → `initial_context`, `groq_query`, `schema_explorer`, `array_field_reader`, and the agent answers the three canonical questions against it (500 W univocal / 60 °C errata-override / altitude guard-rail refusing to extrapolate).

## Code

Repository: (provide URL after push) · `tags: devchallenge, sanitychallenge, sanity, ai`

```bash
npm install
npm test   # tests 9 · pass 9 · fail 0
```

## How I Used Sanity

The agent connects over MCP (Streamable HTTP) to the **Sanity Context** endpoint in **GROQ mode** and uses its four tools: `initial_context` to orient, `schema_explorer` to verify the schema before writing any query, `groq_query` to fetch candidate rules, amendments **through the relation** (`targetRuleRef._ref == ...`), and human arbitration records; `array_field_reader` for array fields.

The Knowledge Base is custom Sanity content seeded into the Content Lake: rules carry `normativeValue`/`normativeUnit`/`precedenceLevel`; errata carry `amendedValue`, a `targetRuleRef` relation to the rule they correct, and a higher `precedenceLevel`; a resolution case records `authoritativeSourceRef` and `conflictingSources`. Everything stays linked to its source (`sourceUrl`), so every claim in an answer carries a reference.

Without the structure — without the `targetRuleRef` relation and the precedence ordering — the answer is undecidable. That's what Test 3 proves.

## Sanity Project Details

- **Sanity project ID**: `3b1mty75`
- **Dataset**: `production`
- **Public dataset URL**: <https://3b1mty75.apicdn.sanity.io/v2026-09-20/data/query/production?query=*%5B_type%3D%3D%22policyOrRule%22%5D> (verified reachable — see also the GROQ endpoint pattern in `README.md`)

The Knowledge Base is **seeded and live**: `npm run seed` inserted the 6 documents from `scripts/seed-data.ts` into `3b1mty75.production` with deterministic `_id`s (idempotent), and a read-only GROQ check confirms `count(*) == 6` with the `errataOrAmendment → policyOrRule` relation intact (`targetRuleRef._ref == "rule-ctrl7-temp-spec"`). The hosted **Context MCP endpoint is live** (`https://api.sanity.io/v1/context/organizations/o4gse4k6t/mcp/aero-kit`, GROQ mode, dataset source `3b1mty75.production`, schema registry deployed, Studio app ≥ 5.1): it requires an **organization API token with `sanity.knowledge-base.read`** (Context Viewer) — verified live (a project token is refused with `-32007`); `initialize` returns 200 and `tools/list` serves the four tools. The server re-serializes single-quoted type literals to bare identifiers (matching 0 documents), so GROQ queries use double quotes. Every test and the CLI transcript run against a faithful local clone of the Context endpoint (same four tools, same client code path) so they are deterministic; the agent connects to the hosted endpoint through `MCP_ENDPOINT_URL` / `MCP_ENDPOINT_TOKEN` and was verified against it for the three canonical scenarios.

## Agent Session

(Optional) Transcript of the agent session — slice and embed at https://dev.to/agent_sessions/new. The generated `TRANSCRIPT.txt` in the repo is the CLI transcript of the agent's own decision-making.