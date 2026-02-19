import { Context } from 'hono';
import path from 'path';
import fs from 'fs';
import { frontendRoot } from '../../app.js';

export const configure = async (c: Context) => {
  const html = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf-8');
  return c.html(html);
};
