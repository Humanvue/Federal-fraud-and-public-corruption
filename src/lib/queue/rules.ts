/**
 * Rules that flag a press release title as a possible public-corruption case (SPEC.md §2, §7.1).
 * DOJ topic tags are not reliable (a federal bribery sentencing may be tagged "Financial Fraud"),
 * so titles are screened by keyword. The rules deliberately over-include: a false alarm costs the
 * weekly session a few seconds, a missed case costs completeness. The owner may edit these lists.
 */
export interface RuleHit { tags: string[]; excluded: string[] }

const R = (s: string) => new RegExp(s, "i");

/** Conduct that is the core of the v1 scope. */
const CONDUCT: [string, RegExp][] = [
  ["bribery", R("\\bbrib(e|es|ed|ing|ery)\\b")],
  ["kickback", R("\\bkick-?backs?\\b")],
  ["gratuity", R("\\bgratuit(y|ies)\\b")],
  ["honest_services", R("honest[- ]services")],
  ["extortion_color_of_law", R("color of (official )?(right|law)")],
  ["conflict_of_interest", R("conflict[- ]of[- ]interest|financial interest")],
  ["hatch_act", R("hatch act")],
  ["embezzlement", R("\\bembezzl\\w*|theft of (government|public|federal) (funds|property|money)|stealing (government|federal|public)")],
  ["false_statements", R("false statements?|lying to (federal|the fbi|investigators|congress)|obstruct\\w*")],
  ["procurement", R("contract(ing)? officer|government contracts?|procurement|bid[- ]rigging|steer\\w* (a |federal |government )?contracts?")],
];

/** Who: a federal official or role. */
const OFFICIAL: [string, RegExp][] = [
  ["member_of_congress", R("congress(man|woman|member)|\\bu\\.?s\\.? (rep\\.|representative|senator)\\b|former (rep\\.|representative|senator)")],
  ["federal_employee", R("federal (employee|official|officer|agent|worker|contracting)|government (employee|official)")],
  ["law_enforcement", R("\\b(fbi|dea|atf|ice|hsi|secret service|special) agent|border patrol|cbp officer|customs (and border protection )?officer|deportation officer|u\\.?s\\.? marshal")],
  ["prison", R("(correctional|detention|prison) officer|bureau of prisons|\\bbop\\b")],
  ["military", R("\\b(navy|army|air force|marine corps|coast guard|space force)\\b|\\b(admiral|colonel|lieutenant|sergeant|captain|commander|soldier|officer in the)\\b|department of defense|defense contractor|military")],
  ["agency_named", R("\\b(irs|ssa|social security administration|veterans affairs|\\bva\\b|gsa|general services|hud|usda|epa|fema|nasa|state department|department of (the )?\\w+)\\b")],
  ["postal", R("postal (employee|worker|carrier|service)|usps")],
  ["ethics_body", R("inspector general|office of special counsel|ethics committee")],
];

/** Out of v1 scope unless an official is also involved (SPEC §2). */
const EXCLUDE: [string, RegExp][] = [
  ["healthcare", R("medicare|medicaid|health ?care fraud|tricare|telemedicine|pharmac|opioid|pill mill|durable medical")],
  ["pandemic", R("\\bppp\\b|paycheck protection|\\beidl\\b|pandemic|covid|unemployment insurance")],
  ["tax", R("tax (evasion|fraud|return|preparer)|failing to file|irs refunds?")],
  ["state_local", R("\\b(sheriff|mayor|alderman|city council|county (commissioner|official|employee|clerk)|state (senator|representative|trooper|employee|official|legislator)|police (officer|chief|sergeant)|school (board|district)|deputy sheriff|jail|municipal)\\b")],
];

export function classifyTitle(title: string): RuleHit | null {
  const t = title.replace(/\s+/g, " ");
  const conduct = CONDUCT.filter(([, re]) => re.test(t)).map(([n]) => n);
  const official = OFFICIAL.filter(([, re]) => re.test(t)).map(([n]) => n);
  const excluded = EXCLUDE.filter(([, re]) => re.test(t)).map(([n]) => n);
  // A candidate needs a corruption-type conduct word, or a strong official word with a
  // misconduct verb. Exclusions are tags, not drops, unless no federal official appears at all.
  const strongOfficial = official.some((o) => ["member_of_congress", "federal_employee", "law_enforcement", "prison", "ethics_body"].includes(o));
  const misconduct = /\b(charged|indicted|pleads?|pleaded|guilty|convicted|sentenced|arrested|found|admits?|settles?)\b/i.test(t);
  const hit = conduct.length > 0 || (strongOfficial && misconduct);
  if (!hit) return null;
  if (excluded.length && official.length === 0) return null;
  // Bribery or kickbacks with no federal role named are usually state or local cases; keep only if
  // nothing marks them as state/local.
  if (official.length === 0 && excluded.includes("state_local")) return null;
  return { tags: [...conduct, ...official], excluded };
}
