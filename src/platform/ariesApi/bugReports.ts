// The bug report routes of the mod's API, through the mod's own HTTP client:
// GM inside the Discord activity, fetch on the web with GM as the fallback.
// Unlike `postToAriesApi`, the answer's body is kept: the report's id, ref
// and follow token come back in it.

import type { BugReportClient, BugReportHttpRequest, BugReportHttpResponse } from "../../lib/bugReport/client";
import { request } from "../http";
import { getApiKey } from "../storage";
import { API_ORIGIN } from "./http";

async function send(req: BugReportHttpRequest): Promise<BugReportHttpResponse> {
  const res = await request(
    { url: req.url, method: req.method, headers: req.headers, body: req.body, timeoutMs: req.timeoutMs },
    "text",
  );
  return { status: res.status, body: res.body ?? "" };
}

export const bugReportClient: BugReportClient = {
  baseUrl: API_ORIGIN,
  request: send,
  getApiKey,
};
