// Sri Lankans refer to Colombo postal zones by neighbourhood name
// ("Wellawatta", "Pettah"), not by the postal label Kapruka's API uses
// ("Colombo 06", "Colombo 11"). This map translates the vernacular name
// to the canonical Kapruka name before the query reaches the SDK.
//
// This is an enhancement layer, not a gate: an input that isn't in the
// map is passed through unchanged so the SDK's own substring match can
// still try it. Never block a query here.
//
// The map is hand-curated, not LLM-generated — a wrong mapping here
// would silently route a delivery to the wrong city, so every entry
// must be verified against the real postal zone before it's added.
const VERNACULAR_CITY_MAP: Record<string, string> = {
  'fort': 'Colombo 01',
  'slave island': 'Colombo 02',
  'kollupitiya': 'Colombo 03',
  'kolpetty': 'Colombo 03',
  'bambalapitiya': 'Colombo 04',
  'bamba': 'Colombo 04',
  'havelock town': 'Colombo 05',
  'kirulapone': 'Colombo 05',
  'kirulapana': 'Colombo 05',
  'wellawatta': 'Colombo 06',
  'wellawatte': 'Colombo 06',
  'cinnamon gardens': 'Colombo 07',
  'borella': 'Colombo 08',
  'dematagoda': 'Colombo 09',
  'maradana': 'Colombo 10',
  'pettah': 'Colombo 11',
  'hulftsdorp': 'Colombo 12',
  'kotahena': 'Colombo 13',
  'grandpass': 'Colombo 14',
  'mutwal': 'Colombo 15',
  'modara': 'Colombo 15',
};

export function resolveCityQuery(userInput: string): string {
  const normalized = userInput.trim().toLowerCase();
  return VERNACULAR_CITY_MAP[normalized] ?? userInput;
}
