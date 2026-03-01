# lambdas/invoice-pdf/README.md

# 📄 CloudHisaab — Invoice PDF Lambda

Standalone AWS Lambda that generates GST-compliant PDF invoices, triggered asynchronously via SQS.

```
lambdas/invoice-pdf/
├── lambda_function.py      ← Main Lambda handler
├── sqs_sender.py           ← SQS enqueue helper (used by billing_resolver)
├── test_local.py           ← Local test — generates a real PDF without AWS
├── requirements.txt        ← Python dependencies
├── Dockerfile              ← Container image (required for WeasyPrint)
├── template.yaml           ← SAM deployment template
├── deploy.sh               ← One-command build + deploy script
└── templates/
    └── invoice.html        ← Jinja2 GST invoice template
```

---

## Architecture

```
POST /graphql (createInvoice mutation)
    │
    ▼
billing_resolver.py
    │  ① Save sale to DynamoDB (sync — fast)
    │  ② Enqueue SQS message   (async — non-blocking)
    │
    ▼
SQS: cloudhisaab-invoice-jobs
    │
    ▼
Lambda: cloudhisaab-invoice-pdf
    │  ① Fetch sale + items from ch_<tenant_id> table
    │  ② Fetch tenant metadata (business name, GSTIN, address)
    │  ③ Render HTML via Jinja2
    │  ④ Generate PDF via WeasyPrint
    │  ⑤ Upload to S3: <tenant_id>/invoices/<invoice_number>.pdf
    │  ⑥ Update DynamoDB: pdf_status=READY, pdf_s3_key=...
    │
    ▼
Frontend polls /billing/<sale_id> → download link
```

---

## Local Development

### 1. Install dependencies
```bash
cd lambdas/invoice-pdf
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# WeasyPrint also needs system libs:
# Ubuntu/Debian:
sudo apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf2.0-0
# macOS (Homebrew):
brew install pango cairo gdk-pixbuf
```

### 2. Run local test (generates a real PDF)
```bash
python test_local.py
# → PDF written to test_output/test_invoice.pdf
```

### 3. Test with Docker (mirrors Lambda environment exactly)
```bash
docker build -t cloudhisaab-invoice-pdf .
docker run -p 9000:8080 \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  -e AWS_REGION=us-east-1 \
  -e S3_BUCKET=cloudhisaab-storage \
  cloudhisaab-invoice-pdf

# In another terminal:
curl -X POST http://localhost:9000/2015-03-31/functions/function/invocations \
  -H "Content-Type: application/json" \
  -d '{
    "Records": [{
      "body": "{\"sale_id\":\"SAL123\",\"tenant_id\":\"org123\",\"invoice_number\":\"INV-001\"}"
    }]
  }'
```

---

## Deployment

### Prerequisites
- AWS CLI configured (`aws configure`)
- Docker installed and running
- SAM CLI installed (`pip install aws-sam-cli`)
- SQS queue already created in AWS

### One-command deploy
```bash
cd lambdas/invoice-pdf

export AWS_REGION=us-east-1
export S3_BUCKET=cloudhisaab-storage
export SQS_QUEUE_ARN=arn:aws:sqs:us-east-1:123456789:cloudhisaab-invoice-jobs

chmod +x deploy.sh
./deploy.sh
```

### What `deploy.sh` does
1. Creates ECR repository `cloudhisaab-invoice-pdf` if it doesn't exist
2. Builds the Docker image (`linux/amd64` platform for Lambda)
3. Pushes the image to ECR
4. Deploys the SAM stack (IAM roles + Lambda + SQS trigger)

---

## Environment Variables (Lambda)

| Variable         | Description                              | Example                     |
|------------------|------------------------------------------|-----------------------------|
| `AWS_REGION`     | AWS region                               | `us-east-1`                 |
| `S3_BUCKET`      | S3 bucket for storing PDFs               | `cloudhisaab-storage`       |
| `REGISTRY_TABLE` | Global DynamoDB registry table           | `ch_registry`               |

---

## SQS Message Format

The billing resolver sends this JSON as the SQS message body:

```json
{
  "sale_id":        "SAL9F5FB3C3D2ABCD",
  "tenant_id":      "ORG9F5FB3C3D2",
  "invoice_number": "INV-ORG9F5FB3-00042"
}
```

---

## IAM Permissions Required

The Lambda needs:
- `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:UpdateItem` on `ch_*` tables
- `s3:PutObject` on `<S3_BUCKET>/*`
- `sqs:ReceiveMessage`, `sqs:DeleteMessage` on the invoice jobs queue
- (All wired automatically by `template.yaml`)

---

## PDF Output

Generated PDFs are stored at:
```
s3://<S3_BUCKET>/<tenant_id>/invoices/<invoice_number>.pdf
```

Example: `s3://cloudhisaab-storage/org9f5fb3c3d2/invoices/INV-ORG9F5FB3-00042.pdf`

The backend `get_invoice_download_url` resolver generates a presigned S3 URL (valid 1 hour) for the frontend to download/print the invoice.
