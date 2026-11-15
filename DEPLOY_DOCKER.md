# Docker Deployment

The Aliyun ECS server runs the application stack with Docker Compose:

- `web`: Vue build served by Nginx on `127.0.0.1:8080`
- `oauth`: Spring OAuth service on the internal Docker network
- `user`: Spring user service on the internal Docker network

MySQL is not managed by Compose. The application containers connect to the
existing MySQL instance on the ECS host through `host.docker.internal`.

The backend images run with `SPRING_PROFILES_ACTIVE=prod`. Local backend runs
use the default `dev` profile from `application.yml`.

Only the web container is published, and only to loopback. A host Nginx
instance should terminate HTTPS and proxy to `127.0.0.1:8080`.

## 1. Prepare the server

Verify the required tools:

```bash
tar --version
flock --version
docker --version
docker compose version
nginx -v
```

Install any missing packages for your Aliyun image. For Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y tar util-linux nginx docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

For Alibaba Cloud Linux or another RPM-based image:

```bash
sudo dnf install -y tar util-linux nginx docker docker-compose-plugin
sudo systemctl enable --now docker
```

If the package repository does not provide `docker-compose-plugin`, install the
Docker Compose plugin before continuing and confirm `docker compose version`
works.

Create the deployment directory:

```bash
sudo mkdir -p /opt/super-star
sudo chown -R "$USER":"$USER" /opt/super-star
```

Create `/opt/super-star/.env`:

```bash
cd /opt/super-star
umask 077
cat > .env <<EOF
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=super_star_app
MYSQL_PASSWORD=the-existing-password-for-super_star_app
USER_INTERNAL_TOKEN=$(openssl rand -hex 32)
EOF
```

Run this command only once. `MYSQL_PASSWORD` is the existing password for the
application database user, not a new random password. `USER_INTERNAL_TOKEN` is
generated once and then reused by both the OAuth and User containers. Do not
commit this file.

## 2. Initialize the existing MySQL

Use an administrative account to create both databases and a dedicated
application user. Replace the password with the same value stored in
`MYSQL_PASSWORD`:

```sql
CREATE DATABASE IF NOT EXISTS super_star_user
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS super_star_oauth
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'super_star_app'@'%'
  IDENTIFIED BY 'your-generated-password';

GRANT ALL PRIVILEGES ON super_star_user.* TO 'super_star_app'@'%';
GRANT ALL PRIVILEGES ON super_star_oauth.* TO 'super_star_app'@'%';
FLUSH PRIVILEGES;
```

The MySQL service must accept connections from the Docker bridge. If MySQL only
listens on `127.0.0.1`, update `bind-address` in the MySQL configuration and
restart MySQL. Keep port `3306` closed in the Aliyun security group.

## 3. Configure host Nginx

First identify the operating system:

```bash
cat /etc/os-release
```

For Alibaba Cloud Linux, CentOS or another RPM-based image:

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
```

Use `sudo yum install -y nginx` if `dnf` is unavailable.

For Ubuntu or Debian:

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

Check the Nginx installation:

```bash
nginx -v
sudo systemctl status nginx --no-pager
```

Create the site configuration:

```bash
sudo tee /etc/nginx/conf.d/super-star.conf >/dev/null <<'EOF'
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF
```

Replace `example.com` with the real domain. When testing without a domain,
replace it with:

```nginx
server_name _;
```

Check whether a default site is also listening on port 80:

```bash
ls -la /etc/nginx/conf.d
ls -la /etc/nginx/sites-enabled 2>/dev/null || true
```

If Ubuntu's default site conflicts, disable it:

```bash
sudo unlink /etc/nginx/sites-enabled/default
```

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Verify the Docker web container first:

```bash
curl -I http://127.0.0.1:8080
```

Then verify host Nginx:

```bash
curl -I -H "Host: example.com" http://127.0.0.1
```

Open ports `80` and `443` in the Aliyun security group. If `firewalld` is
running:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

If SELinux is enforcing, check it with:

```bash
getenforce
```

When SELinux blocks Nginx from proxying to the Docker container, enable the
network connection policy:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

The host Nginx proxies the domain to:

```text
http://127.0.0.1:8080
```

The web container proxies `/api/` to the OAuth container. Add HTTPS with an
Aliyun certificate or Certbot after HTTP works.

## 4. Configure GitHub

Create an environment named `production` with these Environment secrets:

```text
ALIYUN_HOST
ALIYUN_USER
ALIYUN_SSH_KEY
ALIYUN_PORT
```

Add the same four secrets to the **backend repository's** `production`
environment as well. GitHub secrets are repository-scoped and are not shared
between the frontend and backend repositories.

Both workflows declare `environment: production`. If the environment has a
different name, update `.github/workflows/deploy.yml` in both repositories.

## 5. Push both repositories

Push the backend Dockerfile and the frontend deployment files:

```powershell
git -C "D:\ideaWorkspace\super-star" add Dockerfile .dockerignore
git -C "D:\ideaWorkspace\super-star" commit -m "build: add Docker image"
git -C "D:\ideaWorkspace\super-star" push origin main

git -C "E:\vscode workspace\super-star-web" add .
git -C "E:\vscode workspace\super-star-web" commit -m "build: deploy Docker stack"
git -C "E:\vscode workspace\super-star-web" push origin main
```

Either push starts its repository workflow:

- Frontend: `Deploy Docker Stack To Aliyun`
- Backend: `Deploy Backend To Aliyun`

Both workflows call the shared `deploy/deploy-stack.sh` script after pulling the
latest frontend repository. A server-side lock prevents concurrent deployments.
The workflow checks out both repositories on GitHub Actions, packages the source
into a temporary archive, uploads it through SCP, and builds the images from the
extracted temporary directory. The ECS server does not access GitHub or run
`git clone`.

## 6. Verify

```bash
cd /opt/super-star/frontend/deploy
sudo docker compose --env-file /opt/super-star/.env ps
sudo docker compose --env-file /opt/super-star/.env logs -f oauth user web
curl -I http://127.0.0.1:8080
```

Confirm the backend profiles and Compose services:

```bash
sudo docker compose --env-file /opt/super-star/.env exec user \
  printenv SPRING_PROFILES_ACTIVE
sudo docker compose --env-file /opt/super-star/.env exec oauth \
  printenv SPRING_PROFILES_ACTIVE
sudo docker compose --env-file /opt/super-star/.env ps --services
```

The profile commands should print `prod`, and Compose should list only:

```text
user
oauth
web
```

Open the public domain after host Nginx and DNS are configured.

## Updates and rollback

Frontend pushes to `main` trigger `Deploy Docker Stack To Aliyun`. Backend
pushes to `main` trigger `Deploy Backend To Aliyun`. Both workflows update the
same Docker Compose stack.

Rollback options:

```bash
git revert <bad-commit>
git push origin main
```

The revert push starts a new deployment from a known-good commit. MySQL data is
not affected because it is outside Docker Compose.
