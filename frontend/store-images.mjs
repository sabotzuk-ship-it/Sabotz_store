import { stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const widths = new Set([160, 480, 800, 1280, 1920]);
const imagePath = /^assets\/images\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(?:jpe?g|png|webp)$/i;

export function registerStoreImages(app, publicDirectory) {
  const cache = new Map();
  app.get('/api/images/:width', async (req, res, next) => {
    const width = Number(req.params.width);
    const source = req.query.path;
    if (!widths.has(width) || typeof source !== 'string' || !imagePath.test(source)) return res.sendStatus(404);

    const file = path.join(publicDirectory, source);
    try {
      const metadata = await stat(file);
      if (!metadata.isFile()) return res.sendStatus(404);
      const key = `${source}:${metadata.mtimeMs}:${width}`;
      let output = cache.get(key);
      if (!output) {
        if (cache.size >= 96) cache.delete(cache.keys().next().value);
        const quality = width === 160 ? 74 : width >= 1280 ? 92 : 88;
        output = sharp(file).autoOrient()
          .resize({ width, height: Math.round(width * 1.6), fit: 'inside', withoutEnlargement: true })
          .webp({ quality }).toBuffer();
        cache.set(key, output);
      }
      const bytes = await output.catch(error => {
        cache.delete(key);
        throw error;
      });
      res.set('Cache-Control', 'public, max-age=86400');
      res.type('webp').send(bytes);
    } catch (error) {
      if (error.code === 'ENOENT') return res.sendStatus(404);
      next(error);
    }
  });
}
