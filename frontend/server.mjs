import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import multer from 'multer';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
const catalogPath = path.join(currentDirectory, 'public', 'data', 'products.json');
const imageUploadDirectory = path.join(currentDirectory, 'public', 'assets', 'images', 'uploads');

if (!adminUsername || !adminPassword || !sessionSecret || sessionSecret.length < 32) {
  throw new Error('Set ADMIN_USERNAME, ADMIN_PASSWORD, and a SESSION_SECRET of at least 32 characters. Run npm start to create local credentials.');
}

const app = express();
app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: { 'img-src': ["'self'", 'data:', 'blob:'] }
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'sabotz.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use('/api/admin', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'The request could not be verified.' });
  }
  next();
});

const loginAttempts = new Map();
const categories = new Set(['Shoes', 'Clothing', 'Accessories']);
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 20, fields: 0, parts: 20 },
  fileFilter: (_req, file, callback) => {
    callback(acceptedImageTypes.has(file.mimetype) ? null : new Error('Use JPG, PNG, WebP, or GIF images.'), acceptedImageTypes.has(file.mimetype));
  }
});

function imageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a') return 'gif';
  return null;
}

function sameSecret(input, expected) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  if (req.session.adminUsername !== adminUsername) return res.status(401).json({ error: 'Admin login required.' });
  next();
}

function validateProduct(body) {
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
  const marca = typeof body?.marca === 'string' ? body.marca.trim() : '';
  const status = typeof body?.status === 'string' ? body.status.trim() : '';
  const categoria = typeof body?.categoria === 'string' ? body.categoria : '';
  const preco = body?.preco;
  const pagina = typeof body?.pagina === 'string' ? body.pagina.trim() : '';
  const fotos = Array.isArray(body?.fotos) ? body.fotos : [];

  if (!nome || nome.length > 140) return 'Product name is required (maximum 140 characters).';
  if (!marca || marca.length > 80) return 'Brand is required (maximum 80 characters).';
  if (!status || status.length > 60) return 'Status is required (maximum 60 characters).';
  if (!categories.has(categoria)) return 'Choose a valid product category.';
  if (preco !== undefined && (typeof preco !== 'number' || !Number.isFinite(preco) || preco < 0 || preco > 10000000)) return 'Enter a valid non-negative product price.';
  if (!/^(?:products\/)?[a-z0-9]+(?:-[a-z0-9]+)*(?:\.html)?$/.test(pagina)) return 'Use a lowercase product slug, for example products/new-shoe.html.';
  if (!fotos.length || fotos.length > 20) return 'Add between 1 and 20 product images.';
  if (fotos.some(photo => typeof photo !== 'string' || !/^assets\/images\/[a-zA-Z0-9._/-]+$/.test(photo) || photo.split('/').includes('..'))) {
    return 'Image paths must point to a file inside assets/images/.';
  }

  return null;
}

async function readProducts() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  if (!catalog || !Array.isArray(catalog.produtos)) throw new Error('The product catalogue has an invalid format.');
  return catalog.produtos;
}

async function writeProducts(produtos) {
  const temporaryPath = `${catalogPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify({ produtos }, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, catalogPath);
}

async function cleanupUnusedUploadedPhotos(photos, products) {
  const referencedPhotos = new Set(products.flatMap(product => product.fotos ?? []));
  const uploadPrefix = 'assets/images/uploads/';
  const unusedFiles = photos
    .filter(photo => photo.startsWith(uploadPrefix) && !referencedPhotos.has(photo))
    .map(photo => photo.slice(uploadPrefix.length))
    .filter(filename => /^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/i.test(filename));

  await Promise.all(unusedFiles.map(filename => fs.rm(path.join(imageUploadDirectory, filename), { force: true }).catch(() => {})));
}

app.get('/api/products', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await readProducts());
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', (req, res, next) => {
  const address = req.ip;
  const now = Date.now();
  const previous = loginAttempts.get(address);
  const current = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + 15 * 60 * 1000 } : previous;
  if (current.count >= 5) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });

  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!sameSecret(username, adminUsername) || !sameSecret(password, adminPassword)) {
    current.count += 1;
    loginAttempts.set(address, current);
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  loginAttempts.delete(address);
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.adminUsername = adminUsername;
    req.session.save(saveError => {
      if (saveError) return next(saveError);
      res.json({ authenticated: true });
    });
  });
});

app.get('/api/admin/session', requireAdmin, (_req, res) => res.json({ authenticated: true }));

app.post('/api/admin/uploads', requireAdmin, (req, res, next) => {
  imageUpload.array('images', 20)(req, res, async error => {
    if (error) {
      const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'Each image must be 5 MB or smaller.'
        : error.message;
      return res.status(400).json({ error: message || 'Could not process the image upload.' });
    }

    const files = req.files ?? [];
    if (!files.length) return res.status(400).json({ error: 'Choose at least one image to upload.' });

    const writtenFiles = [];
    try {
      await fs.mkdir(imageUploadDirectory, { recursive: true });
      const fotos = [];
      for (const file of files) {
        const extension = imageExtension(file.buffer);
        if (!extension) {
          await Promise.all(writtenFiles.map(filePath => fs.rm(filePath, { force: true })));
          return res.status(400).json({ error: 'One of the selected files is not a supported image.' });
        }

        const filename = `${crypto.randomUUID()}.${extension}`;
        const filePath = path.join(imageUploadDirectory, filename);
        await fs.writeFile(filePath, file.buffer, { flag: 'wx' });
        writtenFiles.push(filePath);
        fotos.push(`assets/images/uploads/${filename}`);
      }
      res.status(201).json({ fotos });
    } catch (writeError) {
      await Promise.all(writtenFiles.map(filePath => fs.rm(filePath, { force: true })));
      next(writeError);
    }
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('sabotz.sid', { httpOnly: true, sameSite: 'strict', secure: isProduction });
    res.json({ authenticated: false });
  });
});

app.post('/api/admin/products', requireAdmin, async (req, res, next) => {
  try {
    const validationError = validateProduct(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const products = await readProducts();
    const page = req.body.pagina.trim();
    if (products.some(product => product.pagina === page)) return res.status(409).json({ error: 'This product slug is already in use.' });
    const product = { ...req.body, id: crypto.randomUUID(), nome: req.body.nome.trim(), marca: req.body.marca.trim(), status: req.body.status.trim() };
    products.unshift(product);
    await writeProducts(products);
    res.status(201).json(products);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const validationError = validateProduct(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const products = await readProducts();
    const index = products.findIndex(product => product.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Product not found.' });
    const previousPhotos = products[index].fotos ?? [];
    const page = req.body.pagina.trim();
    if (products.some((product, productIndex) => productIndex !== index && product.pagina === page)) {
      return res.status(409).json({ error: 'This product slug is already in use.' });
    }
    products[index] = { ...req.body, id: req.params.id, nome: req.body.nome.trim(), marca: req.body.marca.trim(), status: req.body.status.trim() };
    await writeProducts(products);
    await cleanupUnusedUploadedPhotos(previousPhotos, products);
    res.json(products);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const products = await readProducts();
    const deletedProduct = products.find(product => product.id === req.params.id);
    const remaining = products.filter(product => product.id !== req.params.id);
    if (remaining.length === products.length) return res.status(404).json({ error: 'Product not found.' });
    await writeProducts(remaining);
    await cleanupUnusedUploadedPhotos(deletedProduct?.fotos ?? [], remaining);
    res.json(remaining);
  } catch (error) {
    next(error);
  }
});

const builtBrowserDirectory = path.join(currentDirectory, 'dist', 'sabotz-angular', 'browser');
const builtDirectory = path.join(currentDirectory, 'dist', 'sabotz-angular');
const staticDirectory = await fs.access(builtBrowserDirectory).then(() => builtBrowserDirectory).catch(() => builtDirectory);
app.use('/assets/images/uploads', express.static(imageUploadDirectory, { maxAge: isProduction ? '1y' : 0 }));
app.use(express.static(staticDirectory, { index: false, maxAge: isProduction ? '1y' : 0 }));
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(staticDirectory, 'index.html'), error => error && next(error));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'An internal server error occurred.' });
});

app.listen(port, () => console.log(`SABOTZ server listening on http://localhost:${port}`));
