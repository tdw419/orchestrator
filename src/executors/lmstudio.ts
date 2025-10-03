import { LMStudioProvider, LMStudioConfig } from '../providers/lmstudio';
import { config } from '../config';
import { TaskManager } from '../tasks/manager';

export interface LMStudioExecutorOptions {
  taskId: string;
  cwd?: string;
  provider?: LMStudioProvider;
  manager?: TaskManager;
  onStatus?: (status: string) => void;
}

export class LMStudioExecutor {
  private readonly taskId: string;
  private readonly cwd: string;
  private readonly provider: LMStudioProvider;
  private readonly manager: TaskManager;
  private readonly onStatus?: (status: string) => void;

  constructor(options: LMStudioExecutorOptions) {
    this.taskId = options.taskId;
    this.cwd = options.cwd ?? process.cwd();
    this.manager = options.manager ?? new TaskManager();
    this.onStatus = options.onStatus;

    const providerConfig: LMStudioConfig = {
      apiBase: config.openaiApiBase,
      apiKey: config.openaiApiKey,
      model: config.model,
      maxRetries: config.maxRetriesPerStep,
      retryDelay: config.baseBackoffMs
    };

    this.provider = options.provider ?? new LMStudioProvider(providerConfig);
  }

  async executeStep(step: {
    id: string;
    type: string;
    prompt?: string;
    context?: string;
    command?: string;
  }): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      this.updateStatus(`Executing step ${step.id}: ${step.type}`);

      if (step.type === 'reason' && step.prompt) {
        return await this.executeReasoningStep(step);
      }

      if (step.type === 'command' && step.command) {
        return await this.executeCommandStep(step);
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

  private async executeReasoningStep(step: { id: string; prompt: string; context?: string }) {
    const messages = [];

    if (step.context) {
      messages.push({
        role: 'system',
        content: step.context
      });
    }

    messages.push({
      role: 'user',
      content: step.prompt
    });

    const chunks: string[] = [];
    await this.provider.completeStreaming(
      { messages },
      (chunk) => {
        chunks.push(chunk);
        this.updateStatus(`Reasoning: ${chunks.join('').slice(-100)}`);
      }
    );

    return {
      success: true,
      output: chunks.join('')
    };
  }

  private async executeCommandStep(step: { id: string; command: string }) {
    // Command execution would go here
    // This is a placeholder - actual implementation would use your existing command execution logic
    return {
      success: true,
      output: `Executed command: ${step.command}`
    };
  }

  private updateStatus(status: string): void {
    this.onStatus?.(status);
  }

  get stats() {
    return this.provider.apiStats;
  }
}