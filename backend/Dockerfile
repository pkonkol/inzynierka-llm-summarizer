FROM python:3.14-alpine AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.14-alpine AS runtime

WORKDIR /app
COPY --from=builder /install /usr/local

COPY app ./app

RUN python -c "import nltk; [nltk.download(r, download_dir='/app/nltk_data', raise_on_error=True) for r in ('wordnet','omw-1.4')]" \
    && python -c "import zipfile,pathlib; d=pathlib.Path('/app/nltk_data/corpora'); [(zipfile.ZipFile(z).extractall(d), z.unlink()) for z in d.glob('*.zip')]" \
    && adduser -D -u 1000 appuser

ENV PYTHONUNBUFFERED=1 \
    DEEPEVAL_TELEMETRY_OPT_OUT=YES

EXPOSE 8000
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
