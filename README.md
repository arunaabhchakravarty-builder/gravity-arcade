# Gravity Arcade 🕹️

A sleek, responsive, and standalone Retro Arcade web application powered by [EmulatorJS](https://emulatorjs.org/) and Google Cloud Run.

## Features

- **Full-stack Emulation:** Play classic retro games directly in your browser.
- **Persistent Save States:** Game progress is automatically saved to a PostgreSQL (Supabase) database and securely linked to a hashed version of your IP address.
- **Custom Mobile Gamepad:** A responsive, multi-touch virtual gamepad optimized for mobile devices with a classic SNES layout.
- **Multiple Themes:** Choose from 7 high-fidelity UI themes including Cyber Obsidian, Sovereign Light, Holographic Glass, and more.
- **Cloud Storage:** ROM files are served directly from a Google Cloud Storage bucket via secure streaming.
- **Admin UI:** Secure frontend for uploading new ROMs directly to the cloud.

## Architecture

- **Frontend:** Vanilla HTML/CSS/JS (No framework bloat).
- **Backend:** Node.js / Express.js.
- **Storage:** Google Cloud Storage (ROMs).
- **Database:** PostgreSQL via Supabase (Save states & analytics).
- **Hosting:** Dockerized and deployed via Google Cloud Run.

## Local Setup

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (for GCS access)
- A PostgreSQL database (e.g., [Supabase](https://supabase.com/))

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Ensure the following variables are set in your `.env`:
- `PORT`: (Optional) Port for the server (default: 8080).
- `GCS_BUCKET_NAME`: Your Google Cloud Storage bucket name where ROMs are stored.
- `DATABASE_URL`: Connection string for your PostgreSQL database.
- `ADMIN_SECRET`: A secure passphrase used to authenticate admin uploads.

### 4. Database Setup

Run the SQL commands found in `database_migrations.sql` against your PostgreSQL database to create the required indexes.

Ensure your database has the following tables:
- `arcade_save_states` (Columns: `ip_hash`, `game_name`, `state_data`, `updated_at`)
- `arcade_visits` (Columns: `ip`, `country`, `region`, `city`, `isp`, `game`, `visited_at`)

### 5. Start the Server

```bash
npm start
```

Visit `http://localhost:8080` in your browser.

## Deployment

This project includes a `Dockerfile` optimized for Google Cloud Run.

To deploy via the gcloud CLI:

```bash
gcloud run deploy retrogames \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

## Admin ROM Uploading

To upload ROMs, navigate to `/admin/upload` in your browser. Enter your `ADMIN_SECRET` into the Authentication field to access the secure upload form. Uploaded `.nes`, `.sfc`, `.md`, `.gba`, etc., files will automatically be pushed to your configured GCS bucket and appear in the Arcade ROM Lounge.
