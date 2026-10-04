import type { APIRoute } from "astro";
import { getData } from "../../lib/data";
import { datasetJson } from "../../lib/export";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(datasetJson(getData(), new Date().toISOString()), null, 1), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
