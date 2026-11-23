# Classroom dialogue

Send an authenticated JSON POST to `/v1/classroom-dialogue` with positional `roles` and `history` as defined below, a nonblank `topic` of up to 240 Unicode code points, and nonblank public `slideText` of up to 6,000 code points. The complete request body is limited to 80 KiB.

The service runs the whole dialogue in one stock AgentLoop turn. A successful HTTP response streams newline-terminated records as `application/x-ndjson`. Each validated native speech has a one-based speaker and 1–1,500 Unicode code points of nonblank text. A `done` record carries `next: "user"` or `next: "end"`. Six role speeches automatically hand control to the user.

```ndjson
{"type":"speech","speaker":3,"text":"Rain falls when water drops in clouds grow heavy enough.","model":"configured-model","usage":{"prompt_tokens":165,"completion_tokens":43,"total_tokens":208}}
{"type":"done","next":"user","model":"configured-model","usage":{"prompt_tokens":398,"completion_tokens":56,"total_tokens":454}}
```

Each speech carries cumulative measured usage. On a provider failure or timeout the stream ends with a `{"type":"error"}` record, which also carries `model` and `usage` when measured counts are available. Use the latest receipt as the total for the dialogue. The service cancels processing when the client disconnects, after 45 seconds without a validated speech, or after 150 seconds overall. Request validation and service capacity errors use ordinary JSON status responses.

## Classroom director turn

Send an authenticated JSON POST to `/v1/classroom-director-turn` with the Harness service bearer token. The caller authorizes classroom access and sends only positional roles and the bounded conversation needed to choose the next speaker.

```json
{
  "roles": ["teacher", "assistant", "student"],
  "history": [{"speaker": 1, "text": "What causes rain?"}],
  "turns": 1,
  "topic": "The water cycle"
}
```

Use 1–16 roles, up to 24 history entries, and a turn count from 0–10,000. History speakers are one-based role slots or `"user"`. Each history text contains 1–1,000 Unicode code points and the optional topic contains 1–240. Both text fields require nonblank content. The complete JSON body is limited to 48 KiB, including encoding overhead.

A successful response returns the chosen one-based role slot, `"user"` to hand the conversation back, or `"end"` to finish. The usage contains measured provider token counts.

```json
{
  "decision": {"speaker": 3},
  "model": "configured-model",
  "usage": {"prompt_tokens": 165, "completion_tokens": 19, "total_tokens": 184}
}
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON or classroom data |
| 401 | Missing or invalid service token |
| 413 | Request body exceeds 48 KiB |
| 415 | Request is not JSON |
| 502 | The model turn failed or returned no measured valid choice |
| 503 | Harness service is busy |
| 504 | The turn timed out |

A 502 or 504 response may include `model` and the measured `usage` available when the turn stopped.

### Native teaching courseware

The internal authenticated POST route /v1/courseware-turn admits one bounded request
for either plan or author. Each request-scoped AgentLoop registers only one
native tool, propose_courseware or compose_courseware. The plugin validates
tool arguments and returns structured teaching data plus a measured model
receipt. AISecEdu owns confirmation, artifact persistence, live preview, and
revision history. The plugin never receives platform credentials and has no
execution, workspace, file, or networking tools.
