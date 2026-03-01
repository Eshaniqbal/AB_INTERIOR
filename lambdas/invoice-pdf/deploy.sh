#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy_no_sam.sh — Deploy CloudHisaab Invoice PDF Lambda (NO SAM required)
# Uses only: AWS CLI + Docker
#
# Usage:  ./deploy_no_sam.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
AWS_REGION="us-east-1"
ACCOUNT_ID="688927627225"
ECR_REPO="cloudhisaab-invoice-pdf"
IMAGE_TAG="latest"
FUNCTION_NAME="cloudhisaab-invoice-pdf"
ROLE_NAME="cloudhisaab-invoice-pdf-role"
SQS_QUEUE_NAME="cloudhisaab-invoice-jobs"
S3_BUCKET="cloudhisaab-storage"
LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"

step() { echo ""; echo "▶ $1"; }
ok()   { echo "  ✓ $1"; }
info() { echo "  → $1"; }

echo "════════════════════════════════════════════════════"
echo "  CloudHisaab Invoice PDF Lambda — Full Deploy"
echo "  Region:  ${AWS_REGION}"
echo "  Account: ${ACCOUNT_ID}"
echo "════════════════════════════════════════════════════"

# ── 1. SQS Queue ─────────────────────────────────────────────────────────────
step "SQS Queue"
SQS_URL=$(aws sqs create-queue \
  --queue-name "${SQS_QUEUE_NAME}" \
  --region "${AWS_REGION}" \
  --attributes '{
    "VisibilityTimeout":"300",
    "MessageRetentionPeriod":"86400",
    "ReceiveMessageWaitTimeSeconds":"10"
  }' \
  --query 'QueueUrl' --output text 2>/dev/null || \
  aws sqs get-queue-url --queue-name "${SQS_QUEUE_NAME}" --region "${AWS_REGION}" \
    --query 'QueueUrl' --output text)

SQS_ARN=$(aws sqs get-queue-attributes \
  --queue-url "${SQS_URL}" \
  --attribute-names QueueArn \
  --region "${AWS_REGION}" \
  --query 'Attributes.QueueArn' --output text)

ok "SQS queue: ${SQS_URL}"
ok "SQS ARN:   ${SQS_ARN}"

# ── 2. S3 Bucket ──────────────────────────────────────────────────────────────
step "S3 Bucket"
aws s3api head-bucket --bucket "${S3_BUCKET}" --region "${AWS_REGION}" 2>/dev/null || \
  aws s3api create-bucket --bucket "${S3_BUCKET}" --region "${AWS_REGION}" \
    --create-bucket-configuration LocationConstraint="${AWS_REGION}" 2>/dev/null || \
  true  # us-east-1 doesn't need LocationConstraint
ok "S3 bucket: s3://${S3_BUCKET}"

# ── 3. IAM Role ───────────────────────────────────────────────────────────────
step "IAM Role"
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

ROLE_ARN=$(aws iam create-role \
  --role-name "${ROLE_NAME}" \
  --assume-role-policy-document "${TRUST_POLICY}" \
  --query 'Role.Arn' --output text 2>/dev/null || \
  aws iam get-role --role-name "${ROLE_NAME}" \
    --query 'Role.Arn' --output text)

ok "IAM Role ARN: ${ROLE_ARN}"

# Attach managed policies
info "Attaching policies…"
for POLICY in \
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
  "arn:aws:iam::aws:policy/AmazonSQSFullAccess"; do
  aws iam attach-role-policy --role-name "${ROLE_NAME}" --policy-arn "${POLICY}" 2>/dev/null || true
done

# Inline policy for DynamoDB (ch_*) + S3
aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "cloudhisaab-invoice-pdf-inline" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ],
        "Resource": "arn:aws:dynamodb:'${AWS_REGION}':'${ACCOUNT_ID}':table/ch_*"
      },
      {
        "Effect": "Allow",
        "Action": ["s3:PutObject","s3:PutObjectAcl"],
        "Resource": "arn:aws:s3:::'${S3_BUCKET}'/*"
      },
      {
        "Effect": "Allow",
        "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
        "Resource": "arn:aws:logs:'${AWS_REGION}':'${ACCOUNT_ID}':log-group:/aws/lambda/'${FUNCTION_NAME}':*"
      }
    ]
  }' 2>/dev/null || true

ok "Policies attached"

# Wait for role to propagate
info "Waiting for IAM role to propagate (10s)…"
sleep 10

# ── 4. ECR Repository ─────────────────────────────────────────────────────────
step "ECR Repository"
aws ecr describe-repositories \
  --repository-names "${ECR_REPO}" \
  --region "${AWS_REGION}" > /dev/null 2>&1 || \
  aws ecr create-repository \
    --repository-name "${ECR_REPO}" \
    --region "${AWS_REGION}" \
    --image-scanning-configuration scanOnPush=true > /dev/null
ok "ECR repo: ${ECR_URI}"

# ── 5. Docker Build & Push ────────────────────────────────────────────────────
step "Docker Build (this takes 3-8 minutes first time)"
cd "$(dirname "$0")"

aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin \
  "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker buildx build --platform linux/amd64 --provenance=false --load \
  -t "${ECR_REPO}:${IMAGE_TAG}" . 2>&1 | tail -5
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_URI}"
docker push "${ECR_URI}" 2>&1 | tail -5
ok "Image pushed: ${ECR_URI}"

# ── 6. Lambda Function ────────────────────────────────────────────────────────
step "Lambda Function"
LAMBDA_EXISTS=$(aws lambda get-function \
  --function-name "${FUNCTION_NAME}" \
  --region "${AWS_REGION}" \
  --query 'Configuration.FunctionName' --output text 2>/dev/null || echo "")

if [[ -z "${LAMBDA_EXISTS}" ]]; then
  info "Creating Lambda function…"
  aws lambda create-function \
    --function-name "${FUNCTION_NAME}" \
    --package-type Image \
    --code ImageUri="${ECR_URI}" \
    --role "${ROLE_ARN}" \
    --timeout 120 \
    --memory-size 1024 \
    --region "${AWS_REGION}" \
    --environment "Variables={S3_BUCKET=${S3_BUCKET},REGISTRY_TABLE=ch_registry}" \
    --description "CloudHisaab — Invoice PDF generator (SQS trigger)" \
    > /dev/null
  ok "Lambda created"
else
  info "Updating Lambda code…"
  aws lambda update-function-code \
    --function-name "${FUNCTION_NAME}" \
    --image-uri "${ECR_URI}" \
    --region "${AWS_REGION}" > /dev/null

  aws lambda update-function-configuration \
    --function-name "${FUNCTION_NAME}" \
    --timeout 120 \
    --memory-size 1024 \
    --environment "Variables={S3_BUCKET=${S3_BUCKET},REGISTRY_TABLE=ch_registry}" \
    --region "${AWS_REGION}" > /dev/null
  ok "Lambda updated"
fi

# Wait for Lambda to be active
info "Waiting for Lambda to become Active…"
aws lambda wait function-active --function-name "${FUNCTION_NAME}" --region "${AWS_REGION}"
ok "Lambda is Active"

LAMBDA_ARN=$(aws lambda get-function \
  --function-name "${FUNCTION_NAME}" \
  --region "${AWS_REGION}" \
  --query 'Configuration.FunctionArn' --output text)

# ── 7. SQS Trigger ────────────────────────────────────────────────────────────
step "SQS Event Source Mapping"
EXISTING_UUID=$(aws lambda list-event-source-mappings \
  --function-name "${FUNCTION_NAME}" \
  --event-source-arn "${SQS_ARN}" \
  --region "${AWS_REGION}" \
  --query 'EventSourceMappings[0].UUID' --output text 2>/dev/null || echo "None")

if [[ "$EXISTING_UUID" == "None" || -z "$EXISTING_UUID" ]]; then
  aws lambda create-event-source-mapping \
    --function-name "${FUNCTION_NAME}" \
    --event-source-arn "${SQS_ARN}" \
    --batch-size 5 \
    --maximum-batching-window-in-seconds 10 \
    --region "${AWS_REGION}" > /dev/null
  ok "SQS trigger created"
else
  ok "SQS trigger already exists (UUID: ${EXISTING_UUID})"
fi

# ── 8. CloudWatch Log Group ───────────────────────────────────────────────────
step "CloudWatch Logs"
aws logs create-log-group \
  --log-group-name "${LOG_GROUP}" \
  --region "${AWS_REGION}" 2>/dev/null || true
aws logs put-retention-policy \
  --log-group-name "${LOG_GROUP}" \
  --retention-in-days 30 \
  --region "${AWS_REGION}" 2>/dev/null || true
ok "Log group: ${LOG_GROUP} (30d retention)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo "  ✅  Deploy Complete!"
echo "════════════════════════════════════════════════════"
echo "  Lambda ARN : ${LAMBDA_ARN}"
echo "  SQS URL    : ${SQS_URL}"
echo "  S3 Bucket  : s3://${S3_BUCKET}"
echo "  Logs       : aws logs tail ${LOG_GROUP} --follow"
echo ""
echo "  Test with:"
echo "  aws sqs send-message \\"
echo "    --queue-url '${SQS_URL}' \\"
echo '    --message-body '"'"'{"sale_id":"TEST","tenant_id":"org123","invoice_number":"INV-TEST-00001"}'"'"
echo "════════════════════════════════════════════════════"
