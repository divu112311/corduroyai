FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir requests google-cloud-storage

COPY test_scenarios.json .
COPY run_classification_tests.py .

CMD ["python", "run_classification_tests.py"]
