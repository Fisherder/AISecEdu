# Code Playground Widget Generator


{{#if securityKnowledge}}{{securityKnowledge}}{{/if}}
{{#if subjectProfile}}{{snippet:security-code-policy}}{{/if}}

Generate a self-contained HTML code editor with execution and test validation.

## Supported Languages

- Python 3.11 (via the platform's isolated container; PyCryptodome is installed)
- JavaScript (native browser execution)
- TypeScript (via Babel CDN transpilation)

## Widget Config Schema

```json
{
  "type": "code",
  "language": "python",
  "description": "...",
  "starterCode": "def solution(x):\n    # Your code here\n    pass",
  "testCases": [
    { "id": "t1", "input": "solution(5)", "expected": "25", "description": "Square the input" }
  ],
  "hints": ["Think about multiplication", "What is x * x?"],
  "solution": "def solution(x):\n    return x * x"
}
```

## Python Execution Requirements (CRITICAL)

Python MUST run through the platform container API. Do not load Pyodide and do not claim that Python requires manual verification. The platform executes each submission in a one-shot Python 3.11 container with no network, a read-only root filesystem, non-root user, resource limits, and PyCryptodome (`Crypto`).

- Every test case `input` must be an executable Python expression that calls learner code, such as `solution(5)`, `rsa_sign_verify()`, or `parse_header(b"abc")`.
- `expected` must match the returned value (plain string or Python literal).
- Send only `{ language, code, testCases }`; never send or execute the reference solution.
- Disable the run button while awaiting a response, then render every returned test's `passed`, `actual`, `expected`, and `error` fields.
- Same-origin previews call `/api/code/run` directly. Sandboxed classroom iframes use the parent bridge shown below.

```javascript
async function runInPlatformContainer(payload) {
  if (window.location.origin && window.location.origin !== 'null') {
    const response = await fetch('/api/code/run', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || '代码运行失败');
    return data;
  }
  return new Promise((resolve, reject) => {
    const requestId = 'code-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => reject(new Error('代码运行服务响应超时')), 35000);
    function onResult(event) {
      const data = event.data;
      if (!data || data.__openmaicCodeRunner !== true || data.kind !== 'run-result' || data.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', onResult);
      if (!data.response || !data.response.success) reject(new Error(data.response?.error || '代码运行失败'));
      else resolve(data.response);
    }
    window.addEventListener('message', onResult);
    window.parent.postMessage({
      __openmaicCodeRunner: true, kind: 'run-request', requestId, payload
    }, '*');
  });
}
```

## Technical Requirements

- Use CodeMirror or Monaco via CDN for editing
- Syntax highlighting for the language
- Run button with output display
- Test case validation with pass/fail indicators
- Hint button that reveals hints progressively
- Mobile-responsive layout

## Layout Guidelines

- Code editor should be visible and not overlap with output panel
- On mobile, stack editor above output (not side-by-side)
- Ensure editor has minimum height of 200px on mobile
- Test cases should be collapsible on small screens

## CRITICAL: postMessage Listener for Widget Actions (REQUIRED)

The platform drives this widget by posting messages into the iframe
(`SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`).
Your HTML MUST register this listener, or those actions silently do nothing.
For a code playground, `SET_WIDGET_STATE` typically loads code into the editor and
optionally runs it:

```javascript
window.addEventListener('message', function(event) {
  const { type, target, state, content } = event.data;

  switch (type) {
    case 'SET_WIDGET_STATE':
      // e.g. { code: "...", run: true } — set editor contents, optionally run.
      if (state && typeof state.code === 'string') {
        // Guard the identifier itself: `editor?.setValue` still throws
        // ReferenceError when no `editor` variable is declared (e.g. a
        // textarea-only widget). `typeof editor` is safe for that case.
        if (typeof editor !== 'undefined' && typeof editor.setValue === 'function') editor.setValue(state.code);
        else { const ta = document.getElementById('code-input'); if (ta) ta.value = state.code; }
      }
      if (state && state.run && typeof runCode === 'function') runCode();
      break;

    case 'HIGHLIGHT_ELEMENT':
      const highlightEl = document.querySelector(target);
      if (highlightEl) {
        highlightEl.style.outline = '3px solid rgba(139, 92, 246, 0.8)';
        highlightEl.style.outlineOffset = '4px';
        highlightEl.style.animation = 'pulse-highlight 2s infinite';
        setTimeout(() => {
          highlightEl.style.outline = '';
          highlightEl.style.animation = '';
        }, 3000);
      }
      break;

    case 'ANNOTATE_ELEMENT':
      const annotateEl = document.querySelector(target);
      if (annotateEl && content) {
        const rect = annotateEl.getBoundingClientRect();
        const tooltip = document.createElement('div');
        tooltip.className = 'teacher-annotation';
        tooltip.style.cssText = 'position:fixed; top:' + (rect.top - 40) + 'px; left:' + rect.left + 'px; background:rgba(139,92,246,0.95); color:white; padding:8px 12px; border-radius:8px; font-size:14px; z-index:1000; animation:fadeIn 0.3s;';
        tooltip.textContent = content;
        document.body.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 4000);
      }
      break;

    case 'REVEAL_ELEMENT':
      // Reveal a hidden element (e.g. the solution or a hint panel)
      const revealEl = document.querySelector(target);
      if (revealEl) {
        revealEl.style.display = '';
        revealEl.style.opacity = '1';
      }
      break;
  }
});

const style = document.createElement('style');
style.textContent = '@keyframes pulse-highlight { 0%, 100% { outline-color: rgba(139, 92, 246, 0.8); } 50% { outline-color: rgba(139, 92, 246, 0.4); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }';
document.head.appendChild(style);
```

### Element Naming Convention

So highlight/annotate/reveal can target UI, use consistent ids:
- Run button: `id="run-btn"`, output panel: `id="output"`, editor host: `id="code-input"`.
- Solution/hint panels: `id="solution"`, `id="hint-{n}"`.

## Output Format

Return ONLY the HTML document, no markdown fences or explanations.

**CRITICAL: Output EXACTLY ONE HTML document.**
- Do NOT duplicate content
- Do NOT include multiple `<!DOCTYPE html>` tags
- The output must end with exactly one `</html>` tag

## Quality Checklist

- [ ] Code editor is visible and usable on mobile
- [ ] Run button works correctly
- [ ] Output panel doesn't overlap editor
- [ ] Test cases show pass/fail clearly
- [ ] Hints reveal progressively
- [ ] **NO DUPLICATED HTML** - exactly ONE `<!DOCTYPE html>` tag
- [ ] **Python uses `/api/code/run` or the `__openmaicCodeRunner` parent bridge**
- [ ] **Every Python test input is a real callable expression and every required function is covered**
