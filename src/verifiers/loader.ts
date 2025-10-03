import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const requireModule = createRequire(path.join(process.cwd(), 'package.json'));

export interface VerifierContext {
  taskId: string;
  [key: string]: unknown;
}

export type VerifierResult = Record<string, unknown> & { ok: boolean };

export type VerifierFunction = (args: Record<string, unknown>, context: VerifierContext) => unknown;

export interface LoadVerifierOptions {
  baseDirs?: string[];
  requireFn?: (modulePath: string) => Record<string, unknown>;
  importFn?: (modulePath: string) => Promise<Record<string, unknown>>;
}

const DEFAULT_EXTENSIONS = ['.cjs', '.js'];

export class VerifierLoaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerifierLoaderError';
  }
}

export async function loadVerifier(
  identifier: string,
  options: LoadVerifierOptions = {},
): Promise<VerifierFunction> {
  const { moduleName, exportName } = parseIdentifier(identifier);
  const baseDirs = options.baseDirs ?? getDefaultBaseDirs();

  const modulePath = resolveModulePath(moduleName, baseDirs);
  if (!modulePath) {
    throw new VerifierLoaderError(`Unable to locate verifier module "${moduleName}"`);
  }

  const imported = await importModule(modulePath, options);
  const candidate = imported[exportName];

  if (typeof candidate !== 'function') {
    throw new VerifierLoaderError(
      `Verifier "${identifier}" must export a function, received ${typeof candidate}`,
    );
  }

  return candidate as VerifierFunction;
}

function parseIdentifier(identifier: string): { moduleName: string; exportName: string } {
  if (!identifier || !identifier.includes('.')) {
    throw new VerifierLoaderError('Verifier identifier must be in the form "module.export"');
  }

  const lastDot = identifier.lastIndexOf('.');
  const moduleName = identifier.slice(0, lastDot);
  const exportName = identifier.slice(lastDot + 1);

  if (!moduleName || !exportName) {
    throw new VerifierLoaderError('Verifier identifier must include both module and export name');
  }

  return { moduleName, exportName };
}

function getDefaultBaseDirs(): string[] {
  const cwd = process.cwd();
  return [path.join(cwd, 'dist', 'verifiers'), path.join(cwd, 'src', 'verifiers')];
}

function resolveModulePath(moduleName: string, baseDirs: string[]): string | undefined {
  const candidates: string[] = [];

  for (const base of baseDirs) {
    for (const ext of DEFAULT_EXTENSIONS) {
      candidates.push(path.join(base, moduleName + ext));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function importModule(modulePath: string, options: LoadVerifierOptions): Promise<Record<string, unknown>> {
  const requireFn = options.requireFn ?? ((p: string) => requireModule(p) as Record<string, unknown>);
  const importFn = options.importFn ?? ((p: string) => import(pathToFileURL(p).href) as Promise<Record<string, unknown>>);

  try {
    return requireFn(modulePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_REQUIRE_ESM') {
      return importFn(modulePath);
    }
    throw error;
  }
}
