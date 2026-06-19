const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

app.use(cors({ origin: '*' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'EXON Telegram Proxy', version: '1.1.0' });
});

// ── FAYL YUBORISH — birinchi bo'lishi kerak ──
app.post('/bot:token/sendDocument', upload.single('document'), async (req, res) => {
  await handleFileUpload(req, res, 'sendDocument', 'document');
});

app.post('/bot:token/sendPhoto', upload.single('photo'), async (req, res) => {
  await handleFileUpload(req, res, 'sendPhoto', 'photo');
});

// ── MATNLI SO'ROVLAR — keyin ──
app.post('/bot:token/:method', express.json(), async (req, res) => {
  const { token, method } = req.params;
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await tgRes.json();
    res.status(tgRes.status).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, description: err.message });
  }
});

async function handleFileUpload(req, res, method, fieldName) {
  const { token } = req.params;
  const file = req.file;

  if (!file) {
    res.status(400).json({ ok: false, description: 'Fayl topilmadi' });
    return;
  }

  try {
    const form = new FormData();
    form.append('chat_id', req.body.chat_id);

    form.append(fieldName, fs.createReadStream(file.path), {
      filename: req.body.filename || file.originalname || 'file',
      contentType: file.mimetype,
    });

    if (req.body.caption) form.append('caption', req.body.caption);
    if (req.body.parse_mode) form.append('parse_mode', req.body.parse_mode);

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    const data = await tgRes.json();
    res.status(tgRes.status).json(data);
  } catch (err) {
    console.error(`[${method}] Xatolik:`, err.message);
    res.status(500).json({ ok: false, description: err.message });
  } finally {
    try { fs.unlinkSync(file.path); } catch (e) {}
  }
}

setInterval(() => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(UPLOAD_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 10 * 60 * 1000) fs.unlinkSync(fp);
    }
  } catch (e) {}
}, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`EXON Telegram Proxy ishga tushdi: http://localhost:${PORT}`);
});
