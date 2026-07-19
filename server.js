import express from 'express';
import { Storage } from '@google-cloud/storage';
import pg from 'pg';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// Security and Proxy
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow Cloudflare CDN, EmulatorJS assets, etc.
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '10kb' })); // Limit body size

// Observability: Request Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  const correlationId = crypto.randomUUID();
  res.set('X-Correlation-ID', correlationId);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${correlationId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Constants
const SUPPORTED_ROM_EXTENSIONS = ['nes', 'sfc', 'smc', 'gen', 'md', 'gb', 'gbc', 'gba', 'z64', 'n64', 'nds', 'cue', 'iso', 'zip'];
const PRIVATE_IP_RANGES = ['127.0.0.1', '::1', '10.', '192.168.'];
const GEOLOCATION_API = 'https://ipapi.co'; // Switched to ipapi.co which supports HTTPS natively

// Initialize GCS storage
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'retrogames-roms-scriptworkspace';
const bucket = storage.bucket(bucketName);

// Initialize Supabase DB pool with optimized settings
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Admin upload secret
const adminSecret = process.env.ADMIN_SECRET || 'supersecretarcade123';

function constantTimeCompare(a, b) {
  const bufA = Buffer.from(a || '');
  const bufB = Buffer.from(b || '');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Helper to hash IP (SHA-256) for privacy-friendly state keys
function getIpHash(req) {
  const ip = req.headers['cf-connecting-ip'] || req.ip || '127.0.0.1';
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// Serve static frontend assets
const staticFiles = ['themes.css', 'sidebar.css', 'sidebar.js', 'app_header.js', 'app_header.css', 'emulator_frame.html'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'retro_arcade.html')));
staticFiles.forEach(file => {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
});

// Health check endpoint for orchestrators
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API: Config
app.get('/api/arcade/config', (req, res) => {
  res.json({ romFolder: 'gcs', saveFolder: 'supabase' });
});

// API: ROMs List (with basic pagination handling for scalability)
app.get('/api/arcade/roms', async (req, res) => {
  try {
    const [files] = await bucket.getFiles({ maxResults: 1000 }); // Protect against massive buckets
    const romNames = files.map(file => file.name).filter(name => {
      const ext = name.split('.').pop().toLowerCase();
      return SUPPORTED_ROM_EXTENSIONS.includes(ext);
    });
    res.json({ roms: romNames });
  } catch (error) {
    console.error('Error fetching ROMs list:', error);
    res.status(500).json({ error: 'Failed to list ROMs from bucket' });
  }
});

// Validate filename for path traversal
function validateFilename(filename) {
  const normalized = path.normalize(filename);
  if (normalized.includes('..') || normalized.startsWith('/') || normalized.startsWith('\\')) return null;
  return normalized;
}

// API: Raw ROM Stream
app.get('/api/arcade/raw/:filename', async (req, res) => {
  const rawFilename = decodeURIComponent(req.params.filename);
  const filename = validateFilename(rawFilename);
  
  if (!filename) {
    return res.status(400).send('Invalid filename');
  }

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

// Schema validation for game queries
const gameQuerySchema = z.object({
  game: z.string().min(1).max(255)
});

// API: Load Save State
app.get('/api/arcade/state', async (req, res) => {
  const parseResult = gameQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Valid game parameter required' });
  }
  const gameName = parseResult.data.game;
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
  const parseResult = gameQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Valid game parameter required' });
  }
  const gameName = parseResult.data.game;
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

  const isPrivateIp = PRIVATE_IP_RANGES.some(prefix => ip.startsWith(prefix));

  // Geolocation using HTTPS API
  if (ip && !isPrivateIp) {
    try {
      const geoRes = await fetch(`${GEOLOCATION_API}/${ip}/json/`, { timeout: 3000 });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (!geoData.error) {
          region = geoData.region || region;
          city = geoData.city || city;
          isp = geoData.org || isp;
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

// Admin routes with rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin Upload Route: GET Form (No secret in URL needed anymore)
app.get('/admin/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Admin Upload Route: POST handler (Expects Authorization header)
const upload = multer({ storage: multer.memoryStorage() });
app.post('/admin/upload', uploadLimiter, upload.single('rom'), async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token || !constantTimeCompare(token, adminSecret)) {
    return res.status(403).send('Forbidden: Invalid or missing token');
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
    res.status(200).send('ROM uploaded successfully');
  });

  blobStream.end(req.file.buffer);
});

// Start Server and Handle Graceful Shutdown
const server = app.listen(port, () => {
  console.log(`Retro Games Server listening on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    pool.end(() => process.exit(0));
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    pool.end(() => process.exit(0));
  });
});
