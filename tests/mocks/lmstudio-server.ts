import express, { Request, Response } from 'express';
import { Server } from 'http';

export interface LMStudioMockOptions {
  port?: number;
  latency?: number;
  streamingEnabled?: boolean;
}

export class LMStudioMockServer {
  private server: Server | null = null;
  private app: express.Application;
  private options: LMStudioMockOptions;

  constructor(options: LMStudioMockOptions = {}) {
    this.options = {
      port: options.port ?? 1234,
      latency: options.latency ?? 0,
      streamingEnabled: options.streamingEnabled ?? true
    };

    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.post('/v1/chat/completions', this.handleChatCompletions.bind(this));
    this.app.post('/v1/completions', this.handleCompletions.bind(this));
  }

  private async handleChatCompletions(req: Request, res: Response): Promise<void> {
    const { messages, stream } = req.body;

    if (this.options.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.latency));
    }

    if (stream && this.options.streamingEnabled) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunks = this.generateStreamingResponse(messages);
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({
        id: 'mock-completion',
        object: 'chat.completion',
        created: Date.now(),
        model: 'mock-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: this.generateMockResponse(messages)
          },
          finish_reason: 'stop'
        }]
      });
    }
  }

  private handleCompletions(req: Request, res: Response): void {
    const { prompt } = req.body;
    res.json({
      id: 'mock-completion',
      object: 'text_completion',
      created: Date.now(),
      model: 'mock-model',
      choices: [{
        text: this.generateMockResponse([{ content: prompt }]),
        index: 0,
        finish_reason: 'stop'
      }]
    });
  }

  private generateMockResponse(messages: Array<{ content: string }>): string {
    const lastMessage = messages[messages.length - 1].content;
    if (lastMessage.includes('error')) {
      throw new Error('Mock error response');
    }
    return `Mock response for: ${lastMessage.substring(0, 50)}...`;
  }

  private *generateStreamingResponse(messages: Array<{ content: string }>): Generator<object> {
    const response = this.generateMockResponse(messages);
    const words = response.split(' ');

    for (let i = 0; i < words.length; i++) {
      yield {
        id: `mock-${i}`,
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'mock-model',
        choices: [{
          index: 0,
          delta: {
            content: words[i] + ' '
          },
          finish_reason: i === words.length - 1 ? 'stop' : null
        }]
      };
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, () => {
        console.log(`Mock LM Studio server running at http://localhost:${this.options.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get url(): string {
    return `http://localhost:${this.options.port}/v1`;
  }
}