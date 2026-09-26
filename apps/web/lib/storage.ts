import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function storagePath(key: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key) || key.includes('..')) throw new Error('Invalid storage key');
  const root = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? './var');
  return path.join(/* turbopackIgnore: true */ root, key);
}

export async function writeSource(buffer: Buffer, extension: string): Promise<string> {
  if (!['pdf', 'docx', 'txt'].includes(extension.toLowerCase())) throw new Error('Unsupported source extension');
  const key = `${randomUUID()}.${extension.toLowerCase()}`;
  const target = storagePath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer, { flag: 'wx' });
  return key;
}

export async function readStorage(key: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ storagePath(key));
}
