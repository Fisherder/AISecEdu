---
name: process-inquiry-learning
description: Create a complete process inquiry learning project with linked orientation, observation, experiment, transfer challenge and evidence-based feedback using the platform's verified calculation components. Use when the teacher selects 流程探究式学习 or requests this integrated learning pattern.
---

# Process inquiry learning

Read the trusted `platformFacts.learningPatterns` catalog and `selectedLearningPattern` first. A selected pattern is a persisted project contract, not an aesthetic preference. Respect the global and actual course's authoring standards.

The first release supports the `aes128` engine only: real AES-128 single-block computation, 41 observable states, round keys, decryption recovery, a one-bit contrast experiment and an independent final-round operation task. Do not claim other algorithms or coding environments are supported by this mode. Ask for another mode or explain the missing engine if necessary; never replace the requested mechanism with quiz cards or fixed illustrative outputs.

## Create an actual draft

1. Determine the audience, duration and three observable objectives from the teacher's request and readable sources. Do not claim to have read pending or unavailable attachments.
2. Keep the five learning phases distinct from the algorithm's ten rounds. Write concise, concept-specific guidance for each phase. The same sample block and key travel through the observation flow. Students may freely revisit phases.
3. Use the native `module.inquiry` tool with `{moduleIndex?, spec:{engine:"aes128", title, audience, minutes, intro, objectives:[...], phaseInstructions:{orient,observe,experiment,challenge,reflect}}}`. Use real module indices from trusted course context. No bound course means an independent project draft; do not invent course IDs. The platform supplies standard inputs unless the teacher specifies valid 16-byte hexadecimal examples.
4. This tool materializes a fully interactive native project. Do not use `candidate.generate`, `challenge.generate`, downloadable HTML, a slide deck, or a pretend tool in place of it. No three-option generation selection is needed when this pattern is explicitly selected.
5. The draft can be previewed and revised by the teacher. Publication remains an explicit teacher review action. Do not claim that creation also publishes the project or makes it visible to students.

## Learning and assessment contract

- Show state inputs, actual transformations, outputs and causal explanations together. A full AES-128 computation has an initial AddRoundKey, nine full rounds and a final round without MixColumns.
- An experiment changes one plaintext bit while preserving the key. Its differences are calculated, never randomized. One sample is not a security proof.
- The transfer task uses a fresh ninth-round output. Students perform the final-round transformations; the server records and checks both sequence and calculated state. A browser claim of success, animation completion or time spent cannot award completion.
- Learning completion requires the contrast experiment and a verified independent final-round task. Observations are progress only. No report, screenshot upload or manual Flag is required.
- The platform records versioned evidence. Teacher preview is separate from student attempts. A library copy carries the learning definition, not learner progress, publication approval or grades.
- Model boundaries must remain visible: single block, no message padding, block mode or authentication system. This educational engine is not a production secret-management component.

Prefer the teacher's actual instructional framing, but never weaken the verified component's completion rules. If requested learning goals require capabilities absent from the catalog, state that limitation rather than silently omitting the requested work.
