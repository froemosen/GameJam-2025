# Flask Server Setup

This directory contains a Flask application with Docker support for serving the Three.js game.

## Quick Start

### Local Development (Windows)
```powershell
# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
# or
.\run.ps1
```

### Local Development (Linux/Mac)
```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
# or
chmod +x run.sh && ./run.sh
```

The server will start on `http://localhost:5500`

## Docker

### Build the Docker image
```bash
docker build -t gamejam-2025 .
```

### Run the container
```bash
docker run -p 5500:5500 gamejam-2025
```

### Using Docker Compose (Recommended)
```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

## Cloudflare Tunnel

To use with Cloudflare Tunnel:

```bash
# Make sure the Flask server is running first
python app.py

# Then in another terminal, start the tunnel
cloudflared tunnel --url http://localhost:5500
```

## Endpoints

- `/` - Main game page
- `/src/<path>` - Source files (JavaScript)
- `/assets/<path>` - Game assets (models, textures, sounds)
- `/health` - Health check endpoint

## Environment Variables

- `PORT` - Server port (default: 5500)
- `FLASK_ENV` - Flask environment (development/production)

## Production Deployment

The Dockerfile uses `gunicorn` for production deployment with:
- 2 workers
- 4 threads per worker
- Optimized for serving static files

For production, consider using a reverse proxy like Nginx in front of the Flask app.
