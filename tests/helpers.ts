import path from "node:path";
import { loadDataset, type Dataset } from "../src/lib/load";

export const FIXTURE_DIR = path.resolve("tests/fixtures/valid");

export function loadFixture(): Dataset {
  const { dataset, issues } = loadDataset(FIXTURE_DIR);
  if (issues.length) throw new Error("fixture failed to load:\n" + issues.map((i) => `${i.file}: ${i.message}`).join("\n"));
  return dataset;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}
