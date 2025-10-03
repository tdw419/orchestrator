import { LMStudioExecutor } from '../executors/lmstudio';
import { TaskManager } from './manager';
import { EventEmitter } from 'events';

export interface StepExecutorOptions {
  taskId: string;
  cwd?: string;
  manager?: TaskManager;
  emitter?: EventEmitter;
}

export interface StepResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class StepExecutor {
  private readonly taskId: string;
  private readonly cwd: string;
  private readonly manager: TaskManager;
  private readonly emitter?: EventEmitter;
  private readonly lmExecutor: LMStudioExecutor;

  constructor(options: StepExecutorOptions) {
    this.taskId = options.taskId;
    this.cwd = options.cwd ?? process.cwd();
    this.manager = options.manager ?? new TaskManager();
    this.emitter = options.emitter;

    this.lmExecutor = new LMStudioExecutor({
      taskId: this.taskId,
      cwd: this.cwd,
      manager: this.manager,
      onStatus: (status) => this.emitStatus(status)
    });
  }

  async executeStep(step: {
    id: string;
    type: string;
    action?: string;
    command?: string;
    prompt?: string;
    context?: string;
    [key: string]: unknown;
  }): Promise<StepResult> {
    try {
      this.emitStatus(`Executing step ${step.id}`);

      if (step.type === 'reason') {
        return await this.lmExecutor.executeStep(step);
      }

      if (step.type === 'command' || step.action === 'command') {
        return await this.executeCommand(step);
      }

      throw new Error(`Unknown step type: ${step.type}`);
    } catch (error) {
      await this.manager.handleStepFailure({
        taskId: this.taskId,
        stepId: step.id,
        taskDir: this.cwd,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeCommand(step: { id: string; command?: string }): Promise<StepResult> {
    if (!step.command) {
      throw new Error('Command step missing command parameter');
    }

    // Command execution would go here
    // This is a placeholder - actual implementation would use your existing command execution logic
    return {
      success: true,
      output: `Executed command: ${step.command}`
    };
  }

  private emitStatus(status: string): void {
    if (this.emitter) {
      this.emitter.emit('status', {
        taskId: this.taskId,
        status,
        timestamp: new Date().toISOString()
      });
    }
  }

  get stats() {
    return this.lmExecutor.stats;
  }
}