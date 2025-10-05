import { tokenize } from "./tokenize";
import { Template } from "../../types";

export type BuiltIndex = {
  term: Map<string, Set<string>>;
  tag: Map<string, Set<string>>;
  cat: Map<string, Set<string>>;
  meta: Map<string, { name:string; quality:"Green"|"Amber"|"Red"; tags:string[]; category:string; textLen:number; updatedAt:number }>;
};

export function buildIndex(templates: Template[]): BuiltIndex {
  const idx: BuiltIndex = { term:new Map(), tag:new Map(), cat:new Map(), meta:new Map() };
  const add = (m:Map<string,Set<string>>, k:string, sig:string) => {
    const key = k.toLowerCase();
    if (!m.has(key)) m.set(key, new Set());
    m.get(key)!.add(sig);
  };

  for (const t of templates) {
    const sig = t.signature;
    const text = [t.subject,t.action,t.environment,t.style,t.lighting,t.camera].filter(Boolean).join(" ");
    const terms = tokenize(text);
    for (const w of terms) add(idx.term, w, sig);
    for (const tg of (t.tags||[])) add(idx.tag, tg, sig);
    add(idx.cat, (t.category||"uncategorized"), sig);
    idx.meta.set(sig, {
      name: t.name || "",
      quality: t.quality || "Amber",
      tags: t.tags || [],
      category: t.category || "uncategorized",
      textLen: text.length,
      updatedAt: t.updatedAt || 0
    });
  }
  return idx;
}
