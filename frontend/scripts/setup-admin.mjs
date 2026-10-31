import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environmentFile = path.join(projectDirectory, '.env');

try {
  await fs.access(environmentFile);
  console.log('Using existing frontend/.env admin configuration.');
} catch {
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET) {
    console.log('Using admin credentials supplied by the environment.');
  } else {
    const password = crypto.randomBytes(24).toString('base64url');
    const sessionSecret = crypto.randomBytes(48).toString('base64url');
    const contents = [
      'ADMIN_USERNAME=admin',
      `ADMIN_PASSWORD=${password}`,
      `SESSION_SECRET=${sessionSecret}`,
      ''
    ].join('\n');
    await fs.writeFile(environmentFile, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.log('\nCreated frontend/.env with a one-time admin login:');
    console.log('Username: admin');
    console.log(`Password: ${password}`);
    console.log('Keep this password private. It is saved locally in frontend/.env.\n');
  }
}
