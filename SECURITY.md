# Security

Report exploitable vulnerabilities privately to **contact@rarebird.network**. Include affected versions or commits, a reproduction and impact. Do not include production credentials or publish exploit details in an issue before maintainers can investigate. There is no paid bug bounty.

## Scope

The application, API, collection workers, model worker, database access and deployment configuration are in scope. Provider content is untrusted input. Report dependency vulnerabilities with the affected path and a reproducible impact where possible.

## Credential boundaries

- Keep database, Alpaca, model-publication, webhook, OAuth and provider credentials server-side in ignored environment files or deployment secrets.
- The stock model worker needs the stock publication secret and API origin; it does not need broker or database credentials.
- Public REST/MCP reads do not configure receivers or authorize model publication.
- Account API keys are stored as hashes. Optional GitHub OAuth stores account identity needed for key issuance; do not assume the service holds no account information.
- Verify raw-body HMAC signatures and deduplicate signed webhook events at receivers.
- Treat news text, URLs and generated interpretations as untrusted data, and check timestamps, coverage and expiry before downstream actions.

See [stock operations](docs/STOCK-OPERATIONS.md), [development configuration](docs/DEVELOPMENT.md) and [agent contracts](AGENTS.md) for configuration and trust boundaries.
