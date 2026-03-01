#!/usr/bin/env bash
# =============================================================
# CloudHisaab EC2 Bootstrap Script
# Run ONCE on a fresh Ubuntu 22.04 EC2 instance as ubuntu user
# Usage: bash setup_ec2.sh
# =============================================================
set -euo pipefail

REPO_URL="https://github.com/YOUR_USERNAME/cloudhisaab.git"   # ← change this
APP_DIR="/home/ubuntu/cloudhisaab"
DOMAIN="api.cloudhisab.in"
EMAIL="your@email.com"   # ← change this (used by Let's Encrypt)
PYTHON_VERSION="3.11"

echo "=================================================="
echo "  CloudHisaab EC2 Setup"
echo "  Domain: $DOMAIN"
echo "=================================================="

# ── 1. System packages ────────────────────────────────
echo "[1/8] Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y \
    git nginx python${PYTHON_VERSION} python${PYTHON_VERSION}-venv \
    python3-pip certbot python3-certbot-nginx \
    build-essential libssl-dev libffi-dev \
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 \
    libgdk-pixbuf2.0-0 libfontconfig1 \
    curl unzip

# ── 2. Clone repo ─────────────────────────────────────
echo "[2/8] Cloning repository..."
if [ -d "$APP_DIR" ]; then
    echo "  Directory exists — pulling latest..."
    cd "$APP_DIR" && git pull
else
    git clone "$REPO_URL" "$APP_DIR"
fi

# ── 3. Python virtual environment ─────────────────────
echo "[3/8] Setting up Python virtualenv..."
cd "$APP_DIR/backend"
python${PYTHON_VERSION} -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install gunicorn
pip install -r requirements.txt
deactivate

# ── 4. Log directory ──────────────────────────────────
echo "[4/8] Creating log directory..."
sudo mkdir -p /var/log/cloudhisaab
sudo chown ubuntu:ubuntu /var/log/cloudhisaab

# ── 5. .env.local on server ───────────────────────────
echo "[5/8] Checking .env.local..."
if [ ! -f "$APP_DIR/backend/.env.local" ]; then
    echo "  WARNING: $APP_DIR/backend/.env.local not found!"
    echo "  Please copy it manually after this script:"
    echo "    scp -i your-key.pem backend/.env.local ubuntu@EC2_IP:$APP_DIR/backend/.env.local"
fi

# ── 6. Systemd service ────────────────────────────────
echo "[6/8] Installing systemd service..."
sudo cp "$APP_DIR/backend/deploy/cloudhisaab.service" /etc/systemd/system/cloudhisaab.service
sudo systemctl daemon-reload
sudo systemctl enable cloudhisaab
sudo systemctl start cloudhisaab && echo "  Service started ✓" || echo "  Check: sudo journalctl -u cloudhisaab -n 50"

# ── 7. Nginx ──────────────────────────────────────────
echo "[7/8] Configuring Nginx..."

# Temp HTTP-only config for Certbot to validate domain
sudo tee /etc/nginx/sites-available/cloudhisaab-api > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/cloudhisaab-api /etc/nginx/sites-enabled/cloudhisaab-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# ── 8. SSL Certificate ────────────────────────────────
echo "[8/8] Obtaining SSL certificate..."
echo "  Make sure your DNS A record is pointing to this IP first!"
echo "  Press Enter to continue or Ctrl+C to skip for now..."
read -r _

sudo certbot --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos \
    --email "${EMAIL}" \
    --redirect

# Now replace nginx config with the full HTTPS version
sudo cp "$APP_DIR/backend/deploy/nginx.conf" /etc/nginx/sites-available/cloudhisaab-api
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=================================================="
echo "  ✅ DONE!"
echo ""
echo "  GraphQL endpoint: https://${DOMAIN}/graphql"
echo "  Health check:     https://${DOMAIN}/health"
echo "  GraphiQL IDE:     https://${DOMAIN}/graphql"
echo ""
echo "  Service logs:  sudo journalctl -u cloudhisaab -f"
echo "  Nginx logs:    tail -f /var/log/cloudhisaab/access.log"
echo "=================================================="
