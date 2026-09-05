/**
 * Danish stopwords — ignored so "af min" doesn't block results
 */
export const STOPWORDS = new Set([
  'af','min','mit','mine','din','dit','dine','sin','sit','sine',
  'en','et','den','det','de','og','eller','i','på','til','fra',
  'med','er','var','har','jeg','du','han','hun','vi','de','man',
  'at','som','for','ikke','men','om','hvis','når','der','her',
  'vil','kan','skal','må','bør','får','gør','ved','ser',
  'dem','ham','hende','os','jer','sig','hvad','hvor','hvem',
  'noget','nogen','alle','meget','mere','mest','lidt',
]);

/**
 * Danish synonym groups — pushed to Meilisearch server-side too.
 *
 * KEY RULE: "optagelse/optagelser" is NEUTRAL — belongs to neither photo nor
 * video alone. It's in the general drone group so it matches both categories
 * equally and ranking/context decides the winner.
 */
export const SYNONYMS: string[][] = [
  // Photo-specific — does NOT include "optagelse" (neutral word)
  ['foto', 'fotos', 'fotografi', 'fotografier', 'fotografering',
   'billede', 'billeder', 'photo', 'photos', 'shoot'],

  // Video-specific — does NOT include "optagelse" (neutral word)
  ['video', 'videoer', 'videos', 'film', 'filmoptagelse', 'filmoptagelser', 'klip'],

  // Drone / aerial — "optagelse" lives HERE (neutral, applies to both)
  ['drone', 'droner', 'luftfoto', 'luftoptagelse', 'luftoptagelser',
   'dronefoto', 'dronefotos', 'ovenfra', 'luften',
   'optagelse', 'optagelser', 'optager', 'optagelse'],

  // Property types
  ['hus', 'huse', 'husene', 'ejendom', 'ejendomme', 'ejendomsfoto',
   'bolig', 'boliger', 'villa', 'villaer', 'bygning', 'bygninger', 'parcel'],

  ['lejlighed', 'lejligheder', 'apartment', 'apartments', 'ejendom', 'bolig'],
  ['erhverv', 'erhvervsejendom', 'virksomhed', 'kontor', 'industri', 'firma'],
  ['landbrug', 'gård', 'gårde', 'mark', 'marker', 'skov', 'skove', 'natur', 'land'],
  ['strand', 'strande', 'kyst', 'kyster', 'havn', 'havne', 'sø', 'søer', 'vand'],

  // Inspection
  ['inspektion', 'inspektioner', 'tilsyn', 'kontrol', 'gennemgang'],

  // Events
  ['event', 'events', 'begivenhed', 'begivenheder', 'arrangement',
   'fest', 'fester', 'bryllup', 'koncert', 'koncerter'],

  // Construction
  ['konstruktion', 'byggeri', 'byggerier', 'byggegrund', 'projekt', 'projekter'],

  // Lighting
  ['solnedgang', 'solnedgangs', 'golden hour', 'aften', 'aftenfoto'],
  ['solopgang', 'morgengry', 'morgen', 'morgenfoto'],
  ['nat', 'natfoto', 'natoptagelse', 'night', 'mørke'],

  // General
  ['redigering', 'redigeret', 'efterbehandling', 'editing'],
  ['pakke', 'pakker', 'produkt', 'produkter', 'løsning', 'service'],
];

/**
 * Photo-specific signals — used to auto-detect category from query.
 * Does NOT include "optagelse" since that's neutral.
 */
const PHOTO_SIGNALS = new Set([
  'foto', 'fotos', 'fotografi', 'fotografier', 'fotografering',
  'billede', 'billeder', 'photo', 'photos',
  'luftfoto', 'dronefoto', 'dronefotos', 'ejendomsfoto',
]);

/**
 * Video-specific signals.
 */
const VIDEO_SIGNALS = new Set([
  'video', 'videoer', 'videos', 'film', 'filmoptagelse',
  'filmoptagelser', 'klip',
]);

/**
 * Detect category from query. Returns null if ambiguous (e.g. just "optagelser").
 */
export function detectCategory(query: string): 'photo' | 'video' | null {
  const terms = query.toLowerCase().split(/\s+/);
  let photoScore = 0;
  let videoScore = 0;
  for (const t of terms) {
    const stem = t.replace(/e?r?s?$/, '').replace(/e?r$/, ''); // rough danish stem
    if (PHOTO_SIGNALS.has(t) || PHOTO_SIGNALS.has(stem)) photoScore++;
    if (VIDEO_SIGNALS.has(t) || VIDEO_SIGNALS.has(stem)) videoScore++;
  }
  if (photoScore > videoScore) return 'photo';
  if (videoScore > photoScore) return 'video';
  return null; // ambiguous — show both
}

/** Meilisearch synonyms format */
export function buildMeiliSynonyms(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const group of SYNONYMS) {
    for (const word of group) {
      const others = group.filter(w => w !== word);
      result[word] = [...new Set([...(result[word] ?? []), ...others])];
    }
  }
  return result;
}

/** Enrich document text with synonym keywords for Meilisearch indexing */
export function expandWithSynonyms(text: string): string {
  const lower = text.toLowerCase();
  const extra: string[] = [];
  for (const group of SYNONYMS) {
    if (group.some(word => lower.includes(word))) extra.push(...group);
  }
  return extra.length ? `${text} ${[...new Set(extra)].join(' ')}` : text;
}

/**
 * Strip stopwords, return meaningful terms.
 * Never returns empty — falls back to original terms if all stripped.
 */
export function getSearchTerms(query: string): string[] {
  const all = query.trim().toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  const filtered = all.filter(t => !STOPWORDS.has(t));
  return filtered.length > 0 ? filtered : all; // fallback: don't strip everything
}

/** Levenshtein distance */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i-1] === b[j-1] ? dp[j-1] : Math.min(dp[j-1], dp[j], prev) + 1;
      dp[j-1] = prev;
      prev = val;
    }
    dp[b.length] = prev;
  }
  return dp[b.length];
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Fuzzy word match with typo tolerance + prefix */
export function fuzzyMatch(term: string, text: string): boolean {
  const q = norm(term);
  if (q.length < 2) return false;
  const words = norm(text).split(/\s+/);
  const maxDist = q.length >= 8 ? 2 : q.length >= 5 ? 1 : 0;
  return words.some(w => w.startsWith(q) || q.startsWith(w) || levenshtein(q, w) <= maxDist);
}

/** Synonym match: term and text share a synonym group */
export function synonymsMatch(term: string, text: string): boolean {
  const tLower = norm(text);
  const qLower = norm(term);
  if (tLower.includes(qLower)) return true;
  for (const group of SYNONYMS) {
    const normGroup = group.map(norm);
    if (normGroup.some(w => qLower.includes(w) || w.includes(qLower)) &&
        normGroup.some(w => tLower.includes(w))) return true;
  }
  return false;
}

/** Full match: direct OR synonym OR fuzzy typo */
export function termMatches(term: string, text: string): boolean {
  return synonymsMatch(term, text) || fuzzyMatch(term, text);
}

/**
 * Score a product against a query.
 * Higher = better match. Returns 0 if no match at all.
 * Also applies category bonus: if query signals photo/video, matching category scores higher.
 */
export function scoreProduct(query: string, name: string, description: string, category: string): number {
  const terms = getSearchTerms(query);
  if (terms.length === 0) return 0;

  const haystack = `${name} ${description} ${category}`;
  const termHits = terms.filter(t => termMatches(t, haystack)).length;
  if (termHits === 0) return 0;

  let score = termHits * 10;

  // Bonus for name match vs description match
  terms.forEach(t => {
    if (termMatches(t, name)) score += 5;        // name match = more relevant
    if (termMatches(t, description)) score += 2;
  });

  // Category signal bonus — if query says "billeder" and product is photo, boost it
  const detectedCat = detectCategory(query);
  if (detectedCat && category === detectedCat) score += 15;

  return score;
}