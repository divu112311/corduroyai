"""
Trade Assistant Chat — GPT-4o-mini with tool calling.
Scoped to trade/HTS topics only. Tools: classify_product, explain_hts, cbp_ruling_lookup.
"""

import json
import traceback
from typing import Dict, Any, List, Optional

from openai import OpenAI
from app.secrets import get_secret
from app.services.preprocess import preprocess, preprocess_clarification
from app.services.parse import parse
from app.services.rules import apply_rules
from app.services.rulings import generate_ruling
from app.services.cbp_rulings import search_cbp_rulings
from app.services.embeddings import embed_query, query_pinecone
from app.models import PreprocessRequest


# ── System prompt ──────────────────────────────────────────────────
SYSTEM_PROMPT = """You are the Corduroy Trade Assistant — a helpful AI built into an HTS classification platform.

SCOPE:
- You help with trade, tariff, HTS, customs, import/export, and anything related to the Corduroy platform.
- For casual greetings (hello, hi, hey, thanks, etc.), respond warmly and briefly, then offer to help.
- If the user asks about something clearly unrelated to trade or this platform (weather, coding, recipes, etc.), politely decline:
  "I can only help with trade and tariff topics. Try asking about HTS codes, product classification, duty rates, or CBP rulings."

APP CONTEXT — The user is inside the Corduroy platform which has these screens:
- **Dashboard**: Shows classification statistics, recent classifications, and exception items that need review (low confidence or needing clarification). "Exceptions" are products where the AI classification wasn't confident enough and needs human review.
- **Classify Product**: Where users enter a product description to get an HTS code classification.
- **Product Profiles**: Saved products with their HTS classifications.
- **Settings**: User preferences like confidence threshold.

When the user asks about "exceptions", "reviews", "dashboard items", "my products", etc. — these are trade-related questions about their data in the platform. Answer helpfully based on the app_context provided.

TOOLS:
- classify_product: When a user describes a product to classify, use this tool. Provide the full product description.
- explain_hts: When a user asks about a specific HTS code (e.g., "What is 6109.10.00?"), use this tool.
- cbp_ruling_lookup: When a user asks about CBP rulings or precedent for a product category, use this tool.

CONTEXT:
- The app_context tells you which screen the user is on and any selected product data. Use it to give contextual answers.
- After a classification, you can explain the result, discuss alternatives, or answer follow-up questions from conversation history.
- If the user asks about their data but you don't have it in the context, let them know what you can see and suggest what they can do.

STYLE:
- Be concise — keep responses short and scannable.
- Use bullet points for lists.
- When showing HTS codes, always include the description and confidence.
- Never give legal or financial advice — redirect to a licensed customs broker if asked.
"""

# ── Tool definitions for OpenAI function calling ───────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "classify_product",
            "description": "Classify a product to find its HTS (Harmonized Tariff Schedule) code. Use this when a user describes a product they want to classify for import/export.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_description": {
                        "type": "string",
                        "description": "Full description of the product including material, intended use, and other relevant details."
                    }
                },
                "required": ["product_description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "explain_hts",
            "description": "Look up and explain a specific HTS code — its description, chapter, section, and duty rate. Use when a user asks about a specific HTS code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hts_code": {
                        "type": "string",
                        "description": "The HTS code to look up (e.g., '6109.10.00.12' or '0901.21')"
                    }
                },
                "required": ["hts_code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cbp_ruling_lookup",
            "description": "Search for CBP (Customs and Border Protection) rulings related to a product or trade topic. Use when a user asks about rulings, precedent, or past customs decisions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for CBP rulings (e.g., 'leather wallet', 'cotton t-shirt', 'ceramic tile')"
                    }
                },
                "required": ["query"]
            }
        }
    },
]


# ── Tool execution ─────────────────────────────────────────────────

def _run_classify(product_description: str) -> Dict[str, Any]:
    """Run the full classification pipeline. Returns the ruling result."""
    try:
        preprocessed = preprocess(
            PreprocessRequest(product_description=product_description)
        )

        if preprocessed.get("needs_clarification"):
            return {
                "type": "clarify",
                "message": "The product description is ambiguous.",
                "questions": preprocessed.get("clarification_questions", []),
            }

        parsed = parse(preprocessed)
        rules_out = apply_rules(parsed)

        ruling = generate_ruling({
            "product": parsed.get("product"),
            "attributes": parsed.get("attributes"),
            "matched_rules": rules_out.get("matched_rules", []),
            "is_clarification": False,
        })

        return ruling

    except Exception as e:
        print(f"Classification error in chat: {traceback.format_exc()}")
        return {"type": "error", "error": str(e)}


def _run_explain_hts(hts_code: str) -> Dict[str, Any]:
    """Look up an HTS code via Pinecone vector search on the code itself."""
    try:
        # Embed the HTS code text and query Pinecone for nearest match
        vector = embed_query(f"HTS {hts_code}")
        matches = query_pinecone(vector)

        if not matches:
            return {"found": False, "message": f"No information found for HTS {hts_code}"}

        # Find best match — prefer exact HTS prefix match
        best = None
        for m in matches:
            meta = m.get("metadata", {})
            m_hts = str(meta.get("hts_code", meta.get("hts", m.get("id", ""))))
            if m_hts.replace(".", "").startswith(hts_code.replace(".", "")):
                best = m
                break
        if not best:
            best = matches[0]

        meta = best.get("metadata", {})
        return {
            "found": True,
            "hts_code": str(meta.get("hts_code", meta.get("hts", best.get("id", "")))),
            "description": meta.get("description", ""),
            "chapter_code": meta.get("chapter_code", ""),
            "chapter_title": meta.get("chapter_title", ""),
            "section_code": meta.get("section_code", ""),
            "section_title": meta.get("section_title", ""),
            "general_rate": meta.get("general_rate", ""),
            "special_rate": meta.get("special_rate", ""),
            "units": meta.get("units", ""),
            "score": best.get("score", 0),
        }

    except Exception as e:
        print(f"Explain HTS error: {traceback.format_exc()}")
        return {"found": False, "error": str(e)}


def _run_cbp_lookup(query: str) -> Dict[str, Any]:
    """Search CBP rulings."""
    try:
        rulings = search_cbp_rulings(query=query, max_pages=1, page_size=5)
        return {
            "found": len(rulings) > 0,
            "count": len(rulings),
            "rulings": rulings[:5],
        }
    except Exception as e:
        print(f"CBP ruling lookup error: {traceback.format_exc()}")
        return {"found": False, "error": str(e)}


def _execute_tool(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatch a tool call to the appropriate function."""
    if name == "classify_product":
        return _run_classify(arguments["product_description"])
    elif name == "explain_hts":
        return _run_explain_hts(arguments["hts_code"])
    elif name == "cbp_ruling_lookup":
        return _run_cbp_lookup(arguments["query"])
    else:
        return {"error": f"Unknown tool: {name}"}


# ── Main chat handler ──────────────────────────────────────────────

def handle_chat(
    user_id: str,
    message: str,
    conversation_history: List[Dict[str, str]],
    app_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Handle a chat message from the user.

    Returns:
        {
            "response": str,               # The assistant's text response
            "classification_result": dict | None  # If classify tool was called
        }
    """
    api_key = get_secret("OPENAI_API_KEY")
    client = OpenAI(api_key=api_key, timeout=60.0)

    # Build messages array
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add app context as a system message if provided
    if app_context:
        ctx_parts = []
        if app_context.get("currentView"):
            ctx_parts.append(f"User is currently on the '{app_context['currentView']}' screen.")
        if app_context.get("selectedProduct"):
            ctx_parts.append(f"Selected product: {json.dumps(app_context['selectedProduct'])}")
        if app_context.get("lastClassification"):
            ctx_parts.append(f"Last classification result: {json.dumps(app_context['lastClassification'])}")
        if ctx_parts:
            messages.append({
                "role": "system",
                "content": "Current app context:\n" + "\n".join(ctx_parts),
            })

    # Add conversation history
    for msg in conversation_history:
        if msg.get("role") in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    # Add the new user message
    messages.append({"role": "user", "content": message})

    classification_result = None

    try:
        # First LLM call — may return tool calls
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3,
            max_tokens=1500,
        )

        assistant_msg = response.choices[0].message

        # If the model wants to call tools, execute them
        if assistant_msg.tool_calls:
            # Append assistant message with tool calls
            messages.append(assistant_msg)

            for tool_call in assistant_msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)

                print(f"Chat tool call: {fn_name}({fn_args})")
                tool_result = _execute_tool(fn_name, fn_args)

                # If classify was called, capture the result for the frontend
                if fn_name == "classify_product" and tool_result.get("type") == "answer":
                    classification_result = tool_result

                # Append tool result for the LLM
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result, default=str),
                })

            # Second LLM call — format the tool results into a nice response
            response2 = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.3,
                max_tokens=1500,
            )
            final_text = response2.choices[0].message.content or ""
        else:
            # No tool call — direct response
            final_text = assistant_msg.content or ""

    except Exception as e:
        print(f"Chat error: {traceback.format_exc()}")
        final_text = "Sorry, I encountered an error processing your request. Please try again."

    return {
        "response": final_text,
        "classification_result": classification_result,
    }
