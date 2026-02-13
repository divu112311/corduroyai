import hashlib

def checksum(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()
