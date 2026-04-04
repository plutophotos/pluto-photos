# Pluto Photos — Docker Server

Run Pluto Photos as a self-hosted photo library server accessible from any browser. No desktop or Electron required.

## Install

### Step 1 — Download the required files

Create a directory of your choice to hold the `docker-compose.yml` and `.env` files.

```bash
mkdir ./pluto-photos
cd ./pluto-photos
```

Download `docker-compose.yml` and `example.env`:

```bash
wget -O docker-compose.yml https://plutophotos.com/docker/docker-compose.yml
wget -O .env https://plutophotos.com/docker/example.env
```

Or download them manually from [plutophotos.com/docker](https://plutophotos.com/docker/) and rename `example.env` to `.env`.

### Step 2 — Edit the .env file

Open `.env` in any text editor and set these two values:

```env
# Point this to your photo library on the host machine
UPLOAD_LOCATION=/mnt/photos

# Set a password for the web interface
PLUTO_WEB_PASSWORD=pick-a-strong-password
```

That's it. The rest of the defaults are fine for most users.

### Step 3 — Start the container

```bash
docker compose up -d
```

Open **https://your-server-ip:3456** in any browser, accept the self-signed certificate warning, and log in with `admin` / your password.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PLUTO_DATA_DIR` | `/data` | Database, thumbnails, and TLS certs |
| `PLUTO_MEDIA_DIRS` | `/photos` | Comma-separated media directories to scan |
| `PLUTO_PORT` | `3456` | API server port |
| `PLUTO_WEB_USERNAME` | `admin` | Initial web login username |
| `PLUTO_WEB_PASSWORD` | *(none)* | Initial web login password (set on first run) |
| `PLUTO_SCAN_INTERVAL` | `60` | Minutes between automatic re-scans (0 = disabled) |
| `PLUTO_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `PLUTO_LICENSE_SERVER` | `https://license.plutophotos.com` | License server URL |

## Volumes

| Path | Purpose |
|---|---|
| `/photos` | Your photo library (can be read-only) |
| `/data` | Persistent data — database, thumbnail cache, TLS certificates |

### Multiple Photo Directories

Add extra volume mounts to `docker-compose.yml` and list them in your `.env`:

**docker-compose.yml** — add extra mounts:
```yaml
volumes:
  - ${UPLOAD_LOCATION}:/photos:ro
  - /mnt/camera-roll:/camera:ro       # add this line
  - pluto-data:/data
```

**.env** — tell Pluto to scan both:
```env
PLUTO_MEDIA_DIRS=/photos,/camera
```

## Building from Source

```bash
cd "Pluto Photos"
docker build -t plutophotos/server .
```

Then create a `.env` file (copy from `example.env`) and run:

```bash
docker compose up -d
```

## Features

All features from the Pluto Photos web gallery are available:

- **Photo browsing** — folders, albums, projects
- **Smart albums** — dynamic filters by type, rating, tag, date, GPS, person
- **People / faces** — view detected people and their photos
- **Search** — filter by filename
- **Themes** — cyber, dark, and light themes
- **HTTPS** — self-signed TLS certificates are auto-generated
- **Authentication** — password-protected access with rate limiting
- **Auto-scan** — periodically detects new photos in mounted directories
- **Thumbnail generation** — automatic for images, videos, PDFs, and PSDs
- **GPS extraction** — automatic EXIF GPS parsing with Google Takeout sidecar support
- **Immich import** — import photos directly from an Immich server via API key (downloads originals to `/imports/immich`)

## Architecture

```
┌─────────────────────────────────────────────┐
│  Docker Container                           │
│                                             │
│  ┌─────────────────────────────────┐        │
│  │  src/server/index.js            │        │
│  │  (Headless entry point)         │        │
│  │                                 │        │
│  │  • DB init + migrations         │        │
│  │  • Media scanning               │        │
│  │  • Thumbnail generation         │        │
│  │  • GPS extraction               │        │
│  └────────────┬────────────────────┘        │
│               │                             │
│  ┌────────────▼────────────────────┐        │
│  │  src/main/api-server.js         │        │
│  │  (HTTP/HTTPS API + Web Gallery) │◄──── :3456
│  │                                 │        │
│  │  • Authentication               │        │
│  │  • REST API endpoints           │        │
│  │  • SPA web gallery              │        │
│  └────────────┬────────────────────┘        │
│               │                             │
│  ┌────────────▼──────┐  ┌───────────────┐  │
│  │  license.js       │  │  web-ui.js    │  │
│  │  (License mgmt)   │  │  (SPA HTML)   │  │
│  └───────────────────┘  └───────────────┘  │
│                                             │
│  /data (volume)         /photos (volume)    │
│  ├── image_catalog.db   └── *.jpg/png/...   │
│  ├── thumbnails/                            │
│  └── tls/                                   │
└─────────────────────────────────────────────┘
```

## NAS Deployment

### Synology (Container Manager)

1. Pull the image or build from source
2. Create a container with:
   - Port: `3456 → 3456`
   - Volume: `/volume1/photos → /photos` (read-only)
   - Volume: `pluto-data → /data`
   - Environment: `PLUTO_WEB_PASSWORD=yourpassword`

### Unraid

1. Add the container via Community Applications or manually
2. Map your photo share to `/photos`
3. Create a persistent volume for `/data`
4. Set the `PLUTO_WEB_PASSWORD` environment variable

### TrueNAS SCALE

1. Launch a custom app with the Docker image
2. Mount your photo dataset to `/photos`
3. Use a persistent volume claim for `/data`

## Reverse Proxy (Optional)

For trusted TLS certificates, put a reverse proxy in front:

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name photos.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/photos.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/photos.yourdomain.com/privkey.pem;

    client_max_body_size 0;

    location / {
        proxy_pass https://localhost:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

```
photos.yourdomain.com {
    reverse_proxy https://localhost:3456 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

## Troubleshooting

### Certificate warnings
The server generates self-signed TLS certificates. Your browser will show a warning — this is expected. Accept the certificate or use a reverse proxy with Let's Encrypt.

### Permission denied on /photos
Ensure the photos directory is readable by UID 1000 (the `pluto` user inside the container), or run with `--user $(id -u):$(id -g)`.

### Slow thumbnail generation
Thumbnail generation happens in the background after scanning. Large libraries (10,000+ files) may take several minutes on first run. Progress is logged to stdout.
