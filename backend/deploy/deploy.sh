#!/usr/bin/env bash
# =============================================================
# CloudHisaab Deploy / Update Script
# Run this on your LOCAL machine to push updates to EC2
# Usage: bash deploy.sh
# =============================================================
set -euo pipefail

EC2_IP="44.193.28.181"
EC2_USER="ubuntu"
KEY_PATH="~/.ssh/whoop-backend-key-new.pem"
APP_DIR="/home/ubuntu/cloudhisaab"

echo "🚀 Deploying CloudHisaab to EC2..."

# ── Push latest code ────────────────────────────────────
echo "[1/3] Pushing code to EC2..."
ssh -i "$KEY_PATH" "${EC2_USER}@${EC2_IP}" bash -s << 'REMOTE'
set -euo pipefail
cd /home/ubuntu/cloudhisaab
echo "  → git pull"
git pull

echo "  → Installing/updating Python packages"
cd backend
source .venv/bin/activate
pip install -q -r requirements.txt
deactivate
REMOTE

# ── Restart service ─────────────────────────────────────
echo "[2/3] Restarting API service..."
ssh -i "$KEY_PATH" "${EC2_USER}@${EC2_IP}" \
    "sudo systemctl restart cloudhisaab && echo '  Service restarted ✓'"

# ── Health check ────────────────────────────────────────
echo "[3/3] Health check..."
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://api.cloudhisab.in/health")
if [ "$HTTP_STATUS" = "200" ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo "   GraphQL: https://api.cloudhisab.in/graphql"
else
    echo "⚠️  Health check returned HTTP $HTTP_STATUS — check logs:"
    echo "   ssh -i $KEY_PATH ${EC2_USER}@${EC2_IP} 'sudo journalctl -u cloudhisaab -n 50'"
fi
