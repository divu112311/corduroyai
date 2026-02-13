# pinecone_service.py - Pinecone vector database operations
from pinecone import Pinecone, ServerlessSpec
import config
import time

class PineconeService:
    """Pinecone vector database operations"""
    
    def __init__(self, api_key, namespace):
        """
        Initialize Pinecone connection
        
        Args:
            api_key: Pinecone API key
            namespace: Namespace for vectors
        """
        self.pc = Pinecone(api_key=api_key)
        self.index_name = "hts-embeddings"
        self.namespace = namespace
        self.index = None
        print(f"  Using namespace: {self.namespace}")
    
    def create_index_if_not_exists(self):
        """Create Pinecone index if it doesn't exist"""
        existing_indexes = self.pc.list_indexes().names()
        
        # Delete existing index if it exists (dimension might have changed)
        if self.index_name in existing_indexes:
            print(f"  ✓ Using existing index: {self.index_name}")
        
        else:
            
            print(f"  Creating new index: {self.index_name} (dimension: {1536})")
            
            self.pc.create_index(
                name=self.index_name,
                dimension=1536,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region="us-east-1"
                )
            )
            print("  ⏳ Waiting for index to be ready...")
            time.sleep(10)
            print("  ✓ Index created")
    def connect_to_index(self):
        """Connect to Pinecone index"""
        self.index = self.pc.Index(self.index_name)
        return self.index
    
    def upsert_batch(self, vectors):
        """
        Upload batch of vectors to Pinecone
        
        Args:
            vectors: List of dicts with 'id', 'values', 'metadata'
        """
        if not self.index:
            raise Exception("Index not connected. Call connect_to_index() first.")
        
        self.index.upsert(vectors=vectors, namespace=self.namespace)
    
    def query(self, vector, top_k=10, include_metadata=True):
        """
        Query Pinecone index
        
        Args:
            vector: Query vector (list of floats)
            top_k: Number of results to return
            include_metadata: Include metadata in results
        
        Returns:
            Query results
        """
        if not self.index:
            raise Exception("Index not connected. Call connect_to_index() first.")
        
        return self.index.query(
            vector=vector,
            top_k=top_k,
            include_metadata=include_metadata,
            namespace=self.namespace
        )
    
    def delete_namespace(self):
        """Delete all vectors in the namespace"""
        if not self.index:
            raise Exception("Index not connected. Call connect_to_index() first.")
        
        self.index.delete(delete_all=True, namespace=self.namespace)
        print(f"  ✓ Deleted all vectors in namespace: {self.namespace}")