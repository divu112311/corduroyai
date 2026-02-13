/**
 * Supabase Edge Function: python-proxy
 * 
 * This file contains the Edge Function code that connects to your Python backend.
 * 
 * Instructions:
 * 1. Paste your edge function code below
 * 2. This function should handle communication between the frontend and Python backend
 * 3. It should handle actions like: preprocess, parse, rules, rulings, and classification
 * 
 * Expected structure:
 * - Receives requests from frontend via supabase.functions.invoke('python-proxy')
 * - Forwards requests to Python backend
 * - Returns responses back to frontend
 */

// // @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

type Action = "preprocess" | "parse" | "rules" | "rulings";

const PY_BASE_URL = Deno.env.get("PY_BASE_URL") || "";
const PY_BACKEND_TOKEN = Deno.env.get("PY_BACKEND_TOKEN") || "";

const allowOrigin = Deno.env.get("PY_PROXY_ALLOW_ORIGIN") || "*";
const allowHeaders =
  Deno.env.get("PY_PROXY_ALLOW_HEADERS") ||
  "authorization,apikey,content-type";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowOrigin,
  "Access-Control-Allow-Headers": allowHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function mapActionToPath(action: Action): string {
  switch (action) {
    case "preprocess":
      return "/preprocess";
    case "parse":
      return "/parse";
    case "rules":
      return "/apply_rules";
    case "rulings":
      return "/generate_ruling";
    default:
      return "";
  }
}

function corsResponse(
  body: BodyInit | null,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

serve(async (req: Request) => {
  // ✅ MUST be 200, not 204
  if (req.method === "OPTIONS") {
    return corsResponse(null, 200);
  }

  if (req.method !== "POST") {
    return corsResponse("Method not allowed", 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return corsResponse("Invalid JSON", 400);
  }

  const action = body?.action as Action;
  if (!action) {
    return corsResponse("Missing action", 400);
  }

  const path = mapActionToPath(action);
  if (!path) {
    return corsResponse("Unknown action", 400);
  }

  if (!PY_BASE_URL) {
    return corsResponse("PY_BASE_URL not set", 500);
  }

  const forwardBody = { ...body };
  delete forwardBody.action;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (PY_BACKEND_TOKEN) {
    headers["Authorization"] = `Bearer ${PY_BACKEND_TOKEN}`;
  }

  try {
    const upstreamResp = await fetch(`${PY_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(forwardBody),
    });

    const text = await upstreamResp.text();
    const contentType = upstreamResp.headers.get("content-type") || "";

    return corsResponse(
      text,
      upstreamResp.status,
      contentType.includes("application/json")
        ? { "Content-Type": "application/json" }
        : {}
    );
  } catch (err) {
    return corsResponse(`Proxy error: ${String(err)}`, 502);
  }
});





