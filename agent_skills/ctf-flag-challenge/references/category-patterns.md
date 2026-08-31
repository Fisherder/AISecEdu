# Category-aware challenge patterns

- Binary exploitation: teach one decisive memory-corruption concept at a time; control mitigations deliberately; validate offsets and target architecture; include a clean scripted solve and crash-resistant reset.
- Web: expose a small realistic application and a specific trust-boundary failure; use isolated data; test authentication, direct-object access, encoding, alternate verbs, and unintended admin paths.
- Cryptography: make the flaw mathematical or protocol-based rather than brute-force by accident; generate per-instance values; confirm the intended analysis finishes within the difficulty budget.
- Forensics: include a coherent evidence trail with timestamps and provenance; verify tools can parse the artifact; avoid metadata that directly reveals the flag.
- Reversing: keep the target behavior stable across builds; make the reasoning objective explicit; avoid packing or anti-debugging that overwhelms the intended lesson.
- Defense: require a concrete protective change or incident decision, then bind the flag gate to live observable state; do not accept a written claim that a control was applied.
- Mixed progression: vary evidence and tool use across the batch while preserving one clear decisive skill per challenge.

Difficulty should come from the number and subtlety of reasoning steps, noise in evidence, and integration of skills—not missing instructions, unreliable infrastructure, or guessed secrets.
