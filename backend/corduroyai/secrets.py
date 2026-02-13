# secrets.py
from google.cloud import secretmanager

def get_secret(secret_name: str) -> str:
    """
    Fetch the value of a secret from GCP Secret Manager.
    
    Args:
        secret_name (str): Name of the secret in Secret Manager (e.g., 'CENSUS_API_KEY')
    
    Returns:
        str: The secret value as a string
    """
    # Create the Secret Manager client
    client = secretmanager.SecretManagerServiceClient()
    
    # Replace with your actual GCP project ID
    project_id = "project-1fe125c4-7788-4a50-8cf"
    
    # Build the resource name for the secret version
    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    
    # Access the secret version
    response = client.access_secret_version(request={"name": name})
    
    # Return the secret value as a string
    return response.payload.data.decode("UTF-8")
