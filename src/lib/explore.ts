/**
 * Explore table logic shared by the browser and the tests. Pure functions only:
 * no DOM, no Node APIs, and no runtime imports (types are erased), so the page
 * script stays small. Filter state round-trips through the query string so any
 * view can be shared as a link (SPEC.md §10.1).
 */
import type { ActorMix, EventStatus } from "./derive";
import type { Category, Status } from "../schemas/event";
import type { MoneyBasis } from "../schemas/common";

export type DateBasis = "first_public_action" | "conduct_start" | "resolution";
export type MoneyMeasure =
  | "loss_to_government"
  | "bribe_or_kickback"
  | "contract_value_involved"
  | "settlement_amount"
  | "restitution_ordered"
  | "fines"
  | "forfeiture"
  | "whistleblower_share";
export type SortKey = "date" | "title" | "status" | "money";

export interface MoneyCell {
  nominal: number;
  adjusted: number | null;
  basis: MoneyBasis;
}

export interface ExploreParticipant {
  name: string;
  href: string;
  status: Status | null;
  statusLabel: string;
  tone: string;
  date: string | null;
  resolved: boolean;
  pardoned: boolean;
  commuted: boolean;
}

export interface ExploreRow {
  id: string;
  title: string;
  href: string;
  categories: Category[];
  categoryLabels: string[];
  primaryCategory: Category;
  actorMix: ActorMix;
  eventStatus: EventStatus;
  dates: Record<DateBasis, string | null>;
  agencies: { id: string; name: string }[];
  participants: ExploreParticipant[];
  money: Partial<Record<MoneyMeasure, MoneyCell>>;
  moneyYear: number;
  text: string;
}

export interface FilterState {
  q: string;
  basis: DateBasis;
  from: number | null;
  to: number | null;
  actor: ActorMix[];
  cat: Category[];
  hatch: boolean;
  healthcare: boolean;
  pandemic: boolean;
  agency: string;
  status: EventStatus | "";
  pstatus: Status | "";
  measure: MoneyMeasure;
  min: number | null;
  max: number | null;
  alleged: boolean;
  sort: SortKey;
  dir: "asc" | "desc";
}

/**
 * Defaults. Health care and pandemic-relief fraud are off by default (SPEC §2).
 * Hatch Act cases are listed by default here because Explore is a listing, not a
 * headline count; they stay excluded from headline counts elsewhere.
 * Alleged money is excluded from money filtering and sorting unless turned on (SPEC §5).
 */
export const DEFAULT_STATE: FilterState = {
  q: "",
  basis: "first_public_action",
  from: null,
  to: null,
  actor: [],
  cat: [],
  hatch: true,
  healthcare: false,
  pandemic: false,
  agency: "",
  status: "",
  pstatus: "",
  measure: "loss_to_government",
  min: null,
  max: null,
  alleged: false,
  sort: "date",
  dir: "desc",
};

const BASES: DateBasis[] = ["first_public_action", "conduct_start", "resolution"];
const MEASURES: MoneyMeasure[] = [
  "loss_to_government",
  "bribe_or_kickback",
  "contract_value_involved",
  "settlement_amount",
  "restitution_ordered",
  "fines",
  "forfeiture",
  "whistleblower_share",
];
const SORTS: SortKey[] = ["date", "title", "status", "money"];
const EVENT_STATUSES: EventStatus[] = ["pending", "partially_resolved", "resolved"];

function intOrNull(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function list<T extends string>(v: string | null): T[] {
  return v ? (v.split(",").filter(Boolean) as T[]) : [];
}

function bool(v: string | null, fallback: boolean): boolean {
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

/** Reads filter state from a query string, ignoring unknown or malformed values. */
export function parseQuery(search: string): FilterState {
  const p = new URLSearchParams(search);
  const d = DEFAULT_STATE;
  const basis = p.get("basis") as DateBasis | null;
  const measure = p.get("measure") as MoneyMeasure | null;
  const sort = p.get("sort") as SortKey | null;
  const status = p.get("status") as EventStatus | null;
  return {
    q: p.get("q") ?? d.q,
    basis: basis && BASES.includes(basis) ? basis : d.basis,
    from: intOrNull(p.get("from")),
    to: intOrNull(p.get("to")),
    actor: list(p.get("actor")),
    cat: list(p.get("cat")),
    hatch: bool(p.get("hatch"), d.hatch),
    healthcare: bool(p.get("healthcare"), d.healthcare),
    pandemic: bool(p.get("pandemic"), d.pandemic),
    agency: p.get("agency") ?? d.agency,
    status: status && EVENT_STATUSES.includes(status) ? status : "",
    pstatus: (p.get("pstatus") ?? "") as Status | "",
    measure: measure && MEASURES.includes(measure) ? measure : d.measure,
    min: intOrNull(p.get("min")),
    max: intOrNull(p.get("max")),
    alleged: bool(p.get("alleged"), d.alleged),
    sort: sort && SORTS.includes(sort) ? sort : d.sort,
    dir: p.get("dir") === "asc" ? "asc" : p.get("dir") === "desc" ? "desc" : d.dir,
  };
}

/** Writes only the values that differ from the defaults, so shared links stay short. */
export function toQuery(s: FilterState): string {
  const p = new URLSearchParams();
  const d = DEFAULT_STATE;
  if (s.q.trim()) p.set("q", s.q.trim());
  if (s.basis !== d.basis) p.set("basis", s.basis);
  if (s.from !== null) p.set("from", String(s.from));
  if (s.to !== null) p.set("to", String(s.to));
  if (s.actor.length) p.set("actor", s.actor.join(","));
  if (s.cat.length) p.set("cat", s.cat.join(","));
  if (s.hatch !== d.hatch) p.set("hatch", s.hatch ? "1" : "0");
  if (s.healthcare !== d.healthcare) p.set("healthcare", s.healthcare ? "1" : "0");
  if (s.pandemic !== d.pandemic) p.set("pandemic", s.pandemic ? "1" : "0");
  if (s.agency) p.set("agency", s.agency);
  if (s.status) p.set("status", s.status);
  if (s.pstatus) p.set("pstatus", s.pstatus);
  if (s.measure !== d.measure) p.set("measure", s.measure);
  if (s.min !== null) p.set("min", String(s.min));
  if (s.max !== null) p.set("max", String(s.max));
  if (s.alleged !== d.alleged) p.set("alleged", s.alleged ? "1" : "0");
  if (s.sort !== d.sort) p.set("sort", s.sort);
  if (s.dir !== d.dir) p.set("dir", s.dir);
  const q = p.toString();
  return q ? `?${q}` : "";
}

/** The money value used for filtering and sorting: adjusted when available, else nominal. */
export function moneyValue(row: ExploreRow, s: Pick<FilterState, "measure" | "alleged">): number | null {
  const cell = row.money[s.measure];
  if (!cell) return null;
  if (cell.basis === "alleged" && !s.alleged) return null;
  return cell.adjusted ?? cell.nominal;
}

export function rowYear(row: ExploreRow, basis: DateBasis): number | null {
  const d = row.dates[basis];
  return d ? Number(d.slice(0, 4)) : null;
}

const OFF_TOGGLES: Partial<Record<Category, keyof FilterState>> = {
  hatch_act: "hatch",
  healthcare_fraud: "healthcare",
  pandemic_relief_fraud: "pandemic",
};

export function matches(row: ExploreRow, s: FilterState): boolean {
  const toggle = OFF_TOGGLES[row.primaryCategory];
  if (toggle && !s[toggle]) return false;
  if (s.q.trim()) {
    const terms = s.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.every((t) => row.text.includes(t))) return false;
  }
  if (s.from !== null || s.to !== null) {
    const y = rowYear(row, s.basis);
    if (y === null) return false;
    if (s.from !== null && y < s.from) return false;
    if (s.to !== null && y > s.to) return false;
  }
  if (s.actor.length && !s.actor.includes(row.actorMix)) return false;
  if (s.cat.length && !row.categories.some((c) => s.cat.includes(c))) return false;
  if (s.agency && !row.agencies.some((a) => a.id === s.agency)) return false;
  if (s.status && row.eventStatus !== s.status) return false;
  if (s.pstatus && !row.participants.some((p) => p.status === s.pstatus)) return false;
  if (s.min !== null || s.max !== null) {
    const v = moneyValue(row, s);
    if (v === null) return false;
    if (s.min !== null && v < s.min) return false;
    if (s.max !== null && v > s.max) return false;
  }
  return true;
}

const STATUS_ORDER: Record<EventStatus, number> = { pending: 0, partially_resolved: 1, resolved: 2 };

/** Sorts a copy. Rows with no value for the sort key always go last, whichever direction. */
export function sortRows(rows: ExploreRow[], s: FilterState): ExploreRow[] {
  const sign = s.dir === "asc" ? 1 : -1;
  const key = (r: ExploreRow): string | number | null => {
    switch (s.sort) {
      case "title":
        return r.title.toLowerCase();
      case "status":
        return STATUS_ORDER[r.eventStatus];
      case "money":
        return moneyValue(r, s);
      default:
        return r.dates[s.basis];
    }
  };
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return a.id.localeCompare(b.id);
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka < kb) return -1 * sign;
    if (ka > kb) return 1 * sign;
    return a.id.localeCompare(b.id);
  });
}

export function applyState(rows: ExploreRow[], s: FilterState): ExploreRow[] {
  return sortRows(rows.filter((r) => matches(r, s)), s);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
