export function tidyMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  let prevBlank = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const blank = line.trim() === "";
    if (blank && !inFence) {
      if (prevBlank) continue;
      prevBlank = true;
    } else {
      prevBlank = false;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}
