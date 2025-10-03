import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../../src/api';
import { LMStudioMockServer } from '../mocks/lmstudio-server';

describe('Orchestrator Server', () => {
  let app: express.Application;
  let mockServer: LMStudioMockServer;

  beforeAll(async () => {
    // Start mock LM Studio server
    mockServer = new LMStudioMockServer({ port: 4321 });
    await mockServer.start();

    // Create test app
    app = express();
    app.use(express.json());
    app.use('/', createApiRouter());
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  describe('GET /health', () => {
    it('returns server status and config', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        config: expect.objectContaining({
          ORCH_PORT: expect.any(Number),
          ORCH_MODEL: expect.any(String),
          OPENAI_API_BASE: expect.any(String)
        })
      });
    });
  });

  describe('GET /templates', () => {
    it('returns available templates', async () => {
      const response = await request(app).get('/templates');

      expect(response.status).toBe(200);
      expect(response.body.templates).toBeInstanceOf(Array);
      expect(response.body.templates).toContainEqual(
        expect.objectContaining({
          name: expect.any(String),
          stepTypes: expect.arrayContaining(['reason', 'command']),
          hasReasoning: expect.any(Boolean)
        })
      );
    });
  });

  describe('POST /templates/:name/run', () => {
    it('executes template with streaming', async () => {
      const response = await request(app)
        .post('/templates/lmstudio_reasoning/run')
        .send({
          params: { requirements: 'Add dark mode' },
          stream: true
        })
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      const events = response.text.split('\n\n')
        .filter(e => e.startsWith('data: '))
        .map(e => JSON.parse(e.replace('data: ', '')));

      // Verify event sequence
      expect(events.length).toBeGreaterThan(1);
      expect(events[0]).toHaveProperty('status');
      expect(events[events.length - 1]).toHaveProperty('complete', true);
    });

    it('returns 404 for unknown template', async () => {
      const response = await request(app)
        .post('/templates/unknown/run')
        .send({ params: {} });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /automation/speckit', () => {
    it('runs phase automation with filtering', async () => {
      const response = await request(app)
        .post('/automation/speckit')
        .send({
          phase: 'Phase 1',
          include: ['T001'],
          exclude: ['T002']
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('phase', 'Phase 1');
    });

    it('validates required parameters', async () => {
      const response = await request(app)
        .post('/automation/speckit')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Phase is required');
    });

    it('supports streaming status updates', async () => {
      const response = await request(app)
        .post('/automation/speckit')
        .send({
          phase: 'Phase 1',
          stream: true
        })
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      const events = response.text.split('\n\n')
        .filter(e => e.startsWith('data: '))
        .map(e => JSON.parse(e.replace('data: ', '')));

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]).toHaveProperty('complete');
    });
  });
});