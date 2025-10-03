export interface LMStudioConfig {
  apiBase?: string;
  apiKey?: string;
  model?: string;
  maxRetries?: number;
  retryDelay?: number;
  rateLimit?: number;
  quotaLimit?: number;
}

export interface LMStudioMessage {
  role: string;
  content: string;
}

export interface LMStudioRequest {
  messages: LMStudioMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface LMStudioResponse {
  success: boolean;
  content: string;
  error?: string;
}

export interface LMStudioStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retryCount: number;
  totalTokens: number;
  averageLatency: number;
}

export class LMStudioProvider {
  private readonly config: Required<LMStudioConfig>;
  private stats: LMStudioStats;
  private lastRequestTime: number;
  private tokenCount: number;

  constructor(config: LMStudioConfig = {}) {
    this.config = {
      apiBase: config.apiBase ?? 'http://localhost:1234/v1',
      apiKey: config.apiKey ?? '',
      model: config.model ?? 'default',
      maxRetries: config.maxRetries ?? 2,
      retryDelay: config.retryDelay ?? 1000,
      rateLimit: config.rateLimit ?? 10,
      quotaLimit: config.quotaLimit ?? 10000
    };

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retryCount: 0,
      totalTokens: 0,
      averageLatency: 0
    };

    this.lastRequestTime = 0;
    this.tokenCount = 0;
  }

  async complete(request: LMStudioRequest): Promise<LMStudioResponse> {
    if (!this.checkRateLimit() || !this.checkQuota()) {
      throw new Error('Rate limit or quota exceeded');
    }

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.stats.retryCount++;
          await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
        }

        const response = await this.makeRequest(request);
        this.updateStats(startTime, response);
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt === this.config.maxRetries) {
          this.stats.failedRequests++;
          throw error;
        }
      }
    }

    throw lastError;
  }

  async completeStreaming(
    request: LMStudioRequest,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.checkRateLimit() || !this.checkQuota()) {
      throw new Error('Rate limit or quota exceeded');
    }

    const startTime = Date.now();
    let content = '';

    try {
      const response = await fetch(`${this.config.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify({
          ...request,
          stream: true,
          model: this.config.model
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk
          .split('\n')
          .filter(line => line.trim().startsWith('data:'))
          .map(line => line.replace('data:', '').trim());

        for (const line of lines) {
          if (line === '[DONE]') continue;
          try {
            const parsed = JSON.parse(line);
            const text = parsed.choices[0]?.delta?.content ?? '';
            if (text) {
              content += text;
              onChunk(text);
            }
          } catch (e) {
            console.warn('Failed to parse streaming response:', e);
          }
        }
      }

      this.updateStats(startTime, { success: true, content });
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }

  private async makeRequest(request: LMStudioRequest): Promise<LMStudioResponse> {
    const response = await fetch(`${this.config.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
      },
      body: JSON.stringify({
        ...request,
        stream: false,
        model: this.config.model
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return {
      success: true,
      content: result.choices[0]?.message?.content ?? ''
    };
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.lastRequestTime < (1000 / this.config.rateLimit)) {
      return false;
    }
    this.lastRequestTime = now;
    return true;
  }

  private checkQuota(): boolean {
    return this.tokenCount < this.config.quotaLimit;
  }

  private updateStats(startTime: number, response: LMStudioResponse): void {
    const duration = Date.now() - startTime;
    this.stats.totalRequests++;
    this.stats.successfulRequests++;
    this.stats.averageLatency = (
      (this.stats.averageLatency * (this.stats.totalRequests - 1) + duration) /
      this.stats.totalRequests
    );

    // Rough token estimation
    const tokens = Math.ceil(response.content.length / 4);
    this.stats.totalTokens += tokens;
    this.tokenCount += tokens;
  }

  get apiStats(): LMStudioStats {
    return { ...this.stats };
  }
}