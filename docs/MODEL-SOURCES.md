# Model catalogue source notes

Checked against Google's public documentation on 2026-10-31.

- `gemini-3.8-flash`: listed as a stable Gemini API model. Google's pricing table says its Standard Free Tier input and output are free of charge. The thinking guide lists `low`, `medium`, and `high`.
- `gemini-3.6-flash`: listed as a stable Gemini API model. Google's pricing table says its Standard Free Tier input and output are free of charge. The thinking guide lists `minimal`, `low`, `medium`, and `high`.
- `gemini-3.5-flash-lite`: listed as a stable Gemini API model. Google's pricing table says its Standard Free Tier input and output are free of charge. The thinking guide lists `minimal`, `low`, `medium`, and `high`.
- `gemini-3.1-flash-lite`: listed as a stable Gemini API model. Google's pricing table says its Standard Free Tier input and output are free of charge. The current thinking-level table does not list this model, so the app does not offer a thinking selector for it.

Official source pages:

1. https://ai.google.dev/gemini-api/docs/models
2. https://ai.google.dev/gemini-api/docs/pricing
3. https://ai.google.dev/gemini-api/docs/thinking
4. https://ai.google.dev/api/models

Do not add a model just because the API returns it. Add it to the backend allowlist only after its API text-generation capability, Standard Free Tier pricing, and thinking-level support have been separately verified from current Google documentation.
