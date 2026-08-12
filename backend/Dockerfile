FROM python:3.14-alpine AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.14-alpine AS runtime

WORKDIR /app
COPY --from=builder /install /usr/local

COPY app ./app

# nltk >= 3.10 (the fix for the path-traversal CVEs) validates the download target
# against nltk.data.path and refuses anything outside it. Declaring the directory here
# is what authorises it: nltk seeds nltk.data.path from NLTK_DATA at import time, so
# this both unblocks the download below and lets the running app find the corpora
# without touching sys.path itself.
ENV NLTK_DATA=/app/nltk_data

RUN python -c "import nltk; [nltk.download(r, download_dir='/app/nltk_data', raise_on_error=True) for r in ('wordnet','omw-1.4')]" \
    && python -c "import zipfile,pathlib; d=pathlib.Path('/app/nltk_data/corpora'); [(zipfile.ZipFile(z).extractall(d), z.unlink()) for z in d.glob('*.zip')]" \
    && adduser -D -u 1000 appuser \
    # Drop pip from the runtime image. Dependencies are already installed by the builder
    # stage, so a package manager here only adds attack surface: it lets anyone with code
    # execution fetch and install code. It also removes pip's vendored bundle, which is
    # what image scanners were reporting CVEs against — those copies are never importable
    # by the app, so deleting pip fixes the finding properly instead of muting it.
    && python -m pip uninstall -y pip \
    && rm -rf /usr/local/lib/python3.14/ensurepip

ENV PYTHONUNBUFFERED=1 \
    DEEPEVAL_TELEMETRY_OPT_OUT=YES

EXPOSE 8000

# Numeric, not `appuser`: a name only resolves if the runtime reads this image's
# /etc/passwd, so orchestrators enforcing runAsNonRoot cannot verify it (hadolint DL3066).
# This is the uid created by the adduser call above.
USER 1000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
