import express from 'express';
import { Storage } from '@google-cloud/storage';
import pg from 'pg';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// Enable trust proxy so express can read real visitor IPs from headers like X-Forwarded-For
app.set('trust proxy', true);

// Middlewares
app.use(express.json());

// Initialize GCS storage
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'retrogames-roms-scriptworkspace';
const bucket = storage.bucket(bucketName);

// Initialize Supabase DB pool
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Admin upload secret
const adminSecret = process.env.ADMIN_SECRET || 'supersecretarcade123';

// Helper to hash IP (SHA-256) for privacy-friendly state keys
function getIpHash(req) {
  const ip = req.headers['cf-connecting-ip'] || req.ip || '127.0.0.1';
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// Serve static frontend assets
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'retro_arcade.html'));
});
app.get('/themes.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'themes.css'));
});
app.get('/sidebar.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'sidebar.css'));
});
app.get('/sidebar.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'sidebar.js'));
});
app.get('/app_header.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app_header.js'));
});
app.get('/app_header.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'app_header.css'));
});
app.get('/emulator_frame.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'emulator_frame.html'));
});

// API: Config
app.get('/api/arcade/config', (req, res) => {
  res.json({
    romFolder: 'gcs',
    saveFolder: 'supabase'
  });
});

// API: ROMs List
app.get('/api/arcade/roms', async (req, res) => {
  try {
    const [files] = await bucket.getFiles();
    const romNames = files.map(file => file.name).filter(name => {
      const ext = name.split('.').pop().toLowerCase();
      return ['nes', 'sfc', 'smc', 'gen', 'md', 'gb', 'gbc', 'gba', 'z64', 'n64', 'nds', 'cue', 'iso', 'zip'].includes(ext);
    });
    res.json({ roms: romNames });
  } catch (error) {
    console.error('Error fetching ROMs list:', error);
    res.status(500).json({ error: 'Failed to list ROMs from bucket' });
  }
});

// API: Raw ROM Stream
app.get('/api/arcade/raw/:filename', async (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  try {
    const file = bucket.file(filename);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).send('ROM not found');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    file.createReadStream().pipe(res);
  } catch (error) {
    console.error(`Error streaming ROM ${filename}:`, error);
    res.status(500).send('Error streaming ROM');
  }
});

// API: Load Save State
app.get('/api/arcade/state', async (req, res) => {
  const gameName = req.query.game;
  if (!gameName) {
    return res.status(400).json({ error: 'Game parameter required' });
  }

  const ipHash = getIpHash(req);

  try {
    const query = 'SELECT state_data, updated_at FROM arcade_save_states WHERE ip_hash = $1 AND game_name = $2';
    const result = await pool.query(query, [ipHash, gameName]);

    if (result.rows.length === 0) {
      return res.status(404).send('No save state found');
    }

    const row = result.rows[0];
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Last-Modified', row.updated_at.toUTCString());
    res.send(row.state_data);
  } catch (error) {
    console.error('Error loading save state:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// API: Save State
app.post('/api/arcade/state', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
  const gameName = req.query.game;
  if (!gameName) {
    return res.status(400).json({ error: 'Game parameter required' });
  }

  const ipHash = getIpHash(req);
  const stateData = req.body;

  if (!stateData || stateData.length === 0) {
    return res.status(400).json({ error: 'Empty save state data' });
  }

  try {
    const query = `
      INSERT INTO arcade_save_states (ip_hash, game_name, state_data, updated_at) 
      VALUES ($1, $2, $3, NOW()) 
      ON CONFLICT (ip_hash, game_name) 
      DO UPDATE SET state_data = EXCLUDED.state_data, updated_at = NOW()
    `;
    await pool.query(query, [ipHash, gameName, stateData]);
    res.json({ success: true, message: 'State saved successfully' });
  } catch (error) {
    console.error('Error saving state:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// API: Log Visit
app.post('/api/arcade/visit', async (req, res) => {
  const { game } = req.body;
  const ip = req.headers['cf-connecting-ip'] || req.ip || '127.0.0.1';
  const country = req.headers['cf-ipcountry'] || 'Unknown';

  let region = 'Unknown';
  let city = 'Unknown';
  let isp = 'Unknown';

  // Attempt IP Geolocation using ip-api.com (if not local IP)
  if (ip && ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('10.') && !ip.startsWith('192.168.')) {
    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,regionName,city,isp`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.status === 'success') {
          region = geoData.regionName || region;
          city = geoData.city || city;
          isp = geoData.isp || isp;
        }
      }
    } catch (err) {
      console.warn('Geolocation lookup failed:', err.message);
    }
  }

  try {
    const query = `
      INSERT INTO arcade_visits (ip, country, region, city, isp, game, visited_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;
    await pool.query(query, [ip, country, region, city, isp, game || 'Arcade Landing']);
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging visit:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin Upload Route: GET Form
app.get('/admin/upload', (req, res) => {
  const secret = req.query.secret;
  if (secret !== adminSecret) {
    return res.status(403).send('Forbidden: Invalid Secret');
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🕹️ Retro Arcade ROM Uploader</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f1f5f9; padding: 2rem; }
        .card { background: #1e293b; padding: 2rem; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #38bdf8; }
        input[type=file] { margin: 1rem 0; display: block; }
        button { background: #0284c7; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: bold; }
        button:hover { background: #0369a1; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>ROM Uploader</h1>
        <form action="/admin/upload?secret=${secret}" method="POST" enctype="multipart/form-data">
          <label>Select ROM File (.nes, .sfc, .md, .gba, etc.):</label>
          <input type="file" name="rom" required />
          <button type="submit">Upload to GCS</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Admin Upload Route: POST handler
const upload = multer({ storage: multer.memoryStorage() });
app.post('/admin/upload', upload.single('rom'), async (req, res) => {
  const secret = req.query.secret;
  if (secret !== adminSecret) {
    return res.status(403).send('Forbidden: Invalid Secret');
  }

  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  const blob = bucket.file(req.file.originalname);
  const blobStream = blob.createWriteStream({
    resumable: false,
    contentType: req.file.mimetype
  });

  blobStream.on('error', (err) => {
    console.error('Upload to GCS error:', err);
    res.status(500).send('Upload to GCS failed');
  });

  blobStream.on('finish', () => {
    res.send(`
      <html>
      <body style="background: #0f172a; color: #f1f5f9; font-family: sans-serif; text-align: center; padding-top: 5rem;">
        <h1 style="color: #4ade80;">Success!</h1>
        <p>ROM <strong>${req.file.originalname}</strong> successfully uploaded to GCS.</p>
        <p><a href="/?ts=${Date.now()}" style="color: #38bdf8;">Return to Arcade</a></p>
      </body>
      </html>
    `);
  });

  blobStream.end(req.file.buffer);
});

// Start Server
app.listen(port, () => {
  console.log(`Retro Games Server listening on port ${port}`);
});
