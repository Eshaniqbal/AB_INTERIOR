"""
lambdas/invoice-pdf/sqs_sender.py
------------------------------------
Helper imported by the main GraphQL backend (billing_resolver.py)
to enqueue a PDF generation job after an invoice is created.

Usage (in billing_resolver.py):
    from ..sqs_sender import enqueue_pdf_job
    enqueue_pdf_job(tenant_id, sale_id, invoice_number)
"""

import os
import json
import boto3
import logging

logger = logging.getLogger(__name__)

REGION        = os.environ.get("AWS_REGION", "us-east-1")
SQS_QUEUE_URL = os.environ.get("INVOICE_SQS_URL", "")  # set in .env.local

_sqs = None


def _get_sqs():
    global _sqs
    if not _sqs:
        _sqs = boto3.client("sqs", region_name=REGION)
    return _sqs


def enqueue_pdf_job(tenant_id: str, sale_id: str, invoice_number: str) -> bool:
    """
    Send a message to SQS to trigger invoice PDF generation.
    Returns True on success, False on failure (non-blocking — invoice still succeeds).
    """
    if not SQS_QUEUE_URL:
        logger.warning(
            "INVOICE_SQS_URL not set — PDF generation skipped for %s", invoice_number
        )
        return False

    message = {
        "sale_id":        sale_id,
        "tenant_id":      tenant_id,
        "invoice_number": invoice_number,
    }

    try:
        resp = _get_sqs().send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=json.dumps(message),
            MessageAttributes={
                "tenant_id": {"StringValue": tenant_id, "DataType": "String"},
            },
        )
        logger.info(
            "Enqueued PDF job for %s (MessageId: %s)", invoice_number, resp["MessageId"]
        )
        return True
    except Exception as exc:
        logger.error("Failed to enqueue PDF job for %s: %s", invoice_number, exc)
        return False
