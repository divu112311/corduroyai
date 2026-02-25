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

type Action = "preprocess" | "parse" | "rules" | "rulings" | "classify" | "bulk-classify" | "bulk-classify-status" | "bulk-classify-clarify" | "bulk-classify-cancel";

const PY_BASE_URL = Deno.env.get("PY_BASE_URL") || "";
const PY_BACKEND_TOKEN = Deno.env.get("PY_BACKEND_TOKEN") || "";

const allowOrigin = Deno.env.get("PY_PROXY_ALLOW_ORIGIN") || "*";
const allowHeaders =
  Deno.env.get("PY_PROXY_ALLOW_HEADERS") ||
  "authorization,apikey,content-type";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowOrigin,
  "Access-Control-Allow-Headers": allowHeaders,
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

interface ActionMapping {
  path: string;
  method: string;
}

function mapActionToRoute(action: Action, body?: any): ActionMapping {
  switch (action) {
    case "preprocess":
      return { path: "/preprocess", method: "POST" };
    case "parse":
      return { path: "/parse", method: "POST" };
    case "rules":
      return { path: "/apply_rules", method: "POST" };
    case "rulings":
      return { path: "/generate_ruling", method: "POST" };
    case "classify":
      return { path: "/classify", method: "POST" };
    case "bulk-classify":
      return { path: "/bulk-classify", method: "POST" };
    case "bulk-classify-status":
      return { path: `/bulk-classify/${body?.run_id || ""}`, method: "GET" };
    case "bulk-classify-clarify":
      return { path: `/bulk-classify/${body?.run_id || ""}/clarify`, method: "POST" };
    case "bulk-classify-cancel":
      return { path: `/bulk-classify/${body?.run_id || ""}`, method: "DELETE" };
    default:
      return { path: "", method: "POST" };
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

  // Determine content type to handle both JSON and multipart/form-data
  const contentType = req.headers.get("content-type") || "";
  let body: any;
  let isMultipart = false;
  let rawBody: BodyInit | null = null;

  if (contentType.includes("multipart/form-data")) {
    // For file uploads (bulk-classify), forward the raw request body
    isMultipart = true;
    try {
      // Read the form data to extract the action, then rebuild for forwarding
      const formData = await req.formData();
      const action = formData.get("action") as string;
      if (!action) {
        return corsResponse("Missing action in form data", 400);
      }
      body = { action };
      // Rebuild FormData without the action field for the upstream
      const forwardFormData = new FormData();
      for (const [key, value] of formData.entries()) {
        if (key !== "action") {
          forwardFormData.append(key, value);
        }
      }
      rawBody = forwardFormData;
    } catch {
      return corsResponse("Invalid form data", 400);
    }
  } else {
    try {
      body = await req.json();
    } catch {
      return corsResponse("Invalid JSON", 400);
    }
  }

  // Default to "classify" if no action is specified (backward compatibility)
  const action = (body?.action || "classify") as Action;

  const route = mapActionToRoute(action, body);
  if (!route.path) {
    return corsResponse("Unknown action", 400);
  }

  if (!PY_BASE_URL) {
    return corsResponse("PY_BASE_URL not set", 500);
  }

  const headers: Record<string, string> = {};

  if (PY_BACKEND_TOKEN) {
    headers["Authorization"] = `Bearer ${PY_BACKEND_TOKEN}`;
  }

  let upstreamBody: BodyInit | null = null;

  if (isMultipart) {
    // Forward the FormData directly — don't set Content-Type, let fetch set it with boundary
    upstreamBody = rawBody;
  } else if (route.method !== "GET" && route.method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    const forwardBody = { ...body };
    delete forwardBody.action;
    delete forwardBody.run_id;  // run_id is in the URL path, not the body
    upstreamBody = JSON.stringify(forwardBody);
  }

  try {
    const upstreamResp = await fetch(`${PY_BASE_URL}${route.path}`, {
      method: route.method,
      headers,
      ...(upstreamBody ? { body: upstreamBody } : {}),
    });

    const text = await upstreamResp.text();
    const respContentType = upstreamResp.headers.get("content-type") || "";

    return corsResponse(
      text,
      upstreamResp.status,
      respContentType.includes("application/json")
        ? { "Content-Type": "application/json" }
        : {}
    );
  } catch (err) {
    return corsResponse(`Proxy error: ${String(err)}`, 502);
  }
});





