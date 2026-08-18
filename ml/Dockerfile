FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir pipenv

COPY Pipfile Pipfile.lock ./ 2>/dev/null || true

RUN if [ -f Pipfile.lock ]; then pipenv install --system --deploy; else pipenv install --system; fi

COPY . .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]