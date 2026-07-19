FROM python:3.12-slim

# git: skillspector clones the target repo/URL to scan it.
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      git \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# skillspector isn't on PyPI yet — install straight from the upstream repo,
# same as the project's own Docker instructions.
RUN pip install --no-cache-dir 'skillspector @ git+https://github.com/NVIDIA/skillspector.git'

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8090
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090"]
