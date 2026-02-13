# embedding_service.py - Generate embeddings using OpenAI

from openai import OpenAI
import time

class EmbeddingService:
    """Generate embeddings using OpenAI"""

    def __init__(self, api_key):
        """
        Initialize OpenAI embedding service
        
        Args:
            api_key: OpenAI API key
        """
        self.client = OpenAI(api_key=api_key)
        self.model = "text-embedding-3-small"
        self.batch_limit = 2048  # OpenAI batch limit
        print(f"  ✓ OpenAI embedding service initialized (model: {self.model})")

    def encode(self, text):
        """
        Generate embedding for text

        Args:
            text: Text to encode

        Returns:
            Embedding as list of floats
        """
        response = self.client.embeddings.create(
            model=self.model,
            input=text
        )
        return response.data[0].embedding

    def encode_batch(self, texts):
        """
        Generate embeddings for multiple texts

        Args:
            texts: List of texts to encode

        Returns:
            List of embeddings
        """
        all_embeddings = []
        
        # Process in chunks of 2048 (OpenAI limit)
        for i in range(0, len(texts), self.batch_limit):
            batch = texts[i:i + self.batch_limit]
            response = self.client.embeddings.create(
                model=self.model,
                input=batch
            )
            # Sort by index to maintain order
            sorted_data = sorted(response.data, key=lambda x: x.index)
            all_embeddings.extend([item.embedding for item in sorted_data])
            time.sleep(0.5) 
        return all_embeddings

    def encode_query(self, text):
        """
        Generate embedding for a search query

        Args:
            text: Query text to encode

        Returns:
            Embedding as list of floats
        """
        return self.encode(text)