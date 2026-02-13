# document_builder.py

from chapter_mapping import get_chapter_info

class DocumentBuilder:
    def __init__(self, chapters, sections,chapter_mapping):
        """
        Initialize document builder.

        Args:
            chapters: Dictionary of chapter data from Supabase
                      {chapter_code: {id, code, title, section_id, sections: {id, code, title}}}
        """
        self.chapters = chapters
        self.sections = sections
        self.chapter_mapping = chapter_mapping

    def build_rich_document(self, hts_entry,components=None):
        """
        Build a rich text document for embedding.

        Includes:
        - HTS Code and Description
        - Chapter and Section context
        - Materials (from chapter mapping)
        - Functions (from chapter mapping)
        - Synonyms (from chapter mapping)
        - Units

        Args:
            hts_entry: HTS entry dict with htsno, description, units, etc.

        Returns:
            String with rich document text, or None if invalid entry
        """
        hts_code = hts_entry.get('htsno', '').strip()
        description = hts_entry.get('description', '').strip()

        #print ("in builder",hts_code, description)
        # Skip invalid entries (no code, no dot, no description)
        if not hts_code or '.' not in hts_code or not description:
            return None

        doc_parts = []

        # 1. HTS Code and Description
        doc_parts.append(f"HTS Code: {hts_code}")
        doc_parts.append(f"Description: {description}")

        # 2. Chapter and Section context
        chapter_code = hts_code[:2]
        #print()
        # Normalize chapter_code to match DB keys (strip leading zeros)
        normalized_code = str(int(chapter_code))
        #print("normalized code", normalized_code)
        chapter = self.chapters.get(normalized_code)
        
        #print("Chapter", chapter)
        
        if chapter:
            chapter_title = chapter.get('title')
            doc_parts.append(f"Chapter: {chapter_code} - {chapter_title}")
        # Assign chapter info
            #print("I am in component")
            if components is not None:
                components['chapter_title'] = chapter.get('title')
    
        # Assign section info from chapter if available
            section = chapter.get('section')
            #print("Section", section)
            if section:
                section_code = section.get('code')
                section_title = section.get('title')
                components['section_code'] = section.get('code')
                components['section_title'] = section.get('title')
                doc_parts.append(f"Section: {section_code} - {section_title}")
        

        chapter_info = self.chapter_mapping.get(str(chapter_code), {})  # ensure key is string
        materials_str = ', '.join(chapter_info.get('materials', []))
        doc_parts.append(f"Materials: {materials_str}")

        functions_str = ', '.join(chapter_info.get('functions', []))
        doc_parts.append(f"Functions: {functions_str}")

        synonyms_str = ', '.join(chapter_info.get('synonyms', []))
        doc_parts.append(f"Related Terms: {synonyms_str}")

        
        # 7. Units
        units = hts_entry.get('units', [])
        if units:
            if isinstance(units, list):
                units_str = ', '.join(units)
            else:
                units_str = str(units)
            doc_parts.append(f"Units: {units_str}")

        return "\n".join(doc_parts)

    def build_rich_document_verbose(self, hts_entry):
        """
        Build rich document and return both the document and its components.
        Useful for debugging and testing.

        Returns:
            Tuple of (rich_document_string, components_dict)
        """
        hts_code = hts_entry.get('htsno', '').strip()
        description = hts_entry.get('description', '').strip()

        if not hts_code or '.' not in hts_code or not description:
            return None, None

        chapter_code = hts_code[:2]
        normalized_code = str(int(chapter_code))
        
        chapter_info = self.chapter_mapping.get(str(chapter_code), {})  # ensure key is string
        
        #print(f"Chapter info for code {chapter_code}: {chapter_info}")
        components = {
            'hts_code': hts_code,
            'description': description,
            'chapter_code': chapter_code,
            'chapter_title': None,
            'section_code': None,
            'section_title': None,
            'materials': chapter_info.get('materials'),
            'functions': chapter_info.get('functions'),
            'synonyms': chapter_info.get('synonyms'),
            'units': hts_entry.get('units', [])
        }

        chapter = self.chapters.get(normalized_code)

        if chapter:
            components['chapter_title'] = chapter.get('title')

            sections = chapter.get('sections', [])
            if sections:
                first_section = sections[0]
                components['section_code'] = first_section.get('code')
                components['section_title'] = first_section.get('title')

    # Optional fallback with section_id
            section_id = chapter.get('section_id')
            if section_id and section_id in self.sections:
                section = self.sections[section_id]
                components['section_code'] = components.get('section_code') or section.get('code')
                components['section_title'] = components.get('section_title') or section.get('title')
        
        rich_doc = self.build_rich_document(hts_entry, components=components)
        
        #print("richdoc", rich_doc)

        return rich_doc, components
