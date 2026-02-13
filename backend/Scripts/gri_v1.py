import fitz, io, re
import os
from google.cloud import storage
from supabase import create_client
from datetime import datetime

# ---------------- CONFIG ----------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

TABLE_NAME = "hts_entries"

GCS_BUCKET = "corduroyai"
GCS_PDF_PATH = "tradedataraw/usitchts/finalCopy_2026HTSBasic.pdf"
START_PAGE = 20

# ---------------- INIT ----------------
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- REGEX ----------------
GRI_HEADER = re.compile(r"GENERAL RULES OF INTERPRETATION", re.I)
STOP_HEADER = re.compile(r"Additional U\.S\. Rules of Interpretation", re.I)
MAIN_RULE = re.compile(r"^(\d+)\.$")          # 1. 2. 3.
SUB_RULE  = re.compile(r"^\(([a-zA-Z])\)$")   # (a) (b) (c)
#RULE = re.compile(r"^\(?(\d+)\)?[\.\-]?\s+(.*)")
PAGE_HEADER = re.compile(
    r"Harmonized Tariff Schedule of the United States\s*\(2026\)|Annotated for Statistical Reporting Purposes",
    re.I
)


# ---------------- LOAD PDF ----------------
storage_client = storage.Client()
blob = storage_client.bucket(GCS_BUCKET).blob(GCS_PDF_PATH)

pdf_stream = io.BytesIO()
blob.download_to_file(pdf_stream)
pdf_stream.seek(0)

doc = fitz.open(stream=pdf_stream, filetype="pdf")

# ---------------- STATE ----------------
in_gri = False
current_main = None
#last_main_rule = None
buffer = ""
stop_doc = False 
current_parent=None
current_main_ref = None          # "1"
current_main_id = None           # DB id of rule 1
buffer_ref = None                # "1" or "1a"
buffer_parent_id = None     
rule_page_num=None
inserted_id=None
# ---------------- PROCESS ----------------
for i in range(START_PAGE, doc.page_count):
    if stop_doc:
        break  
    page = doc[i]
    page_num = i + 1

    blocks = page.get_text("blocks")

    for block in blocks:
        text = block[4].strip()
        #print("Printing block",text)
        #print("Printing GRI",in_gri)

        if not text:
            continue
        
        if text.startswith("Harmonized Tariff Schedule of the United States"):
            continue
           
        # Split block into real lines
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            
            print("Printing Line", repr(line))
            # --- START GRI ---
            if not in_gri and GRI_HEADER.search(line):
                in_gri = True
                continue

            # --- STOP GRI ---
            if in_gri and STOP_HEADER.search(line):
                if buffer:
                    print("In Stop GRI, Printing current Parent", current_parent)
                    res=supabase.table(TABLE_NAME).insert({
                        "page": rule_page_num,
                        "doc_type": "GRI",
                        "ref_id": current_parent,
                        "parent_id": buffer_parent_id,
                        "subtype": None,
                        "marker": current_main,
                        "seq": None,
                        "text": buffer.strip(),
                        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }).execute()
                inserted_id=res.data[0]["id"] 
                print("inserted id-last", inserted_id)
                in_gri = False
                last_main_rule = None
                buffer = ""
                stop_doc = True 
                current_parent = None
                break  # HARD STOP — no bleed into Additional

            if not in_gri:
                continue

            # --- NEW RULE ---
            m_main = MAIN_RULE.match(line)
            
            if m_main:
                if buffer:
                    
                    print("RuleMatch", current_parent)
                    
                    res= supabase.table(TABLE_NAME).insert({
                        "page": rule_page_num,
                        "doc_type": "GRI",
                        "ref_id": current_parent,
                        "parent_id": buffer_parent_id,
                        "subtype": current_parent,
                        "marker": current_main,
                        "seq": None,
                        "text": buffer.strip(),
                        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }).execute()
                    # if we just inserted a MAIN rule, store its id
                    if buffer_parent_id is None:
                        current_main_id =res.data[0]["id"] 
                
                inserted_id=res.data[0]["id"] 
                print("inserted id-main", inserted_id)
                current_main = m_main.group(1)
                current_parent = current_main
                buffer_parent_id=None
                buffer=""

            # --- SUB RULE ---
            m_sub = SUB_RULE.match(line)
            if m_sub:
                if buffer:
                    # save previous buffer
                    res=supabase.table(TABLE_NAME).insert({
                        "page": rule_page_num,
                        "doc_type": "GRI",
                        "ref_id": current_parent,
                        "parent_id": buffer_parent_id,
                        "subtype": current_parent,
                        "marker": current_main,
                        "seq": None,
                        "text": buffer.strip(),
                        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }).execute()
                    if buffer_parent_id is None:
                        current_main_id =res.data[0]["id"] 
                inserted_id=res.data[0]["id"]    
                current_parent = f"{current_main}{m_sub.group(1)}"
                buffer_parent_id = current_main_id  
                buffer = ""
                continue
            
            buffer += " " + line
            rule_page_num=page_num
            
            #current_rule_id=inserted_id
            


   
print("✅ GRI ingestion complete")
