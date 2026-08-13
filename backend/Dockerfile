FROM python:3.14-alpine AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.14-alpine AS runtime

WORKDIR /app
COPY --from=builder /install /usr/local

COPY app ./app

# nltk >= 3.10 refuses to download outside nltk.data.path (the path-traversal CVE fix).
# NLTK_DATA seeds that path at import time, so this authorises the download below and
# lets the running app find the corpora.
ENV NLTK_DATA=/app/nltk_data

RUN python -c "import nltk; [nltk.download(r, download_dir='/app/nltk_data', raise_on_error=True) for r in ('wordnet','omw-1.4')]" \
    && python -c "import zipfile,pathlib; d=pathlib.Path('/app/nltk_data/corpora'); [(zipfile.ZipFile(z).extractall(d), z.unlink()) for z in d.glob('*.zip')]" \
    && adduser -D -u 1000 appuser \
    # No package manager in the runtime image: the builder already installed everything,
    # so pip here only lets code execution turn into code installation. Also drops pip's
    # vendored bundle, which is where image scanners were finding CVEs.
    && python -m pip uninstall -y pip \
    && rm -rf /usr/local/lib/python3.14/ensurepip

ENV PYTHONUNBUFFERED=1 \
    DEEPEVAL_TELEMETRY_OPT_OUT=YES

EXPOSE 8000

# Numeric, not `appuser`: orchestrators enforcing runAsNonRoot cannot resolve a name
# (hadolint DL3066). This is the uid from adduser above.
USER 1000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
