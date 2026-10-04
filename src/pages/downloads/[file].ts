import type { APIRoute } from "astro";
import { getData } from "../../lib/data";
import { TABLES, toCSV, type TableName } from "../../lib/export";

export function getStaticPaths() {
  return Object.keys(TABLES).map((file) => ({ params: { file } }));
}

export const GET: APIRoute = ({ params }) => {
  const table = TABLES[params.file as TableName].build(getData());
  return new Response(toCSV(table), { headers: { "content-type": "text/csv; charset=utf-8" } });
};
