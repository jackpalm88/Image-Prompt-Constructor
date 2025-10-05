import { BuiltIndex } from "./index";
import { tokenize } from "./tokenize";

const clamp = (x:number,min=0,max=1)=>Math.max(min,Math.min(max,x));

export type SearchParams = { q?:string; tags?:string[]; category?:string; minQuality?: "Green"|"Amber"; limit?:number };
export type SearchResultItem = { signature:string; name:string; score:number; quality:"Green"|"Amber"|"Red"; tags:string[]; category:string };

export function searchTemplates(idx: BuiltIndex, p: SearchParams): { results: SearchResultItem[] } {
  const qTerms = tokenize(p.q);
  const tagSet = new Set((p.tags||[]).map(t=>t.toLowerCase()));
  const category = (p.category||"").toLowerCase();
  const minQ = p.minQuality;

  // Get candidate signatures
  let candidates = new Set<string>();
  
  if (qTerms.length) {
    // AND logic for text query
    const termHits = qTerms.map(w => idx.term.get(w)).filter(Boolean) as Set<string>[];
    if (termHits.length > 0) {
        for (const s of termHits[0]) {
            if (termHits.every(set => set.has(s))) {
                candidates.add(s);
            }
        }
    }
  } else {
    // If no text query, start with all templates
    for (const s of idx.meta.keys()) {
        candidates.add(s);
    }
  }
  
  // Apply tag and category filters (as AND)
  const filterBySet = (items: Set<string>, map: Map<string, Set<string>>, key: string) => {
    const hits = map.get(key);
    if (hits) {
      return new Set([...items].filter(sig => hits.has(sig)));
    }
    return new Set<string>();
  };

  if (tagSet.size) {
    let tagCandidates = new Set<string>(candidates);
    for (const tg of tagSet) {
      tagCandidates = filterBySet(tagCandidates, idx.tag, tg);
    }
    candidates = tagCandidates;
  }

  if (category) {
    candidates = filterBySet(candidates, idx.cat, category);
  }


  const results: SearchResultItem[] = [];
  for (const sig of candidates) {
    const m = idx.meta.get(sig);
    if (!m) continue;
    if (minQ==="Green" && m.quality!=="Green") continue;
    if (minQ==="Amber" && m.quality==="Red") continue;

    // Scoring
    const textMatch = qTerms.length
      ? qTerms.filter(w => idx.term.get(w)?.has(sig)).length / qTerms.length
      : 0.5; // Neutral base if no text query but other filters are active

    const tagMatchScore = tagSet.size
      ? Math.min(0.3, [...tagSet].filter(t => idx.tag.get(t)?.has(sig)).length * 0.1)
      : 0;

    const catBoost = category && m.category.toLowerCase()===category ? 0.1 : 0;
    const qBoost = m.quality==="Green" ? 0.1 : (m.quality==="Amber" ? 0.05 : 0);
    const lengthAdj = m.textLen > 0 ? (m.textLen < 160 ? 0.05 : 0) : 0;

    const score = clamp(textMatch*0.6 + tagMatchScore*0.2 + catBoost*0.1 + qBoost*0.1 + lengthAdj, 0, 1);
    
    if (score >= 0.15) {
      results.push({ signature: sig, name: m.name, score, quality: m.quality, tags: m.tags, category: m.category });
    }
  }
  
  results.sort((a,b)=> b.score===a.score ? (idx.meta.get(b.signature)!.updatedAt - idx.meta.get(a.signature)!.updatedAt) : (b.score - a.score));
  
  return { results: results.slice(0, p.limit ?? 50) };
}
