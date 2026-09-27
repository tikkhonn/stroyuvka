FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

ENV UVICORN_RELOAD=1

CMD ["sh", "-c", "python scripts/wait_for_db.py && alembic upgrade head && python -m app.seed.run && if [ -n \"$UVICORN_RELOAD\" ]; then exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload; else exec uvicorn app.main:app --host 0.0.0.0 --port 8000; fi"]
