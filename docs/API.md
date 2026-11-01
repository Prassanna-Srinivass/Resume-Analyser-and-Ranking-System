# API reference

FastAPI also generates interactive OpenAPI documentation at `/docs`. All data endpoints use JSON. A successful delete returns `204` without a body. Missing records return `404`; request validation failures return `422`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Process health |
| GET | `/api/config` | Available models and technique descriptions, never API keys |
| GET | `/api/dashboard` | Prompt, run, template and rated-run counts |
| POST / GET | `/api/prompts` | Create / list prompts; list accepts `q` |
| GET / PUT / DELETE | `/api/prompts/{id}` | Read / replace / delete a prompt |
| POST | `/api/prompts/{id}/run` | Generate and save an immutable experiment snapshot |
| GET | `/api/runs` | List newest first; accepts `q` and `technique` |
| GET / DELETE | `/api/runs/{id}` | Read / delete a run |
| POST | `/api/runs/{id}/rating` | Save or replace all three ratings and feedback |
| GET / POST | `/api/templates` | List / create templates; list accepts `q` |
| PUT / DELETE | `/api/templates/{id}` | Replace / delete a template |

## Prompt

```json
{"title":"Explain ML","prompt_text":"Explain machine learning with an analogy.","technique":"zero-shot","category":"Learning"}
```

Titles: 1–120 characters; prompts: 1–20,000; category: 1–80. Whitespace-only required strings are rejected. Techniques: `zero-shot`, `few-shot`, `role-based`, `structured-output`, `step-by-step`.

## Run

```json
{"model_name":"demo-local","input_text":"Audience: a first-year student"}
```

Input is optional and limited to 20,000 characters. Model selection is restricted to the server-configured allowlist. The backend adds the selected technique instruction and combines task + context. Runs keep prompt title, text, category, technique, model, input, actual rendered prompt, response, timestamp, elapsed milliseconds and demo flag. Prompt edits never rewrite old runs. Deleting a prompt sets its runs' `prompt_id` to null, retaining the snapshot.

## Rating

```json
{"relevance_rating":4,"clarity_rating":5,"completeness_rating":3,"feedback_note":"Add one worked example."}
```

All three ratings are integers in 1–5; note is optional, max 4,000 characters. There is no automatic objective score or winner.

## Template

```json
{"title":"Helpful editor","template_text":"Rewrite the context for clarity.","technique":"role-based","category":"Writing"}
```

`template_text` has the same length limit as prompt text. Templates remain independent from prompts made using them.

## Provider failures

| Status | Meaning |
| --- | --- |
| 422 | Unknown model or invalid application request |
| 429 | Provider quota / rate limit |
| 502 | Provider credentials, networking, upstream failure or malformed response |
| 504 | Provider timeout |

Upstream response bodies and credentials are not passed through to users. Failed generation is not saved as a successful run. A prompt saved before generation remains available even if generation fails.

## Architecture and scope

React → REST API → validation and technique renderer → configured provider → SQLite run snapshot → React response and evaluation.

SQLite uses foreign keys, parameterized values, short-lived connections, transactional writes and a busy timeout. User input is displayed as text, never injected as HTML. The API key and trusted provider URL are backend environment settings. This is a local single-user application with no authentication; use authenticated access in front of any shared deployment.
