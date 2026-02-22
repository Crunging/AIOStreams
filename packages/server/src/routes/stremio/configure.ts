import { Context } from 'hono';
import path from 'path';
import { readFile } from 'fs/promises';
import { frontendRoot } from '../../app.js';

let indexHtmlPromise: Promise<string> | undefined;

export const configure = async (c: Context) => {
  if (!indexHtmlPromise) {
    indexHtmlPromise = readFile(
      path.join(frontendRoot, 'index.html'),
      'utf-8'
    ).catch((err) => {
      indexHtmlPromise = undefined; // Allow retry on next request
      throw err;
    });
  }
  return c.html(await indexHtmlPromise);
};
