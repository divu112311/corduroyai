from google.cloud import storage
import json

class GCSStorage:
    def __init__(self, bucket_name):
        self.client = storage.Client()
        self.bucket = self.client.get_bucket(bucket_name)

    def save_raw(self, path, content):
        blob = self.bucket.blob(path)
        if isinstance(content, bytes):
            blob.upload_from_string(content, content_type="application/octet-stream")
        return
        if isinstance(content, dict) or isinstance(content, list):
            blob.upload_from_string(
            json.dumps(content),
            content_type="application/json"
            )
        return
        if isinstance(content, str):
            blob.upload_from_string(content)
        return
        raise TypeError(f"Unsupported content type: {type(content)}")


    def save_canonical(self, path, content):
        blob = self.bucket.blob(path)
    # Convert dict, list, etc. to JSON string
        if not isinstance(content, str):
            content = json.dumps(content)
        blob.upload_from_string(content)
        if not isinstance(content, str):
            content = json.dumps(content, indent=2)
    def load_raw(self, path):
        blob = self.bucket.blob(path)
        return blob.download_as_text()  # returns st