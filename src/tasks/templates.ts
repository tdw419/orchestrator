import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'yaml';

export interface TemplateStep {
  action: string;
  [key: string]: unknown;
}

export interface TemplateSpec {
  version?: number;
  name?: string;
  description?: string;
  params?: string[];
  steps: TemplateStep[];
  [key: string]: unknown;
}

export interface LoadTemplateOptions {
  baseDir?: string;
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'templates');

const TEMPLATE_EXTENSIONS = ['.yaml', '.yml'];

export async function loadTemplate(name: string, options: LoadTemplateOptions = {}): Promise<TemplateSpec> {
  if (!name) {
    throw new TemplateError('Template name is required');
  }

  const baseDir = options.baseDir ?? DEFAULT_TEMPLATE_DIR;

  for (const ext of TEMPLATE_EXTENSIONS) {
    const filePath = path.join(baseDir, `${name}${ext}`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return parseTemplate(content, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw new TemplateError(`Failed to load template "${name}": ${(error as Error).message}`);
    }
  }

  throw new TemplateError(`Template "${name}" not found in ${pathToFileURL(baseDir).toString()}`);
}

function parseTemplate(content: string, source: string): TemplateSpec {
  let raw: unknown;
  try {
    raw = parse(content);
  } catch (error) {
    throw new TemplateError(`Template ${source} contains invalid YAML: ${(error as Error).message}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new TemplateError(`Template ${source} is empty or not an object`);
  }

  const spec = raw as TemplateSpec;

  if (!Array.isArray(spec.steps) || spec.steps.some(step => typeof step !== 'object' || !step)) {
    throw new TemplateError(`Template ${source} must define a steps array`);
  }

  return spec;
}

export function renderTemplate(spec: TemplateSpec, params: Record<string, unknown> = {}): TemplateSpec {
  const requiredParams = spec.params ?? [];
  const missingParams = requiredParams.filter(key => params[key] === undefined);
  if (missingParams.length > 0) {
    throw new TemplateError(`Missing template parameters: ${missingParams.join(', ')}`);
  }

  const cloned = deepClone(spec);
  cloned.steps = cloned.steps.map(step => interpolateValue(step, params)) as TemplateStep[];

  return cloned;
}

export async function loadAndRenderTemplate(
  name: string,
  params: Record<string, unknown> = {},
  options?: LoadTemplateOptions,
): Promise<TemplateSpec> {
  const spec = await loadTemplate(name, options);
  return renderTemplate(spec, params);
}

function interpolateValue<T>(value: T, params: Record<string, unknown>): T {
  if (typeof value === 'string') {
    return interpolateString(value, params) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map(item => interpolateValue(item, params)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      interpolateValue(val, params),
    ]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function interpolateString(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{([^{}]+)\}/g, (_match, key) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new TemplateError(`Missing value for parameter "${key}"`);
    }
    const raw = params[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}
