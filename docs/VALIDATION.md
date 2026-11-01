# Release validation

The implementation was checked against both repository project guides.

| Check | Result |
| --- | --- |
| Backend pytest suite | 23 passed |
| React production build | Passed |
| Browser experiment lifecycle | Passed |
| Desktop and mobile overflow | Passed |
| Production static assets + API health | Passed |
| Paid provider request | Not executed; provider success/failure paths tested with mocked HTTP |
| GitHub upload | Published to the project branch |

The browser lifecycle covers creating a prompt, generating offline runs, editing the prompt, checking immutable snapshots in comparison, saving ratings, creating/using/deleting a template, and verifying saved data survives a page reload. The screenshot in the README was captured from the running application.

Backend coverage includes empty/oversized input rejection, technique presets, template CRUD, prompt/run deletion, orphaned prompt history retention, ratings, searching, secret redaction, model allowlisting, upstream success, credentials, rate limits, timeouts, connectivity failures and malformed response handling.

Chromium headless was used for browser checks. A local executable override is supported through `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for environments with preinstalled browsers. Standard installations can use `npx playwright install chromium` with no override.

The provider integration is configurable and implemented; live output quality and provider-specific model compatibility still require a user's supported model and server API key. The offline simulator is explicitly labelled throughout the UI and saved runs.
