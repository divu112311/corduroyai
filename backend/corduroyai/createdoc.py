def create_embedding_documents(hierarchy, notes_db):
    """
    Create rich documents combining HTS data + notes
    """
    
    documents = []
    
    # Process all subheadings (most specific level)
    for hts_code, subheading in hierarchy['subheadings'].items():
        doc_parts = []
        
        # 1. Core HTS information
        doc_parts.append(f"HTS Code: {hts_code}")
        doc_parts.append(f"Description: {subheading['description']}")
        
        # 2. Add superior/grouping context if exists
        if subheading.get('superior'):
            doc_parts.append(f"Category: {subheading['superior']['description']}")
        
        # 3. Parent heading context
        if subheading.get('heading'):
            heading = subheading['heading']
            doc_parts.append(f"Heading {heading['code']}: {heading['description']}")
        
        # 4. Chapter context
        if subheading.get('chapter'):
            chapter = subheading['chapter']
            doc_parts.append(f"Chapter {chapter['number']}: {chapter['description']}")
        
        # 5. Section context
        if subheading.get('chapter') and subheading['chapter'].get('section'):
            section = subheading['chapter']['section']
            doc_parts.append(f"Section: {section['title']}")
        
        # 6. Get applicable notes from database
        chapter_num = hts_code[:2] if len(hts_code) >= 2 else None
        if chapter_num:
            # Chapter notes
            chapter_notes = notes_db.get_chapter_notes(chapter_num)
            for note in chapter_notes[:5]:  # Limit to top 5 most relevant
                doc_parts.append(f"Chapter Note: {note['note_text']}")
            
            # Section notes
            section_notes = notes_db.get_section_notes_for_chapter(chapter_num)
            for note in section_notes[:3]:
                doc_parts.append(f"Section Note: {note['note_text']}")
        
        # 7. Extract semantic features from description
        description_text = subheading['description']
        
        materials = extract_materials(description_text)
        if materials:
            doc_parts.append(f"Materials: {', '.join(materials)}")
        
        functions = extract_functions(description_text)
        if functions:
            doc_parts.append(f"Functions: {', '.join(functions)}")
        
        # 8. Add unit information (important for classification)
        units = subheading['metadata'].get('units', [])
        if units:
            doc_parts.append(f"Unit of Quantity: {', '.join(units)}")
        
        # 9. Add footnotes (can contain classification hints)
        footnotes = subheading['metadata'].get('footnotes', [])
        for footnote in footnotes:
            if footnote.get('value'):
                doc_parts.append(f"Note: {footnote['value']}")
        
        # 10. Generate synonyms/variations
        synonyms = generate_product_synonyms(description_text)
        if synonyms:
            doc_parts.append(f"Also known as: {', '.join(synonyms)}")
        
        # Combine all parts
        document_text = "\n".join(doc_parts)
        
        # Create document with metadata
        documents.append({
            'id': hts_code,
            'text': document_text,
            'metadata': {
                'hts_code': hts_code,
                'description': subheading['description'],
                'chapter': chapter_num,
                'indent_level': subheading['indent'],
                'units': units,
                'general_rate': subheading['metadata'].get('general_rate', ''),
                'materials': materials,
                'functions': functions,
                'has_footnotes': len(footnotes) > 0,
                'has_quota': bool(subheading['metadata'].get('quota_quantity'))
            }
        })
    
    # Also process headings (6-digit level)
    for hts_code, heading in hierarchy['headings'].items():
        # Similar process but at heading level
        doc_parts = []
        doc_parts.append(f"HTS Code: {hts_code}")
        doc_parts.append(f"Description: {heading['description']}")
        
        if heading.get('chapter'):
            chapter = heading['chapter']
            doc_parts.append(f"Chapter {chapter['number']}: {chapter['description']}")
        
        # Add notes
        chapter_num = hts_code[:2]
        if chapter_num:
            chapter_notes = notes_db.get_chapter_notes(chapter_num)
            for note in chapter_notes[:3]:
                doc_parts.append(f"Chapter Note: {note['note_text']}")
        
        document_text = "\n".join(doc_parts)
        
        documents.append({
            'id': hts_code,
            'text': document_text,
            'metadata': {
                'hts_code': hts_code,
                'description': heading['description'],
                'chapter': chapter_num,
                'indent_level': heading['indent'],
                'is_heading': True
            }
        })
    
    return documents

def extract_materials(text):
    """Extract material keywords"""
    materials_list = [
        'cotton', 'wool', 'silk', 'linen', 'polyester', 'nylon', 'rayon',
        'leather', 'rubber', 'plastic', 'metal', 'steel', 'aluminum', 'iron',
        'copper', 'brass', 'wood', 'paper', 'cardboard', 'glass', 'ceramic',
        'stone', 'concrete', 'textile', 'synthetic', 'natural'
    ]
    
    text_lower = text.lower()
    found = [m for m in materials_list if m in text_lower]
    return list(set(found))

def extract_functions(text):
    """Extract function/use keywords"""
    functions_list = [
        'breeding', 'racing', 'riding', 'work', 'sport',
        'processing', 'manufacturing', 'cutting', 'measuring',
        'testing', 'heating', 'cooling', 'pumping', 'lifting',
        'recording', 'transmitting', 'receiving', 'displaying',
        'wearing', 'protecting', 'insulating', 'fastening'
    ]
    
    text_lower = text.lower()
    found = [f for f in functions_list if f in text_lower]
    return list(set(found))

def generate_product_synonyms(text):
    """Generate common synonyms"""
    synonym_map = {
        'horses': ['equine', 'horse', 'mare', 'stallion', 'colt'],
        'breeding': ['purebred', 'stud', 'broodmare'],
        'automobile': ['car', 'vehicle', 'motor vehicle', 'auto'],
        'computer': ['PC', 'laptop', 'notebook', 'computing device'],
        'footwear': ['shoes', 'boots', 'sandals', 'slippers']
    }
    
    text_lower = text.lower()
    synonyms = []
    
    for key, values in synonym_map.items():
        if key in text_lower:
            synonyms.extend(values)
    
    return list(set(synonyms))

# Create documents
documents = create_embedding_documents(hierarchy, notes_db)
print(f"\nCreated {len(documents)} embedding documents")