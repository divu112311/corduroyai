import json
import pandas as pd

def load_hts_json(json_path):
    """
    Load the HTS JSON file
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} HTS entries")
    return data

def parse_hts_hierarchy(hts_data):
    """
    Parse the flat JSON into hierarchical structure
    """
    
    hierarchy = {
        'sections': [],
        'chapters': {},
        'headings': {},
        'subheadings': {}
    }
    
    current_section = None
    current_chapter = None
    current_heading = None
    current_superior = None  # Track superior entries
    
    for entry in hts_data:
        htsno = entry.get('htsno', '').strip()
        indent = int(entry.get('indent', 0))
        description = entry.get('description', '').strip()
        is_superior = entry.get('superior') == 'true'
        
        # Skip empty entries
        if not description:
            continue
        
        # Detect sections (usually indent 0, no htsno, SECTION in description)
        if not htsno and 'SECTION' in description.upper():
            current_section = {
                'title': description,
                'indent': indent,
                'chapters': []
            }
            hierarchy['sections'].append(current_section)
            continue
        
        # Chapter level (2 or 4 digits, indent typically 0)
        if htsno and len(htsno) <= 4 and '.' not in htsno:
            current_chapter = {
                'number': htsno,
                'description': description,
                'indent': indent,
                'section': current_section,
                'headings': [],
                'metadata': {
                    'units': entry.get('units', []),
                    'general_rate': entry.get('general', ''),
                    'special_rate': entry.get('special', ''),
                    'other_rate': entry.get('other', ''),
                    'footnotes': entry.get('footnotes', [])
                }
            }
            hierarchy['chapters'][htsno] = current_chapter
            if current_section:
                current_section['chapters'].append(current_chapter)
            current_heading = None  # Reset heading context
            continue
        
        # Superior entries (grouping labels without HTS codes)
        if is_superior or (not htsno and indent > 0):
            current_superior = {
                'description': description,
                'indent': indent
            }
            continue
        
        # Parse actual tariff lines (with periods: 0101.21.00)
        if '.' in htsno:
            parts = htsno.split('.')
            
            # 4-digit heading (e.g., 0101.21 becomes base 0101)
            base_heading = parts[0]
            
            # Determine if this is a heading or subheading by decimal places
            decimal_part = ''.join(parts[1:])
            
            # 6-digit (heading level): 0101.21
            if len(htsno.replace('.', '')) == 6:
                current_heading = {
                    'code': htsno,
                    'base': base_heading,
                    'description': description,
                    'indent': indent,
                    'chapter': current_chapter,
                    'superior': current_superior,
                    'subheadings': [],
                    'metadata': {
                        'units': entry.get('units', []),
                        'general_rate': entry.get('general', ''),
                        'special_rate': entry.get('special', ''),
                        'other_rate': entry.get('other', ''),
                        'footnotes': entry.get('footnotes', []),
                        'quota_quantity': entry.get('quotaQuantity', ''),
                        'additional_duties': entry.get('additionalDuties', '')
                    }
                }
                hierarchy['headings'][htsno] = current_heading
                if current_chapter:
                    current_chapter['headings'].append(current_heading)
            
            # 8+ digit (subheading level): 0101.21.00, 0101.21.00.10
            else:
                subheading = {
                    'code': htsno,
                    'base': base_heading,
                    'description': description,
                    'indent': indent,
                    'chapter': current_chapter,
                    'heading': current_heading,
                    'superior': current_superior,
                    'metadata': {
                        'units': entry.get('units', []),
                        'general_rate': entry.get('general', ''),
                        'special_rate': entry.get('special', ''),
                        'other_rate': entry.get('other', ''),
                        'footnotes': entry.get('footnotes', []),
                        'quota_quantity': entry.get('quotaQuantity', ''),
                        'additional_duties': entry.get('additionalDuties', '')
                    }
                }
                hierarchy['subheadings'][htsno] = subheading
                if current_heading:
                    current_heading['subheadings'].append(subheading)
    
    return hierarchy

# Load and parse
hts_data = load_hts_json('hts.json')
hierarchy = parse_hts_hierarchy(hts_data)

print("\nHierarchy Statistics:")
print(f"  Sections: {len(hierarchy['sections'])}")
print(f"  Chapters: {len(hierarchy['chapters'])}")
print(f"  Headings: {len(hierarchy['headings'])}")
print(f"  Subheadings: {len(hierarchy['subheadings'])}")