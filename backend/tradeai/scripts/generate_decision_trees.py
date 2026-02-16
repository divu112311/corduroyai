"""
Bootstrap script: Generate decision trees for HTS chapters using LLM + chapter notes.

Reads chapter notes and HTS codes from Supabase, sends them to GPT-4o
to generate a decision-tree JSON, then stores it in the
`chapter_decision_trees` table with `reviewed = false`.

Usage:
    python -m scripts.generate_decision_trees --chapters 01 61 62
    python -m scripts.generate_decision_trees --priority
    python -m scripts.generate_decision_trees --all
    python -m scripts.generate_decision_trees --chapters 01 --dry-run
"""

import argparse
import json
import os
import re
import sys

from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.services.llm_call import call_llm
from app.services.supabase import supabase

PRIORITY_CHAPTERS = [
    "01", "02", "03", "04", "07", "08",
    "39", "42", "44",
    "61", "62", "63", "64",
    "71", "73",
    "84", "85", "87",
    "90", "94", "95",
]


def get_chapter_notes(chapter_code: str) -> str:
    """Fetch chapter notes from hts_entries."""
    try:
        normalized = str(int(chapter_code)).zfill(2)
        resp = (
            supabase.table("hts_entries")
            .select("marker, text")
            .eq("doc_type", "Chapters")
            .eq("ref_id", normalized)
            .execute()
        )
        groups = {}
        for row in resp.data or []:
            marker = row.get("marker", "default")
            text = (row.get("text") or "").strip()
            if text:
                groups.setdefault(marker, []).append(text)
        return "\n\n".join("\n".join(v) for v in groups.values())
    except Exception as e:
        print(f"  Error fetching chapter notes for {chapter_code}: {e}")
        return ""


def get_chapter_hts_codes(chapter_code: str) -> list:
    """Fetch 4/6/8-digit HTS headings for a chapter."""
    try:
        normalized = chapter_code.zfill(2)
        resp = (
            supabase.table("hts_us_8")
            .select("hts8, description")
            .like("hts8", f"{normalized}%")
            .limit(500)
            .execute()
        )
        codes = []
        for row in resp.data or []:
            codes.append({
                "hts": row.get("hts8", ""),
                "description": row.get("description", ""),
            })
        return codes
    except Exception as e:
        print(f"  Error fetching HTS codes for chapter {chapter_code}: {e}")
        return []


def generate_tree(chapter_code: str, notes: str, codes: list) -> dict:
    """Use LLM to generate a decision tree from chapter notes and codes."""
    codes_text = "\n".join(
        f"  {c['hts']} - {c['description']}"
        for c in codes[:100]
    )

    prompt = f"""You are building a structured decision tree for HTS Chapter {chapter_code}.

CHAPTER NOTES:
{notes[:4000]}

HTS CODES IN THIS CHAPTER:
{codes_text}

Generate a decision tree that a customs broker would mentally follow to classify
a product in this chapter. The tree should:

1. Start with the most important distinguishing question (e.g., "Is it live or dead?", "Is it woven or knitted?")
2. Each node is either a QUESTION or a LEAF (final classification)
3. Questions should map to product attributes like: material, use, form, processing, weight, size, gender, age_group
4. Branches should cover common answers plus a "default" fallback
5. Leaf nodes should reference specific HTS codes

Use this exact JSON structure:
{{
  "chapter": "{chapter_code}",
  "title": "chapter title",
  "root": {{
    "type": "question",
    "question": "What is the main distinguishing factor?",
    "attribute": "material",
    "branches": {{
      "cotton": {{
        "type": "question",
        "question": "Next distinguishing question?",
        "attribute": "form",
        "branches": {{
          "woven": {{
            "type": "leaf",
            "hts": "52.08",
            "description": "Woven fabrics of cotton",
            "reasoning": "GRI 1 - terms of heading"
          }},
          "default": {{
            "type": "leaf",
            "hts": "52.09",
            "description": "Other cotton fabrics",
            "reasoning": "GRI 1 with default"
          }}
        }}
      }},
      "default": {{
        "type": "leaf",
        "hts": "{chapter_code}.99",
        "description": "Other products of chapter {chapter_code}",
        "reasoning": "Default classification"
      }}
    }}
  }}
}}

IMPORTANT:
- Make the tree PRACTICAL — focus on the top 10-15 most common product types in this chapter
- Use real HTS codes from the list provided
- Include "default" branches for unknown cases
- Keep it to 3-4 levels deep maximum
- The attribute names should be: material, use, form, processing, weight, size, gender, age_group, animal_type, plant_type, state (live/dead/fresh/frozen)

Respond with ONLY valid JSON."""

    result = call_llm(
        provider="openai",
        model="gpt-4o",
        prompt=prompt,
        system_prompt="You are a customs classification expert creating structured decision trees for HTS chapters. Respond with valid JSON only.",
        temperature=0.1,
        max_tokens=4000,
    )

    text = result.get("text", "")
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.DOTALL).strip()
    return json.loads(cleaned)


def save_tree(chapter_code: str, tree: dict, dry_run: bool = False):
    """Save or upsert the tree into Supabase."""
    normalized = chapter_code.zfill(2)

    if dry_run:
        print(f"  [DRY RUN] Would save tree for chapter {normalized}")
        print(f"  Tree root question: {tree.get('root', {}).get('question', 'N/A')}")
        return

    try:
        existing = (
            supabase.table("chapter_decision_trees")
            .select("id, version")
            .eq("chapter_code", normalized)
            .execute()
        )

        if existing.data:
            row = existing.data[0]
            new_version = (row.get("version") or 1) + 1
            supabase.table("chapter_decision_trees").update({
                "tree": json.dumps(tree) if isinstance(tree, dict) else tree,
                "version": new_version,
                "reviewed": False,
            }).eq("id", row["id"]).execute()
            print(f"  Updated chapter {normalized} tree (v{new_version})")
        else:
            supabase.table("chapter_decision_trees").insert({
                "chapter_code": normalized,
                "chapter_title": tree.get("title", f"Chapter {normalized}"),
                "tree": json.dumps(tree) if isinstance(tree, dict) else tree,
                "version": 1,
                "reviewed": False,
            }).execute()
            print(f"  Created chapter {normalized} tree (v1)")

    except Exception as e:
        print(f"  Error saving tree for chapter {normalized}: {e}")


def process_chapter(chapter_code: str, dry_run: bool = False):
    """Generate and save a decision tree for one chapter."""
    normalized = chapter_code.zfill(2)
    print(f"\n{'='*50}")
    print(f"Processing Chapter {normalized}")
    print(f"{'='*50}")

    notes = get_chapter_notes(normalized)
    if not notes:
        print(f"  No chapter notes found — skipping")
        return

    codes = get_chapter_hts_codes(normalized)
    print(f"  Found {len(codes)} HTS codes, {len(notes)} chars of notes")

    if not codes:
        print(f"  No HTS codes found — skipping")
        return

    try:
        tree = generate_tree(normalized, notes, codes)
        print(f"  Generated tree with root question: {tree.get('root', {}).get('question', 'N/A')}")
        save_tree(normalized, tree, dry_run)
    except Exception as e:
        print(f"  Error generating tree: {e}")


def main():
    parser = argparse.ArgumentParser(description="Generate HTS decision trees")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--chapters", nargs="+", help="Specific chapter codes (e.g., 01 61 62)")
    group.add_argument("--priority", action="store_true", help="Process priority chapters")
    group.add_argument("--all", action="store_true", help="Process all chapters 01-99")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    args = parser.parse_args()

    if args.chapters:
        chapters = [c.zfill(2) for c in args.chapters]
    elif args.priority:
        chapters = PRIORITY_CHAPTERS
    else:
        chapters = [str(i).zfill(2) for i in range(1, 100)]

    print(f"Processing {len(chapters)} chapters: {', '.join(chapters)}")
    if args.dry_run:
        print("[DRY RUN MODE — no data will be saved]")

    for ch in chapters:
        process_chapter(ch, args.dry_run)

    print(f"\nDone. Processed {len(chapters)} chapters.")


if __name__ == "__main__":
    main()
