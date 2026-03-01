# CloudHisaab — Backend EC2 Deployment Guide

**GraphQL endpoint after deploy:** `https://api.cloudhisab.in/graphql`

---

## Pre-requisites

- AWS EC2 instance (Ubuntu 22.04, `t3.micro` — free tier eligible)
- EC2 Security Group inbound rules:
  - Port 22 (SSH)  — your IP only
  - Port 80 (HTTP) — 0.0.0.0/0
  - Port 443 (HTTPS) — 0.0.0.0/0
- EC2 IAM Role attached with policies for:
  - `AmazonDynamoDBFullAccess`
  - `AmazonS3FullAccess`
  - `AmazonSQSFullAccess`
  - `AmazonCognitoReadOnly`
- Domain `cloudhisab.in` purchased ✅
- Git repo with the backend code

---

## Step 1 — DNS Record

At your domain registrar (GoDaddy / Namecheap / Hostinger):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A    | api  | `<EC2-PUBLIC-IP>` | 300 |

> This makes `api.cloudhisab.in` point to your EC2 instance.
> Wait 5-10 min for DNS to propagate before running Certbot.

---

## Step 2 — Launch EC2

1. AWS Console → EC2 → Launch Instance
2. **AMI:** Ubuntu 22.04 LTS
3. **Instance type:** `t3.micro` (free tier)
4. **Key pair:** Create/select your `.pem` key
5. **Security group:** Allow SSH (22), HTTP (80), HTTPS (443)
6. **IAM role:** Attach role with DynamoDB + S3 + SQS access
7. Launch → note the public IP

---

## Step 3 — Push Code to GitHub

```bash
# On your LOCAL machine
cd /home/eshan/Desktop/cloudhisaab
git init   # if not already a repo
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/cloudhisaab.git
git push -u origin main
```

---

## Step 4 — SSH into EC2 & Run Setup Script

```bash
# From your LOCAL machine
chmod 400 ~/your-key.pem
ssh -i ~/your-key.pem ubuntu@<EC2-PUBLIC-IP>

# Once inside EC2:
# First edit the setup script with your repo URL and email
curl -o setup_ec2.sh https://raw.githubusercontent.com/YOUR_USERNAME/cloudhisaab/main/backend/deploy/setup_ec2.sh

# Edit the two variables at the top:
nano setup_ec2.sh
# REPO_URL="https://github.com/YOUR_USERNAME/cloudhisaab.git"
# EMAIL="your@email.com"

chmod +x setup_ec2.sh
bash setup_ec2.sh
```

---

## Step 5 — Upload .env.local

The `.env.local` file is NOT in git (secrets). Copy it manually:

```bash
# From your LOCAL machine
scp -i ~/your-key.pem \
    /home/eshan/Desktop/cloudhisaab/backend/.env.local \
    ubuntu@<EC2-PUBLIC-IP>:/home/ubuntu/cloudhisaab/backend/.env.local
```

Then add the ALLOWED_ORIGINS for CORS:

```bash
# On EC2
echo "ALLOWED_ORIGINS=https://cloudhisab.in,https://www.cloudhisab.in" \
    >> /home/ubuntu/cloudhisaab/backend/.env.local

# Restart the service to pick up new env
sudo systemctl restart cloudhisaab
```

---

## Step 6 — Verify It's Working

```bash
# Health check
curl https://api.cloudhisab.in/health
# Expected: {"status":"ok","service":"cloudhisaab-api"}

# GraphQL introspection
curl -X POST https://api.cloudhisab.in/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
# Expected: {"data":{"__typename":"Query"}}
```

Open in browser: **https://api.cloudhisab.in/graphql** → GraphiQL IDE

---

## Useful Commands on EC2

```bash
# View live logs
sudo journalctl -u cloudhisaab -f

# Restart service
sudo systemctl restart cloudhisaab

# Check service status
sudo systemctl status cloudhisaab

# Reload nginx
sudo systemctl reload nginx

# Renew SSL (auto-renews via cron, but manual test)
sudo certbot renew --dry-run
```

---

## Step 7 — Update Frontend .env.local

```bash
# In /home/eshan/Desktop/cloudhisaab/frontend/.env.local
NEXT_PUBLIC_GRAPHQL_URL=https://api.cloudhisab.in/graphql
```

---

## Future Deploys (after code changes)

```bash
# From LOCAL machine — edit deploy/deploy.sh with your EC2 IP and key path, then:
bash /home/eshan/Desktop/cloudhisaab/backend/deploy/deploy.sh
```

---

## Architecture After Deploy

```
Browser / Next.js (Vercel)
         │
         │  HTTPS POST /graphql
         ▼
   api.cloudhisab.in  (EC2 t3.micro)
         │
   Nginx (SSL termination, reverse proxy)
         │
   Gunicorn + Uvicorn workers
   :8000 → graphql_api.main:app
         │
   ┌─────┼──────────────────────┐
   │     │                      │
DynamoDB  S3          SQS     Cognito
(per-org  (invoices)  (PDF    (auth JWT)
 tables)              jobs)
```
