# storage_loader.py - Google Cloud Storage operations

from google.cloud import storage
import json

class StorageLoader:
    """Load files from Google Cloud Storage"""
    
    def __init__(self, bucket_name):
        self.bucket_name = bucket_name
        self.client = storage.Client()
    
    def load_json(self, file_path):
        """
        Load JSON file from Cloud Storage
        
        Args:
            file_path: Path to JSON file in bucket
        
        Returns:
            Parsed JSON data
        """
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(file_path)
            
            json_string = blob.download_as_string()
            data = json.loads(json_string)
            
            return data
        except Exception as e:
            raise Exception(f"Failed to load JSON from gs://{self.bucket_name}/{file_path}: {e}")