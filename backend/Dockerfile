FROM python:3.14-alpine AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

RUN sp=/install/lib/python3.14/site-packages \
    # A base-image bump moves this path; failing here beats silently pruning nothing.
    && test -d "$sp" \
    && rm -rf "$sp"/_pytest "$sp"/pytest "$sp"/pytest_asyncio "$sp"/pytest_repeat.py \
    "$sp"/pytest_rerunfailures.py "$sp"/xdist "$sp"/execnet "$sp"/iniconfig "$sp"/pluggy \
    "$sp"/pytest-*.dist-info "$sp"/pytest_*.dist-info "$sp"/execnet-*.dist-info \
    "$sp"/iniconfig-*.dist-info "$sp"/pluggy-*.dist-info \
    && rm -f /install/bin/pytest /install/bin/py.test

FROM python:3.14-alpine AS runtime

WORKDIR /app

# The base image lags the Alpine repo on util-linux, so this pulls the patched libuuid rather
# than waiting for a rebuilt python:3.14-alpine. Pinned low bound, so the version is auditable.
# apk itself is deleted further down, once this and the nltk corpora are in place.
RUN apk add --no-cache "libuuid>=2.42.3-r0"

COPY --from=builder /install /usr/local

COPY app ./app

# nltk >= 3.10 refuses to download outside nltk.data.path (the path-traversal CVE fix).
# NLTK_DATA seeds that path at import time, so this authorises the download below and
# lets the running app find the corpora.
ENV NLTK_DATA=/app/nltk_data

# Unpacked rather than left zipped: nltk reads a zipped corpus by inflating whole members into
# memory and caching them, putting ~22 MB in anonymous heap. Extracted, those bytes are page
# cache the kernel can reclaim, and this container is memory-bound before it is size-bound.
# Which corpora to fetch is stated once, in app/core/nltk_data.py.
RUN python -c "from app.core.nltk_data import ensure_wordnet_resources; ensure_wordnet_resources()" \
    && python -c "import zipfile,pathlib; d=pathlib.Path('/app/nltk_data/corpora'); [(zipfile.ZipFile(z).extractall(d), z.unlink()) for z in d.glob('*.zip')]" \
    # nltk writes 0600 root, and the container runs as uid 1000.
    && chmod -R a+rX /app/nltk_data \
    && adduser -D -u 1000 appuser \
    # No package manager in the runtime image: the builder already installed everything,
    # so pip here only lets code execution turn into code installation. Also drops pip's
    # vendored bundle, which is where image scanners were finding CVEs.
    && python -m pip uninstall -y pip \
    && rm -rf /usr/local/lib/python3.14/ensurepip \
    # apk comes with the base image, so removing it is what actually leaves the runtime
    # without a package manager.
    && rm -rf /sbin/apk /etc/apk /lib/apk /usr/share/apk /var/cache/apk

ENV PYTHONUNBUFFERED=1 \
    DEEPEVAL_TELEMETRY_OPT_OUT=YES

ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA

EXPOSE 8000

# Numeric, not `appuser`: orchestrators enforcing runAsNonRoot cannot resolve a name
# (hadolint DL3066). This is the uid from adduser above.
USER 1000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
