# Deploying RAID to sprintraid.uk (IONOS, Apache, systemd, Let's Encrypt)

One-time setup on the IONOS box. Subsequent deploys are `git pull && sudo systemctl restart raid`.

## Prerequisites

- Apache 2.4+ with `proxy`, `proxy_http`, `headers`, `ssl`, `rewrite` modules enabled:
  ```bash
  sudo a2enmod proxy proxy_http headers ssl rewrite
  ```
- Node.js 18+ (`node --version`)
- `certbot` (`sudo apt install certbot python3-certbot-apache`)
- DNS for `sprintraid.uk` and `www.sprintraid.uk` already pointing at this box.

## 1. Create the service user

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin raid
```

## 2. Clone the repo and install

```bash
sudo mkdir -p /var/www
sudo git clone https://github.com/davidmjackson/raid.git /var/www/raid
cd /var/www/raid
sudo npm install --omit=dev
sudo chown -R raid:raid /var/www/raid
```

## 3. Create the `.env` file

```bash
sudo -u raid tee /var/www/raid/.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...your-real-key...
NODE_ENV=production
PORT=3003
EOF
sudo chmod 600 /var/www/raid/.env
```

## 4. Generate the first access key

```bash
sudo -u raid node /var/www/raid/manageKeys.js generate <your-name>
# Copy the printed key — it will not be shown again.
```

## 5. Install the systemd service

```bash
sudo cp /var/www/raid/deploy/systemd/raid.service /etc/systemd/system/raid.service
sudo systemctl daemon-reload
sudo systemctl enable raid
sudo systemctl start raid
sudo systemctl status raid    # confirm it's active (running)
```

Smoke-test the Node app behind localhost before Apache is wired up:

```bash
curl -s http://127.0.0.1:3003/health
# Expected: {"ok":true,"model":"claude-sonnet-4-5"}
```

## 6. Wire up Apache (HTTP first, then TLS)

```bash
sudo cp /var/www/raid/deploy/apache/raid.conf /etc/apache2/sites-available/raid.conf
sudo a2ensite raid
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Test it works over plain HTTP:

```bash
curl -s -H "Host: sprintraid.uk" http://localhost/health
# Expected: {"ok":true,...}
```

## 7. Issue the TLS certificate

```bash
sudo certbot --apache -d sprintraid.uk -d www.sprintraid.uk
```

certbot will:
- Verify domain ownership via HTTP-01.
- Rewrite `raid.conf` (or create a `raid-le-ssl.conf`) with the SSL vhost.
- Add an auto-redirect from HTTP → HTTPS.
- Schedule auto-renewal.

If you prefer to manage the HTTPS vhost manually, uncomment the `<VirtualHost *:443>` block at the bottom of `deploy/apache/raid.conf` instead.

## 8. Verify in the browser

Visit `https://sprintraid.uk/`:

- Redirects to `/login.html`.
- Breathing-waves animation visible.
- Enter the access key from step 4.
- 2×2 grid renders on Generate.

## Subsequent deploys

```bash
cd /var/www/raid
sudo -u raid git pull
sudo -u raid npm install --omit=dev      # only if package.json changed
sudo systemctl restart raid
```

In-memory sessions reset on restart, so everyone signs in again after a deploy. That's by design.

## Troubleshooting

- `systemctl status raid` — see startup errors.
- `journalctl -u raid -n 100 --no-pager` — recent logs.
- `tail -f /var/log/apache2/raid-error.log` — Apache-side errors.
- 502 from Apache → check the Node service is up on `127.0.0.1:3003`.
- "Invalid key" but you're sure the key is correct → confirm `keys.json` is owned by `raid` and the systemd service has write access (`ReadWritePaths=/var/www/raid`).
- After a deploy, no one can sign in → the user that ran `manageKeys.js generate` wasn't the `raid` system user; the keys file may be owned wrong. Run `sudo chown raid:raid /var/www/raid/keys.json`.
