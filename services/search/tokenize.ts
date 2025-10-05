const STOP = new Set(["the","a","an","and","or","to","of","in","on","for","with","at","by","from","as","is"]);

export function tokenize(s?: string): string[] {
  if (!s) return [];
  return [...new Set(
    s.toLowerCase()
     .normalize("NFKC")
     .replace(/\s+/g, " ")
     .trim()
     .split(/[^a-z0-9]+/)
     .filter(w => w && !STOP.has(w))
  )];
}
