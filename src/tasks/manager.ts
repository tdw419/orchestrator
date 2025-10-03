import fs from 'node:fs/promises';
import path from 'node:path';

export interface StepFailureContext {
  taskId: string;
  stepId: string;
  taskDir: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface DiagnosticsProvider {
  name: string;
  shouldRun: (context: StepFailureContext) => boolean | Promise<boolean>;
  run: (context: StepFailureContext) => Promise<Record<string, unknown>>;
}

export interface TaskManagerLogger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface TaskManagerOptions {
  diagnosticsProviders?: DiagnosticsProvider[];
  diagnosticsDirName?: string;
  logger?: TaskManagerLogger;
}

const DEFAULT_DIAGNOSTICS_DIR = 'diagnostics';

export class TaskManager {
  private readonly diagnosticsProviders: DiagnosticsProvider[];
  private readonly diagnosticsDirName: string;
  private readonly logger: TaskManagerLogger;

  constructor(options: TaskManagerOptions = {}) {
    this.diagnosticsProviders = options.diagnosticsProviders ?? [];
    this.diagnosticsDirName = options.diagnosticsDirName ?? DEFAULT_DIAGNOSTICS_DIR;
    this.logger = options.logger ?? {};
  }

  async handleStepFailure(context: StepFailureContext): Promise<void> {
    if (this.diagnosticsProviders.length === 0) {
      return;
    }

    const diagnosticsDir = path.join(context.taskDir, this.diagnosticsDirName);
    await fs.mkdir(diagnosticsDir, { recursive: true });

    for (const provider of this.diagnosticsProviders) {
      try {
        const shouldRun = await provider.shouldRun(context);
        if (!shouldRun) {
          continue;
        }

        const report = await provider.run(context);
        const fileName = `${context.stepId}-${provider.name}.json`;
        const filePath = path.join(diagnosticsDir, fileName);
        await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');

        this.logger.debug?.('Diagnostics provider completed', {
          provider: provider.name,
          taskId: context.taskId,
          stepId: context.stepId,
          file: filePath,
        });
      } catch (error) {
        this.logger.warn?.('Diagnostics provider failed', {
          provider: provider.name,
          taskId: context.taskId,
          stepId: context.stepId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }
}
