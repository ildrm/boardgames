# Tablemate

Follow the product and engineering requirements in [the specification](docs/MEGA_PROMPT.md). Match changes to stable IDs in [the QA matrix](docs/QA_SCENARIOS.md) and record observed evidence in the CSV.

- PostgreSQL owns committed boards, versions and results. Renderers can preview but all accepted moves go through the server.
- A private view requires an authorized session and seat. Invitation previews do not redeem links. Keep secrets out of logs and evidence.
- Preserve rules-version compatibility. Game modules implement the pure engine interface. They do not import transport or persistence.
- Use two independent browser contexts for two seats. Replay against independent rules oracles.
