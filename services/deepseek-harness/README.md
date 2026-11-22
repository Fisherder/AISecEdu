# Classroom director turn

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
