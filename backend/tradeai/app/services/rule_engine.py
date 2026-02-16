"""
Rule Engine for HTS Classification Verification.

Loads GRI rules, chapter notes, and section notes from Supabase.
Walks decision trees (if available) for deterministic classification.
Falls back to LLM with full rule context when no tree exists.
Calculates confidence based on resolution quality (DRS, DM, AS, IC).
"""

import json
import re
from typing import Optional
from app.services.llm_call import call_llm


class RuleEngine:
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self._gri_rules = None
        self._chapter_notes = {}
        self._section_notes = {}
        self._decision_trees = {}

    # ── Text Reconstruction (marker-grouping) ──

    def _reconstruct_by_marker(self, rows: list) -> dict:
        """Group rows by marker and join text fragments."""
        groups = {}
        for row in rows:
            marker = row.get("marker") or row.get("ref_id") or "unknown"
            text = (row.get("text") or "").strip()
            if text:
                groups.setdefault(marker, []).append(text)
        return {k: "\n".join(v) for k, v in groups.items()}

    # ── Data Loaders ──

    def _load_gri_rules(self) -> dict:
        if self._gri_rules is not None:
            return self._gri_rules
        try:
            resp = (
                self.supabase.table("hts_entries")
                .select("ref_id, marker, text")
                .eq("doc_type", "GRI")
                .execute()
            )
            self._gri_rules = self._reconstruct_by_marker(resp.data or [])
        except Exception as e:
            print(f"Failed to load GRI rules: {e}")
            self._gri_rules = {}
        return self._gri_rules

    def _load_chapter_notes(self, chapter_code: str) -> str:
        if chapter_code in self._chapter_notes:
            return self._chapter_notes[chapter_code]
        try:
            normalized = str(int(chapter_code)).zfill(2)
            resp = (
                self.supabase.table("hts_entries")
                .select("ref_id, marker, text")
                .eq("doc_type", "Chapters")
                .eq("ref_id", normalized)
                .execute()
            )
            groups = self._reconstruct_by_marker(resp.data or [])
            combined = "\n\n".join(groups.values())
            self._chapter_notes[chapter_code] = combined
        except Exception as e:
            print(f"Failed to load chapter notes for {chapter_code}: {e}")
            self._chapter_notes[chapter_code] = ""
        return self._chapter_notes[chapter_code]

    def _load_section_notes(self, section_code: str) -> str:
        if section_code in self._section_notes:
            return self._section_notes[section_code]
        try:
            resp = (
                self.supabase.table("hts_entries")
                .select("ref_id, marker, text")
                .eq("doc_type", "Sections")
                .eq("ref_id", section_code)
                .execute()
            )
            groups = self._reconstruct_by_marker(resp.data or [])
            combined = "\n\n".join(groups.values())
            self._section_notes[section_code] = combined
        except Exception as e:
            print(f"Failed to load section notes for {section_code}: {e}")
            self._section_notes[section_code] = ""
        return self._section_notes[section_code]

    def _load_decision_tree(self, chapter_code: str) -> Optional[dict]:
        if chapter_code in self._decision_trees:
            return self._decision_trees[chapter_code]
        try:
            normalized = str(int(chapter_code)).zfill(2)
            resp = (
                self.supabase.table("chapter_decision_trees")
                .select("tree, reviewed")
                .eq("chapter_code", normalized)
                .execute()
            )
            rows = resp.data or []
            if rows and rows[0].get("tree"):
                tree = rows[0]["tree"]
                if isinstance(tree, str):
                    tree = json.loads(tree)
                self._decision_trees[chapter_code] = tree
                return tree
        except Exception as e:
            print(f"No decision tree for chapter {chapter_code}: {e}")
        self._decision_trees[chapter_code] = None
        return None

    # ── Decision Tree Walker ──

    def _walk_tree(self, tree: dict, attributes: dict) -> dict:
        """Walk a decision tree and return classification result."""
        node = tree
        path = []
        resolved = False

        while node:
            node_type = node.get("type", "")

            if node_type == "leaf":
                path.append(f"→ Leaf: {node.get('hts', 'unknown')}")
                return {
                    "hts": node.get("hts"),
                    "description": node.get("description", ""),
                    "reasoning": node.get("reasoning", ""),
                    "path": path,
                    "resolved": True,
                    "method": "decision_tree",
                }

            if node_type == "question":
                question = node.get("question", "")
                attribute = node.get("attribute", "")
                path.append(f"? {question} (checking: {attribute})")

                value = attributes.get(attribute, "").strip().lower() if isinstance(attributes.get(attribute), str) else attributes.get(attribute)

                if not value and value != 0:
                    return {
                        "missing_attribute": attribute,
                        "question": question,
                        "path": path,
                        "resolved": False,
                        "method": "decision_tree",
                    }

                branches = node.get("branches", {})
                matched_branch = None

                for branch_key, branch_node in branches.items():
                    if self._evaluate_condition(branch_key, value):
                        matched_branch = branch_node
                        path.append(f"  ✓ {attribute} = {value} → branch: {branch_key}")
                        break

                if matched_branch is None:
                    default = branches.get("default") or branches.get("other")
                    if default:
                        matched_branch = default
                        path.append(f"  → default branch for {attribute} = {value}")
                    else:
                        return {
                            "path": path,
                            "resolved": False,
                            "reason": f"No matching branch for {attribute}={value}",
                            "method": "decision_tree",
                        }

                node = matched_branch
            else:
                break

        return {"path": path, "resolved": False, "method": "decision_tree"}

    def _evaluate_condition(self, condition_key: str, value) -> bool:
        """Evaluate a branch condition against an attribute value."""
        condition_key = str(condition_key).strip().lower()
        value_str = str(value).strip().lower() if value is not None else ""

        if condition_key == value_str:
            return True
        if condition_key.startswith("contains:"):
            keyword = condition_key.split(":", 1)[1].strip()
            return keyword in value_str
        if condition_key.startswith("in:"):
            options = [o.strip() for o in condition_key.split(":", 1)[1].split(",")]
            return value_str in options
        if condition_key.startswith("not:"):
            excluded = condition_key.split(":", 1)[1].strip()
            return value_str != excluded
        return False

    # ── LLM Fallback ──

    def _llm_fallback(self, attributes: dict, candidates: list, chapter_code: str, section_code: str = "") -> dict:
        """Use LLM with full rule text for verification."""
        gri_rules = self._load_gri_rules()
        chapter_notes = self._load_chapter_notes(chapter_code)
        section_notes = self._load_section_notes(section_code) if section_code else ""

        gri_text = "\n\n".join(f"GRI {k}: {v}" for k, v in gri_rules.items()) if gri_rules else "GRI rules not available."
        chapter_text = chapter_notes or "No chapter notes available."
        section_text = section_notes or "No section notes available."

        candidates_text = "\n".join(
            f"  {i+1}. HTS {c.get('hts')} - {c.get('description')} (score: {c.get('score', 0):.2f})"
            for i, c in enumerate(candidates[:10])
        )

        prompt = f"""You are a customs classification expert verifying HTS candidates against official rules.

PRODUCT ATTRIBUTES:
{json.dumps(attributes, indent=2)}

CANDIDATE HTS CODES:
{candidates_text}

GENERAL RULES OF INTERPRETATION:
{gri_text[:3000]}

CHAPTER {chapter_code} NOTES:
{chapter_text[:3000]}

SECTION NOTES:
{section_text[:2000]}

TASK:
1. Apply GRI rules in order (GRI 1 first, then GRI 2-6 only if needed).
2. Check each candidate against chapter notes and section notes for exclusions or special provisions.
3. For EACH candidate, determine:
   - Does it pass GRI 1 (terms of the heading)?
   - Are there any chapter note exclusions?
   - Is additional information needed to classify?

Respond ONLY with JSON:
{{
  "verified_candidates": [
    {{
      "hts": "the HTS code",
      "status": "verified" | "excluded" | "uncertain",
      "checks_passed": ["list of rules/notes that support this classification"],
      "checks_failed": ["list of rules/notes that exclude or contradict"],
      "missing_info": ["info needed to confirm"],
      "gri_applied": ["GRI 1", ...],
      "applicable_notes": ["Chapter Note 2(a)", ...],
      "reasoning": "1-2 sentence explanation"
    }}
  ],
  "questions": ["clarifying questions if info is ambiguous"],
  "overall_gri": "which GRI rule primarily determined the classification",
  "confidence_factors": {{
    "deterministic_resolution": 0.0-1.0,
    "decision_margin": 0.0-1.0,
    "attribute_stability": 0.0-1.0,
    "information_completeness": 0.0-1.0
  }}
}}"""

        try:
            result = call_llm(
                provider="openai",
                model="gpt-4o",
                prompt=prompt,
                system_prompt="You are a customs classification expert. Verify HTS candidates against official GRI rules, chapter notes, and section notes. Always respond with valid JSON only.",
                temperature=0,
                max_tokens=2000,
            )

            text = result.get("text", "")
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.DOTALL).strip()
            parsed = json.loads(cleaned)
            parsed["method"] = "llm_with_rules"
            return parsed

        except Exception as e:
            print(f"LLM fallback error: {e}")
            return {
                "verified_candidates": [],
                "questions": [],
                "method": "llm_with_rules",
                "error": str(e),
            }

    # ── Confidence Calculation ──

    def _calculate_confidence(self, factors: dict) -> float:
        """
        Calculate confidence based on resolution quality.
        Weights: DRS=0.35, DM=0.30, AS=0.20, IC=0.15
        """
        drs = float(factors.get("deterministic_resolution", 0.5))
        dm = float(factors.get("decision_margin", 0.5))
        a_s = float(factors.get("attribute_stability", 0.5))
        ic = float(factors.get("information_completeness", 0.5))

        confidence = (drs * 0.35) + (dm * 0.30) + (a_s * 0.20) + (ic * 0.15)
        return round(min(1.0, max(0.0, confidence)), 3)

    # ── Main Verify Entry Point ──

    def verify_candidates(self, attributes: dict, candidates: list) -> dict:
        """
        Verify Pinecone candidates against rules.
        Returns verification result with confidence and optional clarifying questions.
        """
        if not candidates:
            return {
                "confident": False,
                "questions": ["What product are you trying to classify?"],
                "trace": "No candidates to verify.",
                "verified_candidates": [],
            }

        chapter_code = ""
        section_code = ""
        if candidates:
            hts = candidates[0].get("hts", "")
            chapter_code = hts[:2] if len(hts) >= 2 else ""

        trace_parts = [f"Verifying {len(candidates)} candidates for chapter {chapter_code}"]

        # Try decision tree first
        tree = self._load_decision_tree(chapter_code) if chapter_code else None

        if tree:
            trace_parts.append("Decision tree found — walking tree...")
            tree_result = self._walk_tree(tree, attributes)
            trace_parts.extend(tree_result.get("path", []))

            if tree_result.get("resolved"):
                trace_parts.append(f"Tree resolved to: {tree_result.get('hts')}")
                return {
                    "confident": True,
                    "method": "decision_tree",
                    "resolved_hts": tree_result.get("hts"),
                    "reasoning": tree_result.get("reasoning", ""),
                    "trace": "\n".join(trace_parts),
                    "verified_candidates": [{
                        "hts": tree_result.get("hts"),
                        "status": "verified",
                        "checks_passed": ["Decision tree resolution"],
                        "checks_failed": [],
                        "missing_info": [],
                        "gri_applied": [],
                        "applicable_notes": [],
                        "reasoning": tree_result.get("reasoning", ""),
                    }],
                    "confidence_factors": {
                        "deterministic_resolution": 1.0,
                        "decision_margin": 0.9,
                        "attribute_stability": 0.8,
                        "information_completeness": 0.9,
                    },
                    "questions": [],
                }

            if not tree_result.get("resolved") and tree_result.get("missing_attribute"):
                question = tree_result.get("question", f"What is the {tree_result['missing_attribute']}?")
                trace_parts.append(f"Tree needs more info: {question}")
                return {
                    "confident": False,
                    "method": "decision_tree",
                    "questions": [question],
                    "trace": "\n".join(trace_parts),
                    "verified_candidates": [],
                    "partial_matches": candidates[:5],
                }

        # LLM fallback
        trace_parts.append("No decision tree (or tree incomplete) — using LLM with rules...")
        llm_result = self._llm_fallback(attributes, candidates, chapter_code, section_code)
        trace_parts.append(f"LLM verification complete. Method: {llm_result.get('method')}")

        verified = llm_result.get("verified_candidates", [])
        questions = llm_result.get("questions", [])
        confidence_factors = llm_result.get("confidence_factors", {
            "deterministic_resolution": 0.5,
            "decision_margin": 0.5,
            "attribute_stability": 0.5,
            "information_completeness": 0.5,
        })

        rule_confidence = self._calculate_confidence(confidence_factors)
        trace_parts.append(f"Rule confidence: {rule_confidence}")

        has_verified = any(v.get("status") == "verified" for v in verified)
        has_too_many_questions = len(questions) >= 2
        low_confidence = rule_confidence < 0.45

        confident = has_verified and not has_too_many_questions and not low_confidence

        if not confident and not questions:
            questions = ["Could you provide more details about the product's intended use and material composition?"]

        return {
            "confident": confident,
            "method": llm_result.get("method", "llm_with_rules"),
            "verified_candidates": verified,
            "questions": questions,
            "overall_gri": llm_result.get("overall_gri", ""),
            "confidence_factors": confidence_factors,
            "rule_confidence": rule_confidence,
            "trace": "\n".join(trace_parts),
            "partial_matches": candidates[:5] if not confident else [],
        }
