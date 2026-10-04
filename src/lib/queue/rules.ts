/**
 * Rules that flag a press release title as a possible public-corruption case (SPEC.md §2, §7.1).
 * DOJ topic tags are not reliable (a federal bribery sentencing may be tagged "Financial Fraud"),
 * so titles are screened by keyword. The rules deliberately over-include: a false alarm costs the
 * weekly session a few seconds, a missed case costs completeness. The owner may edit these lists.
 */
export interface RuleHit { tags: string[]; excluded: string[] }

const R = (s: string) => new RegExp(s, "i");

/** Conduct words that qualify a title on their own (bribery-type corruption). */
const CORRUPTION: [string, RegExp][] = [
  ["bribery", R("\\bbrib(e|es|ed|ing|ery)\\b")],
  ["kickback", R("\\bkick-?backs?\\b")],
  ["gratuity", R("\\bgratuit(y|ies)\\b")],
  ["honest_services", R("honest[- ]services")],
  ["extortion_color_of_law", R("color of (official )?(right|law)")],
  ["conflict_of_interest", R("conflict[- ]of[- ]interest")],
  ["hatch_act", R("hatch act")],
];

/** Conduct words that qualify a title only when a federal official is its subject. */
const MISCONDUCT: [string, RegExp][] = [
  ["embezzlement", R("\\bembezzl\\w*|theft of (government|public|federal) (funds|property|money)|stealing|\\btheft\\b")],
  ["false_statements", R("false statements?|lying to|perjury")],
  ["false_records", R("false (tax )?(returns?|records?|reports?|claims?|documents?|entries)|falsif\\w*")],
  ["obstruction", R("obstruct\\w*")],
  ["procurement", R("\\bcontracts?\\b|procurement|bid[- ]rigging")],
  ["fraud", R("\\bfraud\\w*|scheme")],
  ["smuggling", R("smuggl\\w*|contraband")],
  ["foreign_agent", R("(foreign|unregistered) agent|acting as (an? )?agent of")],
];

/** Who: a federal official or role. */
const OFFICIAL: [string, RegExp][] = [
  ["member_of_congress", R("congress(man|woman|member)|\\bu\\.?s\\.? (rep\\.|representative|senator|congressman)\\b|former (u\\.?s\\.? )?(rep\\.|representative|senator|congressman)")],
  ["federal_employee", R("federal (employee|official|officer|agent|worker|contracting|prosecutor)|government (employee|official)|civil servant")],
  ["law_enforcement", R("\\b(fbi|dea|atf|ice|hsi|secret service|special|border patrol|federal) agents?\\b|border patrol|cbp officers?|customs (and border protection )?officers?|immigration officers?|deportation officers?|uscis|(deputy )?u\\.?s\\.? marshals?")],
  ["prison", R("bureau of prisons|\\bbop\\b|federal (prison|correctional) (officer|employee|guard|worker|staff)|correctional officers?")],
  ["military", R("\\b(navy|army|air force|marine corps|coast guard|space force)\\b|\\b(admiral|colonel|lieutenant colonel|major|sergeant|soldier|sailor|airman|marine)\\b|department of (defense|war)|\\b(dod|dow)\\b|military|pentagon")],
  ["agency_named", R("\\b(irs|ssa|social security administration|veterans affairs|\\bva\\b|gsa|general services administration|hud|usda|epa|fema|nasa|state department|department of (energy|state|labor|education|transportation|commerce|homeland security|the interior|agriculture|health and human services)|national laboratory)\\b")],
  ["postal", R("postal (employee|worker|carrier|clerk|service)|\\busps\\b|mail carrier|letter carrier")],
  ["ethics_body", R("inspector general|office of special counsel|ethics committee")],
  ["contractor", R("(government|federal|defense|military) contractors?")],
];

/** Out of v1 scope (SPEC §2). Dropped unless a federal official is the subject of the title. */
const EXCLUDE: [string, RegExp][] = [
  ["healthcare", R("medicare|medicaid|health ?care fraud|tricare|telemedicine|pharmac|opioid|pill mill|durable medical")],
  ["pandemic", R("\\bppp\\b|paycheck protection|\\beidl\\b|pandemic|covid|unemployment insurance")],
  ["tax", R("tax (evasion|fraud|return|preparer|refund)|failing to file")],
  ["benefits", R("social security (fraud|benefits)|deceased .{0,20} benefits|snap benefits")],
  ["foreign_bribery", R("foreign (bribery|officials?)|\\bfcpa\\b|international bribery|regime|foreign government")],
  ["state_prison", R("\\b(state|county|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming) (department of )?(correctional|corrections|prison|jail|detention)")],
  ["state_agency", R("\\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming) (department|office|agency|division|board|commission)")],
  // Owner policy 2026-10-04: outside v1 even when the employee is federal (SPEC §2).
  ["postal_mail_theft", R("(steal\\w*|stole|theft|tamper\\w*|destr\\w*|delay\\w*|obstruct\\w*|dump\\w*|keeping|failing to deliver).{0,60}\\bmail\\b|\\bmail theft|stolen mail|gift cards? (from|out of) (the )?mail")],
  ["workers_comp", R("workers'? comp\\w*|disability (payments?|benefits?|pay|compensation)")],
  ["labor_union", R("\\bunion (employee|official|officer|president|treasurer)|workers union")],
  ["state_local", R("\\b(sheriff|mayor|alderman|city council|county (commissioner|official|employee|clerk|judge)|state (senator|representative|trooper|employee|official|legislator|judge)|police (department|officer|chief|sergeant|lieutenant)|school (board|district)|deputy sheriff|municipal|constituent services|city of|township|tribal)\\b")],
  ["territorial", R("virgin islands|puerto rico|hacienda|guam (customs|police|government|official)|commissioner of")],
];

/** Victim or bystander context: the federal official is not the wrongdoer. */
const VICTIM = R("(assault\\w*|threat\\w*|kill|murder|attack\\w*|shoot\\w*|resist\\w*|injur\\w*|imperson\\w*|harass\\w*|obstructing access)[^.]{0,60}(federal|ice|cbp|fbi|marshals?|officers?|agents?|officials?|employees?|facility)|(apprehended|arrested) (in|by) .{0,40}(task force|marshals)");

const VERB = /\b(charged|indicted|accused|arrested|pleads?|pleaded|admits?|guilty|convicted|found|sentenced|settles?|agrees?|resolves?|ordered|faces|lands|jailed|receives?|sought|seeks?|to pay|pays|sentences|adds|orders|returns)\b/i;

const ACTIVE = /\b(returns? (an? )?(\w+ )?indictment against|indicts|sentences|charges|convicts|arrests)\b/i;

/** An agency name in the subject means a person only alongside a role word ("IRS employee", not "refunds from IRS"). */
const ROLE = /\b(employee|official|officer|worker|agent|director|administrator|manager|supervisor|executive|inspector|specialist|clerk|carrier)\b/i;

const hits = (rules: [string, RegExp][], text: string) => rules.filter(([, re]) => re.test(text)).map(([n]) => n);

export function classifyTitle(title: string): RuleHit | null {
  const t = title.replace(/\s+/g, " ");
  // The subject is the part of the headline before its first verb ("Former Federal Employee Sentenced ...").
  // Active forms name the wrongdoer after the verb ("Jury Returns Indictment Against X", "Judge Sentences X").
  const active = ACTIVE.exec(t);
  const v = VERB.exec(t);
  const subject = active ? t.slice(active.index + active[0].length).split(/\b(for|in connection with|on charges|after)\b/i)[0] : v ? t.slice(0, v.index) : t;
  // Contractors are tagged but are not federal officials: a contractor-only case is the v2 layer (SPEC §1).
  const subjectOfficials = hits(OFFICIAL, subject).filter((o) => o !== "contractor" && (o !== "agency_named" || ROLE.test(subject)));
  const officials = hits(OFFICIAL, t);
  const corruption = hits(CORRUPTION, t);
  const misconduct = hits(MISCONDUCT, t);
  const excluded = hits(EXCLUDE, t);
  const victim = VICTIM.test(t);

  // Officials named in the subject are the wrongdoers; elsewhere they may be victims or investigators.
  const officialIsSubject = subjectOfficials.length > 0 && !(victim && subjectOfficials.every((o) => o === "law_enforcement"));

  if (corruption.length) {
    // Bribery-type wording qualifies on its own, but out-of-scope topics need a federal official.
    if (excluded.length && !officialIsSubject && !officials.some((o) => o !== "agency_named")) return null;
    return { tags: [...corruption, ...misconduct, ...officials], excluded };
  }
  // A federal person as the subject still needs corruption-type misconduct: a soldier's drug or
  // child-exploitation case is serious but outside this project's scope.
  if (officialIsSubject && misconduct.length) {
    // A state, local, territorial, or union setting means the "official" is probably not federal,
    // unless the subject says so outright.
    if (excluded.some((x) => ["postal_mail_theft", "workers_comp"].includes(x))) return null;
    // A postal employee's theft, tampering, or obstruction is routine mail theft under the same policy.
    if (subjectOfficials.includes("postal") && misconduct.some((m) => ["embezzlement", "obstruction", "smuggling"].includes(m))) return null;
    const jurisdiction = excluded.some((x) => ["state_local", "territorial", "state_prison", "state_agency", "labor_union"].includes(x));
    const plainlyFederal = /\b(federal|u\.s\.|united states|bureau of prisons)\b/i.test(subject) || subjectOfficials.some((o) => ["member_of_congress", "federal_employee", "ethics_body"].includes(o));
    if (jurisdiction && !plainlyFederal) return null;
    return { tags: [...misconduct, ...subjectOfficials, "official_is_subject"], excluded };
  }
  return null;
}
