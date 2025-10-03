import * as vscode from 'vscode';

export interface OrchestratorConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export interface TemplateMetadata {
  name: string;
  description?: string;
  stepTypes: string[];
  params?: string[];
  hasReasoning: boolean;
}

export interface StreamHandler {
  onStatus?: (status: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: string) => void;
  onComplete?: (results: Record<string, unknown>) => void;
  onRetry?: (attempt: number, error: Error) => boolean | Promise<boolean>;
  signal?: AbortSignal;
}

export class OrchestratorClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OrchestratorConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async getHealth(): Promise<{ ok: boolean; config: Record<string, unknown> }> {
    const response = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getTemplates(): Promise<TemplateMetadata[]> {
    const response = await fetch(`${this.baseUrl}/templates`, {
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch templates: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.templates;
  }

  private async processStream(
    response: Response,
    handler: StreamHandler
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        // Check for cancellation
        if (handler.signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.status && handler.onStatus) {
            handler.onStatus(data.status);
          } else if (data.warning && handler.onWarning) {
            handler.onWarning(data.warning);
          } else if (data.error && handler.onError) {
            handler.onError(data.error);
            return;
          } else if (data.complete && handler.onComplete) {
            handler.onComplete(data.results || {});
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    handler: StreamHandler,
    maxAttempts = 3,
    baseDelay = 1000
  ): Promise<T> {
    let attempt = 1;
    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= maxAttempts || handler.signal?.aborted) {
          throw error;
        }

        const shouldRetry = await handler.onRetry?.(attempt, error as Error) ?? true;
        if (!shouldRetry) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }
  }

  async runTemplate(
    name: string,
    params: Record<string, unknown>,
    handler: StreamHandler
  ): Promise<void> {
    await this.withRetry(
      async () => {
        const response = await fetch(`${this.baseUrl}/templates/${name}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params, stream: true }),
          signal: handler.signal
        });

        if (!response.ok) {
          throw new Error(`Failed to run template: ${response.status} ${response.statusText}`);
        }

        await this.processStream(response, handler);
      },
      handler
    );
  }

  async convertRoadmap(
    roadmapFile: string,
    outputDir: string,
    tasksFile: string
  ): Promise<{ success: boolean; tasksFile: string }> {
    const response = await fetch(`${this.baseUrl}/automation/roadmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roadmapFile,
        outputDir,
        tasksFile
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Failed to convert roadmap: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async runSpecKitAutomation(
    phase: string,
    handler: StreamHandler,
    options?: {
      include?: string[];
      exclude?: string[];
    }
  ): Promise<void> {
    await this.withRetry(
      async () => {
        const response = await fetch(`${this.baseUrl}/automation/speckit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase,
            include: options?.include,
            exclude: options?.exclude,
            stream: true
          }),
          signal: handler.signal
        });

        if (!response.ok) {
          throw new Error(`Failed to run automation: ${response.status} ${response.statusText}`);
        }

        await this.processStream(response, handler);
      },
      handler
    );
  }

  // Legacy methods
  async createTask(goal: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to create task:', error);
      return null;
    }
  }

  async getTasks(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks`);
      return await response.json();
    } catch (error) {
      console.error('Failed to get tasks:', error);
      return [];
    }
  }

  async getTask(id: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks/${id}`);
      return await response.json();
    } catch (error) {
      console.error(`Failed to get task ${id}:`, error);
      return null;
    }
  }

  async autodevRun(payload: any, adminToken?: string): Promise<any> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
      const response = await fetch(`${this.baseUrl}/admin/autodev_run`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      try { return JSON.parse(text); } catch { return { ok: false, raw: text }; }
    } catch (error) {
      console.error('Failed to run Auto Dev:', error);
      return { ok: false, error: String((error as any)?.message || error) };
    }
  }
}
