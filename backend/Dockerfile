FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.lock ./
# requirements.lock pins every package to the image that was last verified;
# pyproject.toml stays the statement of what the app needs.
RUN pip install --no-cache-dir -c requirements.lock -e ".[dev]" 2>/dev/null \
    || pip install --no-cache-dir -c requirements.lock .

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
