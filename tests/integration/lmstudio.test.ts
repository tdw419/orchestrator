import { LMStudioMockServer } from '../mocks/lmstudio-server';
import { LMStudioProvider } from '../../src/providers/lmstudio';

describe('LM Studio Integration', () => {
  let mockServer: LMStudioMockServer;
  let provider: LMStudioProvider;

  beforeAll(async () => {
    mockServer = new LMStudioMockServer({ port: 4321 });
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    provider = new LMStudioProvider({
      apiBase: mockServer.url,
      apiKey: 'test-key',
      model: 'mock-model',
      maxRetries: 2,
      retryDelay: 100
    });
  });

  it('handles basic completion request', async () => {
    const result = await provider.complete({
      messages: [{ role: 'user', content: 'Hello' }]
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Mock response for: Hello');
  });

  it('supports streaming responses', async () => {
    const chunks: string[] = [];
    await provider.completeStreaming(
      { messages: [{ role: 'user', content: 'Stream test' }] },
      (chunk) => chunks.push(chunk)
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('Mock response for: Stream test');
  });

  it('handles errors with retries', async () => {
    const errorServer = new LMStudioMockServer({
      port: 4322,
      latency: 50
    });
    await errorServer.start();

    try {
      const errorProvider = new LMStudioProvider({
        apiBase: errorServer.url,
        maxRetries: 2,
        retryDelay: 100
      });

      await expect(
        errorProvider.complete({
          messages: [{ role: 'user', content: 'trigger error' }]
        })
      ).rejects.toThrow();

      // Should have tried 3 times (initial + 2 retries)
      expect(errorProvider.stats.retryCount).toBe(2);
    } finally {
      await errorServer.stop();
    }
  });

  it('respects rate limits and quotas', async () => {
    const quotaProvider = new LMStudioProvider({
      apiBase: mockServer.url,
      rateLimit: 2,
      quotaLimit: 1000
    });

    const requests = Array(3).fill(0).map(() =>
      quotaProvider.complete({
        messages: [{ role: 'user', content: 'test' }]
      })
    );

    const results = await Promise.all(requests.map(p => p.catch(e => e)));
    expect(results.filter(r => !(r instanceof Error)).length).toBe(2);
    expect(results.filter(r => r instanceof Error).length).toBe(1);
  });

  it('tracks usage and metrics', async () => {
    await provider.complete({
      messages: [{ role: 'user', content: 'test metrics' }]
    });

    expect(provider.stats.totalRequests).toBe(1);
    expect(provider.stats.totalTokens).toBeGreaterThan(0);
    expect(provider.stats.averageLatency).toBeGreaterThanOrEqual(0);
  });
});