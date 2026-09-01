import { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

const UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: Request, _file: any, cb: any) => cb(null, UPLOADS_DIR),
  filename: (_req: Request, file: any, cb: any) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req: Request, file: any, cb: any) => {
    const allowed = ['.pdf', '.dxf', '.dwg', '.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Type de fichier non supporté: ${ext}`));
  },
});

export function creerUploadRouter(pool: Pool): Router {
  const router = Router();

  // POST /api/upload/single — upload un fichier
  router.post('/single', upload.single('file'), async (req: any, res: Response): Promise<void> => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ erreur: 'Aucun fichier reçu.' }); return; }

      const { missionId, chantierId, type, uploadedBy } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO fichiers_chantier (chantier_id, ordre_mission_id, nom_fichier, chemin, type, taille_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [chantierId || null, missionId || null, file.originalname, file.filename, type || 'other', file.size, uploadedBy || null]
      );

      res.status(201).json({
        id: rows[0].id,
        url: `/uploads/${file.filename}`,
        originalname: file.originalname,
        size: file.size,
      });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // Multer error handler — returns JSON instead of generic 500
  router.use((err: any, _req: Request, res: Response, next: any) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ erreur: 'Fichier trop volumineux (max 50 Mo).' }); return;
    }
    if (err && err.code && err.code.startsWith('LIMIT_')) {
      res.status(400).json({ erreur: `Erreur upload: ${err.message}` }); return;
    }
    if (err && err.message && err.message.startsWith('Type de fichier')) {
      res.status(400).json({ erreur: err.message }); return;
    }
    next(err);
  });

  return router;
}
