"""
File Parser Service - Handles CSV, Excel, and PDF parsing for bulk classification.
Extracts raw row data from uploaded files.
"""

import csv
import io
import json
from typing import List, Dict, Any, Optional


def parse_file(file_content: bytes, file_name: str) -> List[Dict[str, Any]]:
    """
    Parse a file and return a list of row dicts.
    Dispatches to the correct parser based on file extension.
    """
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

    if ext == "csv":
        return parse_csv(file_content)
    elif ext in ("xlsx", "xls"):
        return parse_excel(file_content, ext)
    elif ext == "pdf":
        return parse_pdf(file_content)
    else:
        raise ValueError(f"Unsupported file type: .{ext}")


def parse_csv(file_content: bytes) -> List[Dict[str, Any]]:
    """Parse CSV file content into a list of row dicts."""
    text = file_content.decode("utf-8-sig")  # Handle BOM
    reader = csv.DictReader(io.StringIO(text))

    rows = []
    for i, row in enumerate(reader):
        # Skip completely empty rows
        if all(v is None or v.strip() == "" for v in row.values()):
            continue
        row["__row_number"] = i + 1
        rows.append(dict(row))

    return rows


def parse_excel(file_content: bytes, ext: str = "xlsx") -> List[Dict[str, Any]]:
    """Parse Excel file content into a list of row dicts."""
    try:
        import openpyxl
    except ImportError:
        raise ImportError(
            "openpyxl is required for Excel parsing. "
            "Install it with: pip install openpyxl"
        )

    wb = openpyxl.load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)

    # First row = headers
    raw_headers = next(rows_iter, None)
    if raw_headers is None:
        return []

    headers = [str(h).strip() if h is not None else f"column_{i}" for i, h in enumerate(raw_headers)]

    rows = []
    for i, raw_row in enumerate(rows_iter):
        # Skip completely empty rows
        if all(cell is None or (isinstance(cell, str) and cell.strip() == "") for cell in raw_row):
            continue

        row = {}
        for j, cell in enumerate(raw_row):
            if j < len(headers):
                row[headers[j]] = str(cell).strip() if cell is not None else ""
        row["__row_number"] = i + 1
        rows.append(row)

    wb.close()
    return rows


def parse_pdf(file_content: bytes) -> List[Dict[str, Any]]:
    """
    Parse PDF file content. Extracts text and attempts to find tabular data.
    Falls back to returning raw text blocks for LLM extraction.
    """
    try:
        import pdfplumber
    except ImportError:
        raise ImportError(
            "pdfplumber is required for PDF parsing. "
            "Install it with: pip install pdfplumber"
        )

    rows = []
    with pdfplumber.open(io.BytesIO(file_content)) as pdf:
        for page_num, page in enumerate(pdf.pages):
            # Try to extract tables first
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    headers = [str(h).strip() if h else f"column_{i}" for i, h in enumerate(table[0])]

                    for row_idx, raw_row in enumerate(table[1:]):
                        if all(cell is None or (isinstance(cell, str) and cell.strip() == "") for cell in raw_row):
                            continue

                        row = {}
                        for j, cell in enumerate(raw_row):
                            if j < len(headers):
                                row[headers[j]] = str(cell).strip() if cell else ""
                        row["__row_number"] = len(rows) + 1
                        row["__source_page"] = page_num + 1
                        rows.append(row)
            else:
                # No tables found — extract raw text for LLM processing
                text = page.extract_text()
                if text and text.strip():
                    rows.append({
                        "__raw_text": text.strip(),
                        "__row_number": len(rows) + 1,
                        "__source_page": page_num + 1,
                    })

    return rows


def get_headers(rows: List[Dict[str, Any]]) -> List[str]:
    """Extract column headers from parsed rows, excluding internal fields."""
    if not rows:
        return []
    return [k for k in rows[0].keys() if not k.startswith("__")]


def get_sample_rows(rows: List[Dict[str, Any]], n: int = 3) -> List[Dict[str, Any]]:
    """Get a sample of rows for column mapping, excluding internal fields."""
    sample = rows[:n]
    return [
        {k: v for k, v in row.items() if not k.startswith("__")}
        for row in sample
    ]
