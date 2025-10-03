import * as fsPromises from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'yaml';

export interface TemplateCatalogEntry {
  id: string;
  name: string;
  description?: string;
  params: string[];
  file: string;
  error?: string;
}

export interface BuildTemplateCatalogOptions {
  baseDir?: string;
  fs?: typeof fsPromises;
}

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'templates');
const SUPPORTED_EXTENSIONS = new Set(['.yaml', '.yml']);

export async function buildTemplateCatalog(
  options: BuildTemplateCatalogOptions = {},
): Promise<TemplateCatalogEntry[]> {
  const baseDir = options.baseDir ?? DEFAULT_TEMPLATE_DIR;
  const fs = options.fs ?? fsPromises;

  try {
    const stat = await fs.stat(baseDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = await fs.readdir(baseDir);
  const entries: TemplateCatalogEntry[] = [];

  for (const fileName of files) {
    const ext = path.extname(fileName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      continue;
    }

    const absolutePath = path.join(baseDir, fileName);
    const id = path.basename(fileName, ext);

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      const raw = parse(content) as Record<string, unknown> | undefined;

      const name = typeof raw?.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : id;
      const description = typeof raw?.description === 'string' ? raw.description : undefined;
      const params = Array.isArray(raw?.params)
        ? (raw?.params as unknown[]).filter((value): value is string => typeof value === 'string')
        : [];

      entries.push({
        id,
        name,
        description,
        params,
        file: absolutePath,
      });
    } catch (error) {
      entries.push({
        id,
        name: id,
        params: [],
        file: absolutePath,
        error: normalizeError(error),
      });
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('invalid') ? message : `invalid template: ${message}`;
}
