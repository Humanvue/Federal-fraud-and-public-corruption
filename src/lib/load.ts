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
    out.push(parsed.data);
  }
  return out;
}

export function loadDataset(dir: string): LoadResult {
  const issues: Issue[] = [];
  const root = path.resolve(dir);
  const dataset: Dataset = {
    events: loadCollection(path.join(root, "events"), Event, issues),
    people: loadCollection(path.join(root, "people"), Person, issues),
    organizations: loadCollection(path.join(root, "organizations"), Organization, issues),
    contracts: loadCollection(path.join(root, "contracts"), Contract, issues),
    sources: loadCollection(path.join(root, "sources"), Source, issues),
    cpi: null,
    corrections: [],
  };

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

  return { dataset, issues };
}
