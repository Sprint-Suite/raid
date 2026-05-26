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

The repo is private. Use the **SSH URL** to match the rest of the suite
(scrumpoker, retrospective) — the IONOS box already has an SSH key
registered with GitHub, so no extra credential setup is needed.

```bash
# As yourself, NOT sudo — sudo runs as root and root doesn't have your SSH key.
cd ~
git clone git@github.com:davidmjackson/raid.git

sudo mv ~/raid /var/www/raid
sudo chown -R $USER:raid /var/www/raid    # you own files, raid is the group
sudo chmod -R g+rX /var/www/raid          # group can read + enter dirs

cd /var/www/raid
sudo npm install --omit=dev
```

If the IONOS box doesn't have SSH set up for GitHub yet, fall back to
HTTPS with a credential helper (one-time):

```bash
git config --global credential.helper store
gh auth login                              # if gh is installed
# OR enter a Personal Access Token when prompted on the first pull
```

Avoid `sudo git clone` either way — root has no GitHub auth.

## 3. Create the `.env` file

```bash
# Owned by you (so you can edit), readable by raid, nobody else.
sudo touch /var/www/raid/.env
sudo chown $USER:raid /var/www/raid/.env
sudo chmod 640 /var/www/raid/.env
sudo tee -a /var/www/raid/.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...your-real-key...
NODE_ENV=production
PORT=3003
EOF
```

## 4. Generate the first access key

Run as the `raid` user so `keys.json` is owned by `raid:raid` (only the
service ever writes to it; you never need to edit it by hand).

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

Permission model: you own the code, the `raid` system user only reads it.
That means deploys are plain `git pull` under your own login.

```bash
cd /var/www/raid
git pull                                 # your gh-authenticated git, no sudo
sudo npm install --omit=dev              # only if package.json changed
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
- `git pull` says "Permission denied" → the working tree is owned by `raid`, not by you. Fix once with `sudo chown -R $USER:raid /var/www/raid && sudo chmod -R g+rX /var/www/raid`.
- `git clone` prompts for username/password → either the repo is private and you used the HTTPS URL (use `git@github.com:...` instead — SSH key on the box authenticates with no prompt), or you ran with `sudo` (root has no GitHub auth — clone as yourself, then `sudo mv` into place).
- Already cloned via HTTPS and `git pull` prompts each time → switch the remote: `git remote set-url origin git@github.com:davidmjackson/raid.git`.
