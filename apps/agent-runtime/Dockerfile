FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app
COPY pyproject.toml ./
COPY heather_agent ./heather_agent
RUN pip install --upgrade pip && pip install .
RUN addgroup --system heather && adduser --system --ingroup heather heather && chown -R heather:heather /app
USER heather
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/health')"
CMD ["sh", "-c", "exec python -m uvicorn heather_agent.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
