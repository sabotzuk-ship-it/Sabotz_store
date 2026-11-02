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
    const sessionSecret = crypto.randomBytes(48).toString('base64url');
    const contents = [
      'ADMIN_USERNAME=sabotz',
      'ADMIN_PASSWORD=admin',
      `SESSION_SECRET=${sessionSecret}`,
      ''
    ].join('\n');
    await fs.writeFile(environmentFile, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.log('\nCreated frontend/.env with local development credentials:');
    console.log('Username: sabotz');
    console.log('Password: admin');
    console.log('Development login only. Set strong credentials before deploying.\n');
  }
}
