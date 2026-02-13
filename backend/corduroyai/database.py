# database.py

from supabase import create_client, Client
import config

class SupabaseDatabase:
    def __init__(self, url, key):
        self.supabase: Client = create_client(url, key)
    
    def get_chapters(self):
        response = self.supabase.table('chapters').select(
        'id, code, title, section_id, section:sections(id, code, title)'
        ).execute()
        #print("Fetched chapters from DB:", response.data)
        return {row['code']: row for row in response.data}

    def get_sections(self):
        response = self.supabase.table('sections').select(
            'id, code, title'
        ).execute()
        return {row['code']: row for row in response.data}
    
    def get_hts_entries_by_type(self, doc_type):
        response = self.supabase.table('hts_entries').select('*').eq(
            'doc_type', doc_type
        ).order('id').execute()
        
        grouped = {}
        for row in response.data:
            marker = row.get(config.HTS_ENTRIES_MARKER_FIELD)
            
            if not marker:
                grouped[row['id']] = row
                continue
            
            if marker not in grouped:
                grouped[marker] = {
                    'id': row['id'],
                    'doc_type': row['doc_type'],
                    'ref_id': row.get('ref_id'),
                    'subtype': row.get('subtype'),
                    'marker': marker,
                    'text_parts': []
                }
            
            text_chunk = row.get(config.HTS_ENTRIES_TEXT_FIELD, '')
            if text_chunk:
                grouped[marker]['text_parts'].append(text_chunk)
        
        reconstructed = []
        for entry in grouped.values():
            if 'text_parts' in entry:
                entry['text'] = ''.join(entry['text_parts'])
                del entry['text_parts']
            reconstructed.append(entry)
        
        return reconstructed
    
    def get_all_notes(self):
        return {
            'gri': self.get_hts_entries_by_type('GRI'),
            'additional': self.get_hts_entries_by_type('Additional'),
            'chapters': self.get_hts_entries_by_type('Chapters'),
            'sections': self.get_hts_entries_by_type('Sections')
        }