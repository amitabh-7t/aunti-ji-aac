export function parseSuggestions(content: string): string[] {
  const trimContent = content.trim();

  const candidates = [trimContent];
  const firstArray = trimContent.match(/\[[\s\S]*\]/);
  if (firstArray?.[0]) {
    candidates.push(firstArray[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
          .slice(0, 4);
      }
    } catch {
      continue;
    }
  }

  return [];
}
