import type { Status, Track, Category, ActorType, Role } from "../schemas/event";

export const STATUS_LABELS: Record<Status, string> = {
  charged: "Charged",
  pleaded_guilty: "Pleaded guilty",
  convicted: "Convicted at trial",
  sentenced: "Sentenced",
  acquitted: "Acquitted",
  dismissed: "Charges dismissed",
  partially_dismissed: "Some charges dismissed",
  mistrial: "Mistrial",
  appeal_pending: "Appeal pending",
  overturned: "Conviction overturned",
  deferred_prosecution: "Deferred prosecution agreement",
  declined: "Prosecution declined",
  deceased: "Deceased",
  fugitive: "Fugitive",
  civil_complaint_filed: "Civil complaint filed",
  settled_no_admission: "Settled without admission",
  settled_with_admission: "Settled with admission",
  judgment_against: "Civil judgment",
  civil_dismissed: "Civil complaint dismissed",
  finding_issued: "Finding of misconduct",
  no_violation_found: "No violation found",
};

/** Badge tone groups for CSS. Neutral wording; color never implies guilt beyond the status itself. */
export const STATUS_TONE: Record<Status, "pending" | "adverse" | "favorable" | "neutral"> = {
  charged: "pending",
  civil_complaint_filed: "pending",
  appeal_pending: "pending",
  mistrial: "pending",
  partially_dismissed: "pending",
  fugitive: "pending",
  pleaded_guilty: "adverse",
  convicted: "adverse",
  sentenced: "adverse",
  settled_with_admission: "adverse",
  judgment_against: "adverse",
  finding_issued: "adverse",
  acquitted: "favorable",
  dismissed: "favorable",
  overturned: "favorable",
  declined: "favorable",
  civil_dismissed: "favorable",
  no_violation_found: "favorable",
  deferred_prosecution: "neutral",
  settled_no_admission: "neutral",
  deceased: "neutral",
};

export const TRACK_LABELS: Record<Track, string> = {
  criminal: "Criminal",
  civil: "Civil",
  administrative: "Administrative",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  bribery_kickbacks: "Bribery and kickbacks",
  conflict_of_interest_ethics: "Conflict of interest and ethics",
  embezzlement_theft: "Embezzlement and theft",
  false_statements_obstruction: "False statements and obstruction",
  procurement_fraud: "Procurement fraud",
  grant_fraud: "Grant fraud",
  hatch_act: "Hatch Act",
  healthcare_fraud: "Health care fraud",
  pandemic_relief_fraud: "Pandemic relief fraud",
  other: "Other",
};

export const ACTOR_LABELS: Record<ActorType, string> = {
  official: "Federal official",
  contractor: "Contractor",
  private: "Private party",
};

export const ROLE_LABELS: Record<Role, string> = {
  defendant: "Defendant",
  briber: "Alleged or admitted payer",
  bribe_recipient: "Alleged or admitted recipient",
  co_conspirator: "Co-conspirator",
  relator: "Whistleblower (relator)",
  cooperating_witness: "Cooperating witness",
  subject_of_finding: "Subject of finding",
  victim_agency: "Affected agency",
};

export const ADMIN_ACTION_LABELS: Record<string, string> = {
  suspension: "Suspended from federal contracting",
  debarment: "Debarred from federal contracting",
  removal_from_office: "Removed from office",
  resignation: "Resigned",
  security_clearance_revoked: "Security clearance revoked",
};

export const MONEY_LABELS: Record<string, string> = {
  loss_to_government: "Loss to government",
  bribe_or_kickback: "Bribe or kickback",
  contract_value_involved: "Contract value involved",
  settlement_amount: "Settlement",
  restitution_ordered: "Restitution ordered",
  fines: "Fines",
  forfeiture: "Forfeiture",
  whistleblower_share: "Whistleblower share",
};

export const BASIS_LABELS: Record<string, string> = {
  alleged: "alleged",
  admitted: "admitted",
  adjudicated: "adjudicated",
  estimated: "estimated",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatUSD(n: number): string {
  return usd.format(n);
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human date that respects the stored precision: "2016", "Mar 2016", "Mar 1, 2016". */
export function formatDate(d: string | null | undefined): string {
  if (!d) return "unknown";
  const [y, m, day] = d.split("-");
  if (!m) return y;
  const mon = MONTHS_SHORT[Number(m) - 1];
  return day ? `${mon} ${Number(day)}, ${y}` : `${mon} ${y}`;
}
