# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — CloudHisaab Invoice PDF Lambda (Container Image)
#
# WeasyPrint requires system libraries (cairo, pango, etc.) which are easiest
# to ship via a container image rather than a ZIP layer.
#
# Build:   docker build -t cloudhisaab-invoice-pdf .
# Test:    docker run -p 9000:8080 cloudhisaab-invoice-pdf
# Invoke:  curl -X POST http://localhost:9000/2015-03-31/functions/function/invocations \
#            -d '{"Records":[{"body":"{\"sale_id\":\"TEST\",\"tenant_id\":\"test\",\"invoice_number\":\"INV-TEST-00001\"}"}]}'
# ─────────────────────────────────────────────────────────────────────────────

FROM public.ecr.aws/lambda/python:3.12

# System deps required by WeasyPrint (cairo, pango, libffi, fonts)
RUN dnf install -y \
    pango \
    cairo \
    cairo-gobject \
    gdk-pixbuf2 \
    libffi \
    zlib \
    libjpeg-turbo \
    libpng \
    fontconfig \
    freetype \
    harfbuzz \
    && dnf clean all

# Install Google Noto fonts for Unicode / Indian language support
RUN dnf install -y google-noto-fonts-common google-noto-sans-fonts || true \
    && fc-cache -fv

# Upgrade pip quietly
RUN pip install --upgrade pip --quiet

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}" --quiet

# Copy Lambda source code
COPY lambda_function.py   "${LAMBDA_TASK_ROOT}/"
COPY templates/           "${LAMBDA_TASK_ROOT}/templates/"

# Entry point
CMD ["lambda_function.lambda_handler"]
