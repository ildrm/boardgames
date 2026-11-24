# Tablemate documentation

Tablemate lets two friends play Tic-Tac-Toe or Four in a Row in a private browser room. A guest opens an invitation and chooses **Join**. Once both players are connected, the host chooses **Start**. The product supports English and Persian, phones and desktops, and keyboard play. The documents are in English.

## Where to start

| If you need to… | Read or update |
|---|---|
| Decide how a room, game, screen or endpoint should behave | [Master specification](MEGA_PROMPT.md). Sections 1–4 cover the player experience, 5–9 cover engineering, and 10–12 define evidence and milestone gates. |
| Hand a specific assignment to a coding agent | [Kickoff prompt](START_HERE.md). State the authorized scope when copying it. |
| Plan or review a test | [QA scenarios](QA_SCENARIOS.md). Find the family, setup, action and observable result by stable ID. |
| Record an actual test run | [QA execution tracker](QA_SCENARIOS.csv). Match by ID and record the build, variants, result and evidence. |
| Find specialist guidance or primary sources | [Skills and references](SKILLS_MANIFEST.md). Eight project workflows can be followed directly from the document. |

## Maintaining the handoff

The master specification owns product policy, game rules, protocol and design requirements. The QA matrix owns scenario definitions. Its CSV mirrors those definitions and owns execution results. When changing a requirement, update the corresponding scenarios and CSV rows together. Keep IDs stable and preserve recorded results with their original build and scope. Link a replacement run when a requirement changes.

For a single-file handoff, concatenate the master specification, QA scenarios and skills manifest in that order. Keep the CSV separate so reviewers can filter and update it. Paths in kickoff instructions are relative to the repository root. Links between these documents are relative to this folder.

## Evidence at this stage

The matrix defines 226 scenarios. The tracker records executed evidence by build and the verification report explains the remaining variants. The capacity model ranges from a 100-socket smoke workload to a 100,000-socket stretch workload. A capacity claim requires a measured run with a named environment and workload.

## Implementation references

- [Release brief](product/prd.md) and [visual direction](design/tabletop.md)
- [System and trust boundaries](architecture/system.md), [HTTP OpenAPI contract](../apps/api/openapi.yaml) and [realtime protocol](architecture/realtime.md)
- [Stack decision](adr/0001-stack.md) and [operations runbook](operations/runbook.md)
- [Actual verification and open gates](qa/verification.md) and [skill-use evidence](qa/skill-use.md)
