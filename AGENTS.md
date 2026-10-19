# Development workflow

- Develop the server application on branch `server`.
- Create a GitHub issue for every feature request before starting implementation. Retrospective issues may describe already implemented initial features.
- Record concrete acceptance criteria. Link commits and relevant checks; check completed criteria and close the issue only after its implementation is pushed and verified. Keep incomplete requests open.
- Update documentation and the changelog with each feature. Keep known limitations explicit.
- Never commit account names, email addresses, actual hostnames/IP addresses, credentials, deployment configuration, health data, logs, or backups. Use reserved example domains and generic placeholders in documentation.
- Use generic commit attribution when personal identity must not appear in repository history.
- Keep health data encryption in the browser. Never send passwords or decryption keys to the backend.
- Preserve Docker data volumes and the untracked `.env` during updates.
