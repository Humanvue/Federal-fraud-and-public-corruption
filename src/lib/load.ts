import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import {
  Contract,
  Corrections,
  CpiU,
  Event,
  Organization,
  Person,
  Source,
  type Correction,
} from "../schemas";

export interface Dataset {
  events: Event[];
  people: Person[];
  organizations: Organization[];
  contracts: Contract[];
  sources: Source[];
  cpi: CpiU | null;
  corrections: Correction[];
}

export interface Issue {
  file: string;
  message: string;
}

export interface LoadResult {
  dataset: Dataset;
  issues: Issue[];
}

/** Directory each loaded record came from, so overlays (drafts/ on top of data/) resolve text files and report paths correctly. */
const origins = new WeakMap<object, string>();
export function originDir(item: object, fallback: string): string {
  return origins.get(item) ?? fallback;
}

function formatZodError(err: z.ZodError): string[] {
  return err.issues.map((i) => {
    const p = i.path.length ? i.path.map(String).join(".") : "(root)";
    return `${p}: ${i.message}`;
  });
}

function readYaml(file: string, issues: Issue[]): unknown {
  try {
    return parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    issues.push({ file, message: `YAML parse error: ${(e as Error).message}` });
    return undefined;
  }
}

function listYaml(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => path.join(dir, f));
}

function loadCollection<S extends z.ZodType>(dir: string, schema: S, issues: Issue[]): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  for (const file of listYaml(dir)) {
    const raw = readYaml(file, issues);
    if (raw === undefined) continue;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      for (const m of formatZodError(parsed.error)) issues.push({ file, message: m });
      continue;
    }
    const item = parsed.data as { id?: string };
    const base = path.basename(file).replace(/\.ya?ml$/, "");
    if (item.id !== undefined && item.id !== base) {
      issues.push({ file, message: `file name must match id (${item.id})` });
      continue;
    }
    origins.set(parsed.data as object, path.dirname(dir));
    out.push(parsed.data);
  }
  return out;
}

function loadOne(root: string, issues: Issue[], wantReference: boolean): Dataset {
  const dataset: Dataset = {
    events: loadCollection(path.join(root, "events"), Event, issues),
    people: loadCollection(path.join(root, "people"), Person, issues),
    organizations: loadCollection(path.join(root, "organizations"), Organization, issues),
    contracts: loadCollection(path.join(root, "contracts"), Contract, issues),
    sources: loadCollection(path.join(root, "sources"), Source, issues),
    cpi: null,
    corrections: [],
  };
  if (!wantReference) return dataset;

  const cpiFile = path.join(root, "reference", "cpi-u.yaml");
  if (fs.existsSync(cpiFile)) {
    const raw = readYaml(cpiFile, issues);
    if (raw !== undefined) {
      const parsed = CpiU.safeParse(raw);
      if (parsed.success) dataset.cpi = parsed.data;
      else for (const m of formatZodError(parsed.error)) issues.push({ file: cpiFile, message: m });
    }
  } else {
    issues.push({ file: cpiFile, message: "missing reference/cpi-u.yaml" });
  }

  const corrFile = path.join(root, "corrections", "corrections.yaml");
  if (fs.existsSync(corrFile)) {
    const raw = readYaml(corrFile, issues);
    if (raw !== undefined) {
      const parsed = Corrections.safeParse(raw ?? []);
      if (parsed.success) dataset.corrections = parsed.data;
      else for (const m of formatZodError(parsed.error)) issues.push({ file: corrFile, message: m });
    }
  } else {
    issues.push({ file: corrFile, message: "missing corrections/corrections.yaml" });
  }
  return dataset;
}

/**
 * Loads one data directory, or several merged in order. With several, the
 * LAST directory is the base (data/) that supplies reference data and
 * corrections; earlier ones (drafts/) are overlays. Duplicate ids across
 * directories are reported.
 */
export function loadDataset(dir: string | string[]): LoadResult {
  const issues: Issue[] = [];
  const dirs = (Array.isArray(dir) ? dir : [dir]).map((d) => path.resolve(d));
  const base = dirs[dirs.length - 1];
  const parts = dirs.map((d) => loadOne(d, issues, d === base));
  const merged: Dataset = { events: [], people: [], organizations: [], contracts: [], sources: [], cpi: null, corrections: [] };
  const seen = new Map<string, string>();
  for (const part of parts) {
    for (const key of ["events", "people", "organizations", "contracts", "sources"] as const) {
      for (const item of part[key] as { id: string }[]) {
        const prev = seen.get(item.id);
        const from = originDir(item, base);
        if (prev) issues.push({ file: path.join(from, key, `${item.id}.yaml`), message: `duplicate id ${item.id} (also in ${prev})` });
        seen.set(item.id, from);
        (merged[key] as unknown[]).push(item);
      }
    }
    if (part.cpi) merged.cpi = part.cpi;
    merged.corrections.push(...part.corrections);
  }
  return { dataset: merged, issues };
}
