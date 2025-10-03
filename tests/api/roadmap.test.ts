import path from 'node:path';
import { promises as fs } from 'node:fs';
import request from 'supertest';
import express from 'express';
import { convertRoadmapHandler } from '../../src/api/roadmap';

describe('POST /automation/roadmap', () => {
  const app = express();
  app.use(express.json());
  app.post('/automation/roadmap', convertRoadmapHandler);

  const testRoadmap = [
    {
      id: 'test-item',
      title: 'Test Item',
      phase: 1,
      priority: 1,
      complexity: 'low',
      prompt: 'Test prompt'
    }
  ];

  beforeEach(async () => {
    const tmpRoadmap = path.join('tmp', 'test-roadmap.json');
    await fs.mkdir(path.dirname(tmpRoadmap), { recursive: true });
    await fs.writeFile(tmpRoadmap, JSON.stringify(testRoadmap), 'utf8');
  });

  it('converts roadmap and returns success', async () => {
    const response = await request(app)
      .post('/automation/roadmap')
      .send({
        roadmapFile: 'tmp/test-roadmap.json',
        outputDir: 'tmp/specs/roadmap',
        tasksFile: 'tmp/specs/roadmap/tasks.generated.md'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      tasksFile: 'tmp/specs/roadmap/tasks.generated.md'
    });

    const tasksContent = await fs.readFile('tmp/specs/roadmap/tasks.generated.md', 'utf8');
    expect(tasksContent).toContain('Test Item');
  });

  it('returns 400 for invalid input', async () => {
    const response = await request(app)
      .post('/automation/roadmap')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeTruthy();
  });

  it('returns 500 for conversion errors', async () => {
    const response = await request(app)
      .post('/automation/roadmap')
      .send({
        roadmapFile: 'non-existent.json',
        outputDir: 'tmp/specs/roadmap',
        tasksFile: 'tmp/specs/roadmap/tasks.generated.md'
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBeTruthy();
  });
});