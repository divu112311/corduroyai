# search.py - Search for HTS codes

import sys
import config
from secrets_manager import SecretsManager
from embedding_service import EmbeddingService
from pinecone_service import PineconeService

def search_hts(query, top_k=10):
    """
    Search for HTS codes
    
    Args:
        query: Product description
        top_k: Number of results to return
    """
    print("Initializing search...")
    
    # Load credentials
    secrets = SecretsManager()
    creds = secrets.get_all_credentials()
    
    # Initialize services
    embedding_service = EmbeddingService()
    pinecone = PineconeService(creds['pinecone_key'])
    pinecone.connect_to_index()
    
    # Search
    print(f"\nSearching for: '{query}'")
    print("="*80)
    
    query_embedding = embedding_service.encode(query)
    results = pinecone.query(query_embedding.tolist(), top_k=top_k)
    
    # Display results
    for i, match in enumerate(results['matches'], 1):
        print(f"\n{i}. HTS Code: {match['id']}")
        print(f"   Score: {match['score']:.4f}")
        print(f"   Description: {match['metadata']['description']}")
        print(f"   Chapter: {match['metadata']['chapter']}")
        
        if match['metadata'].get('units'):
            print(f"   Units: {match['metadata']['units']}")
        
        if match['metadata'].get('general_rate'):
            print(f"   Duty Rate: {match['metadata']['general_rate']}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        query = ' '.join(sys.argv[1:])
    else:
        query = input("Enter product description: ")
    
    search_hts(query)