import express from 'express';
import request from 'supertest';
import { LMStudioMockServer } from '../mocks/lmstudio-server';
import { getTemplateCatalog, runTemplate, runSpecKitAutomation } from '../../src/api/templates';

describe('Template API', () => {
  let app: express.Application;
  let mockServer: LMStudioMockServer;

  beforeAll(async () => {
    mockServer = new LMStudioMockServer({ port: 4321 });
    await mockServer.start();

    app = express();
    app.use(express.json());
    app.get('/templates', getTemplateCatalog);
    app.post('/templates/:name/run', runTemplate);
    app.post('/automation/speckit', runSpecKitAutomation);
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  describe('GET /templates', () => {
    it('returns template catalog with metadata', async () => {
      const response = await request(app).get('/templates');
      expect(response.status).toBe(200);
      expect(response.body.templates).toBeInstanceOf(Array);

      const reasoningTemplate = response.body.templates.find(
        (t: { name: string }) => t.name === 'lmstudio_reasoning'
      );
      expect(reasoningTemplate).toBeTruthy();
      expect(reasoningTemplate.hasReasoning).toBe(true);
      expect(reasoningTemplate.stepTypes).toContain('reason');
    });
  });

  describe('POST /templates/:name/run', () => {
    it('executes template with reasoning steps', async () => {
      const response = await request(app)
        .post('/templates/lmstudio_reasoning/run')
        .send({
          params: {
            requirements: 'Add dark mode support'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.results).toBeTruthy();
      expect(response.body.stats.totalRequests).toBeGreaterThan(0);
    });

    it('streams status updates via SSE', async () => {
      const response = await request(app)
        .post('/templates/lmstudio_reasoning/run')
        .send({
          params: {
            requirements: 'Add dark mode support'
          },
          stream: true
        })
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      const events = response.text.split('\n\n')
        .filter(e => e.startsWith('data: '))
        .map(e => JSON.parse(e.replace('data: ', '')));

      expect(events.length).toBeGreaterThan(1);
      expect(events[0].status).toBeTruthy();
      expect(events[events.length - 1].complete).toBe(true);
    });

    it('handles template errors', async () => {
      const response = await request(app)
        .post('/templates/invalid/run')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.error).toBeTruthy();
    });
  });

  describe('POST /automation/speckit', () => {
    it('runs SpecKit automation with streaming', async () => {
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
      expect(events[events.length - 1].complete).toBe(true);
    });

    it('validates required parameters', async () => {
      const response = await request(app)
        .post('/automation/speckit')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Phase is required');
    });

    it('supports task filtering', async () => {
      const response = await request(app)
        .post('/automation/speckit')
        .send({
          phase: 'Phase 1',
          include: ['T001'],
          exclude: ['T002']
        });

      expect(response.status).toBe(200);
      expect(response.body.phase).toBe('Phase 1');
    });
  });
});