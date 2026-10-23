export interface FocusedHtmlPatch { search: string; replace: string }

export function htmlRuntimeErrorContext(html: string, error: {message: string; stack?: string}): string {
  const location = /:(\d+):(\d+)\)?/.exec(error.stack ?? '');
  if (!location) throw Error('The browser did not provide a source location for focused HTML repair');
  const lines = html.split('\n');
  const lineNumber = Number(location[1]);
  if (lineNumber < 1 || lineNumber > lines.length) throw Error('Browser source location is outside the HTML');
  const nearby = lines.slice(Math.max(0, lineNumber - 26), Math.min(lines.length, lineNumber + 14)).join('\n');
  const bindings = lines.filter(line => /getElementById\(|querySelector\(|\bfunction\s+\w+\s*\(/.test(line)).slice(0, 80).join('\n');
  const elements = lines.filter(line => /\bid=["'][^"']+["']/.test(line)).slice(0, 80).join('\n');
  return `Error: ${error.message}\nHTML line: ${lineNumber}\nSource near failure:\n${nearby}\n\nRelevant DOM lookups and function names:\n${bindings}\n\nHTML elements with IDs:\n${elements}`;
}

/** Give a model nearby code, not an entire 30 KB page, for a browser ReferenceError. */
export function htmlReferenceErrorContext(html: string, message: string): {
  identifier: string; snippet: string;
} {
  const match = /^([A-Za-z_$][\w$]*) is not defined$/.exec(message.trim());
  if (!match) throw Error('Only a named undefined-variable browser error can use focused HTML repair');
  const identifier = match[1];
  const lines = html.split('\n');
  const firstLine = lines.findIndex(line => line.includes(identifier));
  if (firstLine < 0) throw Error('The browser error identifier is absent from HTML');
  return {
    identifier,
    snippet: lines.slice(Math.max(0, firstLine - 30), Math.min(lines.length, firstLine + 14)).join('\n'),
  };
}

/** Reject patches that are broad, ambiguous, or still reference the broken name. */
export function applyFocusedHtmlReferencePatch(
  html: string,
  identifier: string,
  patch: FocusedHtmlPatch,
): string {
  if (!/^[A-Za-z_$][\w$]*$/.test(identifier) ||
      typeof patch?.search !== 'string' || typeof patch?.replace !== 'string' ||
      !patch.search || patch.search.length > 500 || patch.replace.length > 500 ||
      !patch.search.includes(identifier) || patch.search === patch.replace ||
      html.split(patch.search).length !== 2)
    throw Error('The model did not return a unique, small, effective source patch');
  if (new RegExp(`\\b${identifier}\\b`).test(patch.replace) &&
      !new RegExp(`\\b(?:const|let|var|function|class)\\s+${identifier}\\b`).test(patch.replace))
    throw Error('The proposed patch still references the undefined identifier');
  return html.replace(patch.search, patch.replace);
}

export function applyFocusedHtmlRuntimePatch(
  html: string,
  message: string,
  patch: FocusedHtmlPatch,
): string {
  const reference = /^([A-Za-z_$][\w$]*) is not defined$/.exec(message.trim());
  if (reference) return applyFocusedHtmlReferencePatch(html, reference[1], patch);
  if (typeof patch?.search !== 'string' || typeof patch?.replace !== 'string' ||
      !patch.search || patch.search.length > 500 || patch.replace.length > 500 ||
      patch.search === patch.replace || html.split(patch.search).length !== 2)
    throw Error('The model did not return a unique, small, effective source patch');
  return html.replace(patch.search, patch.replace);
}
