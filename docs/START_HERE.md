# Tablemate handoff

Choose the scope in the first line of the prompt before passing it to an agent. For a documentation assignment, the first line is sufficient to set the boundary. For an implementation assignment, name the authorized milestones, such as M0–M1 for product discovery and design.

## Copy from here

**Assignment scope:** [Documentation review within `docs/`, or the implementation milestones explicitly requested by the project owner.]

Read [the master specification](MEGA_PROMPT.md) in full. Use [the QA scenarios](QA_SCENARIOS.md) to locate acceptance criteria and [the CSV tracker](QA_SCENARIOS.csv) for execution results. The [skills manifest](SKILLS_MANIFEST.md) gives project workflows and optional upstream references. From the repository root, these files are under `docs/`. Also read the repository's applicable instructions and preserve existing work.

For **documentation review**, improve the named documents, reconcile policy and QA expectations, check references and preserve existing execution evidence. Finish with the changes, checks performed and product decisions requiring review. This scope ends with the documents.

For **implementation**, work through the authorized milestones in order. Start with the private invitation journey for both players. The guest explicitly joins, the host starts once both are present, the server confirms each move, and a rematch needs both consents and another host Start. Use the two specified games, their replay fixtures and the English/Persian design requirements. Record assumptions, design references, commands, build identifiers, test variants and outstanding failures at the relevant gate. Keep public deployment, paid infrastructure and large load runs subject to the owner's explicit authorization.

If the scope placeholder is left blank, use the request that accompanies this prompt. If it contains no assignment, return the reading guide and request a scope before starting implementation.
