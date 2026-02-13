import json
import os
import time
from supabase import create_client
#from google import genai
#from google.genai import types as genai_types
from openai import OpenAI

# ------------ CONFIG ------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

#PROJECT = "project-1fe125c4-7788-4a50-8cf"
#LOCATION = "global"  # recommended for Gemini models
#GENAI_MODEL = "gemini-2.5-flash"  # or another available Gemini model

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

#genai_client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
openai_client = OpenAI(api_key=OPENAI_API_KEY)
# ------------ Fetch from Supabase ------------
def get_chapters():
    response = supabase.table("chapters").select(
        "id, code, title, section_id"
    ).execute()
    return response.data or []

def save_chapter_summaries(summaries: dict, filename="chapter_summaries.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(summaries, f, indent=2, ensure_ascii=False)

def get_sections():
    response = supabase.table("sections").select(
        "id, code, title"
    ).execute()
    return {row["id"]: row for row in response.data}

def get_chapter_notes():
    response = supabase.table("hts_entries").select(
        "ref_id, text"
    ).eq("doc_type", "Chapters").execute()

    notes = {}
    for row in response.data:
        # ref_id contains chapter number like "01"
        #notes.setdefault(row["ref_id"], []).append(row["text"])
        ref = str(row["ref_id"]).strip().zfill(2)
        notes.setdefault(ref, []).append(row["text"])
    # join multi-row notes
    return {k: "\n".join(v) for k, v in notes.items()}

def get_section_notes():
    response = supabase.table("hts_entries").select(
        "ref_id, text"
    ).eq("doc_type", "Sections").execute()

    notes = {}
    for row in response.data:
        # ref_id contains section code like "I"
        notes.setdefault(row["ref_id"], []).append(row["text"])

    return {k: "\n".join(v) for k, v in notes.items()}


# ------------ Gemini Prompt Generation ------------
import json
import re
#from google.genai import types as genai_types

MAX_NOTE_LENGTH = 4000  # limit characters per note to avoid model overload
# ------------ Gemini Summarization Helpers ------------
MAX_CHUNK_SIZE = 4000  # approx characters per chunk

def chunk_text(text: str, max_chars: int = MAX_CHUNK_SIZE) -> list[str]:
    words = text.split()
    chunks, current, count = [], [], 0
    for w in words:
        count += len(w) + 1
        current.append(w)
        if count >= max_chars:
            chunks.append(" ".join(current))
            current, count = [], 0
    if current:
        chunks.append(" ".join(current))
    return chunks

def summarize_chunk_openai(chunk: str) -> str:
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You summarize HTS chapter text in concise bullet points."},
                {"role": "user", "content": f"Summarize the following HTS chapter text in concise bullet points, keeping key materials, functions, and context:\n\n{chunk}\n\nRespond ONLY in concise bullet points."}
            ],
            max_tokens=1000,
            temperature=0.1
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"⚠️ Chunk summarize failed: {e}")
        return ""


def summarize_chapter_openai(text: str) -> str:
    chunks = chunk_text(text)
    print(f"  Chunks count: {len(chunks)}")
    summaries = [summarize_chunk_openai(c) for c in chunks]
    
    for i, s in enumerate(summaries[:3]):
        print(f"  Chunk {i+1}:", s[:200])
    
    # merge summaries into one
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You combine bullet point summaries into a single concise summary."},
                {"role": "user", "content": f"Combine the following bullet point summaries into a single concise summary, removing duplicates:\n\n{chr(10).join(summaries)}"}
            ],
            max_tokens=2500,
            temperature=0.1
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"⚠️ Merge summary failed: {e}")
        return "\n".join(summaries)


def call_openai_for_mapping(chapter_number, section_code, section_title, chapter_notes, section_notes): 
    """
    Call OpenAI model for materials, functions, synonyms.
    """
    prompt_text = f"""
You are an expert in HTS chapter classification.

Chapter: {chapter_number}
Section: {section_code} - {section_title}
Chapter Notes: {chapter_notes}
Section Notes: {section_notes}

Task:
1. Extract three lists: "materials", "functions", "synonyms".
2. "materials" = specific tangible items or substances mentioned in the notes.
   - Avoid generic terms like "products", "items", "stuff".
3. "functions" = common uses, purposes, or roles of the materials.
   - Always try to infer functions from context; never leave empty if the notes suggest a function.
4. "synonyms" = alternative names, related terms, or specific descriptors of the materials.

Requirements:
- Return ONLY valid JSON in **lowercase** with **no duplicates**.
- Example format:
{{
  "materials": ["live animals", "dried fish", "vegetable oils"],
  "functions": ["consumption", "medicinal use", "agglomeration"],
  "synonyms": ["pellets", "freeze-dried products", "oleaginous fruits"]
}}

Important:
- Include all relevant information from chapter and section notes.
- Make lists precise; do not include generic placeholders.

Respond ONLY with JSON.
"""
    try:
        print(f"\n📄 Chapter Notes preview: {chapter_notes[:300]}...")
        print(f"\n📄 Section Notes preview: {section_notes[:300]}...")
        
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You extract materials, functions, and synonyms from HTS chapter notes. Always respond with valid JSON only."},
                {"role": "user", "content": prompt_text}
            ],
            max_tokens=2500,
            temperature=0
        )
        
        raw_text = response.choices[0].message.content
        print(f"\n💬 OpenAI returned: {raw_text[:500]}...")
        
        # Parse JSON from response
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if match:
            json_text = match.group()
            return json.loads(json_text)
        else:
            print(f"⚠️ No JSON found in output for chapter {chapter_number}")
            
    except Exception as e:
        print(f"⚠️ OpenAI call failed for chapter {chapter_number}: {e}")
    
    return {"materials": [], "functions": [], "synonyms": []}


# ------------ Build Full Mapping ------------
def build_chapter_mapping_dynamic():
    chapters = get_chapters()
 
    sections = get_sections()  
    chapter_notes_map = get_chapter_notes()
    section_notes_map = get_section_notes()
   
    
    output_file = "chapter_mapping_gemini.json"
    summaries_file = "chapter_summaries.json"
    
    mapping = {}
    
    if os.path.exists(output_file):
        with open(output_file, "r") as f:
            mapping = json.load(f)
        print(f"📂 Loaded {len(mapping)} already processed chapters")
        
        # Remove last chapter (might be incomplete)
        if mapping:
            last_key = list(mapping.keys())[-1]
            del mapping[last_key]
            print(f"🔄 Will redo last chapter {last_key} (might be incomplete)")
    
    chapter_summaries = {}
    
    if os.path.exists(summaries_file):
        with open(summaries_file, "r") as f:
            chapter_summaries = json.load(f)
        print(f"📂 Loaded {len(chapter_summaries)} existing summaries")
        
        # Remove last summary too
        if chapter_summaries:
            last_key = list(chapter_summaries.keys())[-1]
            if last_key in chapter_summaries:
                del chapter_summaries[last_key]
                print(f"🔄 Will redo last summary {last_key}")
    
    # Initialize empty file
    #with open(output_file, "w") as f:
    #   json.dump({}, f)
    
    #for ch in chapters:
    # --- chapter code ---
    total_chapters = len(chapters)
    for idx, ch in enumerate(chapters):
        chap_code = str(ch["code"]).zfill(2)
        
        if chap_code in mapping:
            print(f"⏭️ [{idx+1}/{total_chapters}] Skipping chapter {chap_code} - already done")
            continue
        
        print(f"\n🔄 [{idx+1}/{total_chapters}] Processing chapter {chap_code}...")
    # --- section lookup ---
        section = sections.get(ch["section_id"])
        section_code = section["code"] if section else ""
        section_title = section["title"] if section else ""

    # --- notes lookup ---
        chapter_notes = chapter_notes_map.get(chap_code, "")
        section_notes = section_notes_map.get(section_code, "")

        chapter_summary = summarize_chapter_openai(chapter_notes)
    
        chapter_summaries[chap_code] = {
            "chapter_code": chap_code,
            "chapter_title": ch["title"],
            "section_code": section_code,
            "section_title": section_title,
            "summary": chapter_summary
        }
# --- LLM call using summary ---
        llm_output = call_openai_for_mapping(
            chap_code,
            section_code,
            section_title,
            chapter_summary,  # pass summarized notes instead of full notes
            section_notes
        )

    
    # --- final mapping ---
        mapping[chap_code] = {
            "section": section_code,
            "section_title": section_title,
            "materials": llm_output.get("materials", []),
            "functions": llm_output.get("functions", []),
            "synonyms": llm_output.get("synonyms", []),
        }

        print("📘 Chapter note keys:", sorted(chapter_notes_map.keys())[:10])

        with open(output_file, "w") as f:
            json.dump(mapping, f, indent=2, ensure_ascii=False)
    
        save_chapter_summaries(chapter_summaries)

        with open("chapter_summaries.json", "w", encoding="utf-8") as f:
            json.dump(chapter_summaries, f, indent=2, ensure_ascii=False)

        print("✅ chapter_summaries.json written to disk")
    
    return mapping

# ------------ Write to File ------------
if __name__ == "__main__":
    chapter_mapping = build_chapter_mapping_dynamic()
    print("✅ Generated chapter_mapping_gemini.json")
