import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import { convertRoadmapToSpecKit } from '../../src/tasks/roadmap-converter';

describe('convertRoadmapToSpecKit', () => {
  const roadmap = [
    {
      id: 'vscode-roadmap',
      title: 'VS Code AI Roadmap Generation',
      phase: 1,
      priority: 1,
      complexity: 'medium',
      prompt: 'Create VS Code extension command for AI-assisted roadmap generation.'
    },
    {
      id: 'lmstudio-executor',
      title: 'LM Studio Task Executor',
      phase: 2,
      priority: 5,
      complexity: 'high',
      prompt: 'Implement LM Studio integration for task execution.'
    }
  ];

  it('writes spec documents and grouped tasks markdown', async () => {
    const writes: Record<string, string> = {};
    const mkdirCalls: string[] = [];

    await convertRoadmapToSpecKit(
      {
        roadmapPath: '/app/roadmap.json',
        specsDir: '/app/specs/roadmap',
        tasksOutput: '/app/specs/roadmap/tasks.generated.md',
        timestamp: '2025-01-01T00:00:00Z'
      },
      {
        readJson: jest.fn().mockResolvedValue(roadmap),
        ensureDir: async dir => {
          mkdirCalls.push(dir);
        },
        writeFile: async (file, contents) => {
          writes[file] = contents;
        }
      }
    );

    expect(mkdirCalls).toEqual(['/app/specs/roadmap']);

    const docPath = '/app/specs/roadmap/vscode-roadmap.md';
    expect(writes[docPath]).toContain('# VS Code AI Roadmap Generation');
    expect(writes[docPath]).toContain('Phase: 1');
    expect(writes[docPath]).toContain('## Implementation Plan');

    const tasksDoc = writes['/app/specs/roadmap/tasks.generated.md'];
    expect(tasksDoc).toContain('# SpecKit Tasks (Auto-generated)');
    expect(tasksDoc).toContain('Generated: 2025-01-01T00:00:00Z');
    expect(tasksDoc).toContain('## Phase 1');
    expect(tasksDoc).toContain('- [ ] VSCODE-ROADMAP VS Code AI Roadmap Generation in specs/roadmap/vscode-roadmap.md');
    expect(tasksDoc).toContain('## Phase 2');
    expect(tasksDoc).toContain('- [ ] LMSTUDIO-EXECUTOR LM Studio Task Executor in specs/roadmap/lmstudio-executor.md');
  });

  it('throws when roadmap data is invalid', async () => {
    await expect(
      convertRoadmapToSpecKit(
        {},
        {
          readJson: jest.fn().mockResolvedValue({ not: 'an array' }),
          ensureDir: jest.fn(),
          writeFile: jest.fn(),
        }
      ),
    ).rejects.toThrow(/Roadmap must be an array/);
  });

  it('filters by include list and handles missing optional fields', async () => {
    const minimalRoadmap = [
      { id: 'autopilot-runtime', title: 'AI Autopilot Runtime', phase: 2, prompt: 'Autopilot' },
      { id: 'docs-templates', title: 'Documentation Templates', phase: 3, prompt: 'Docs templates' },
    ];

    const writes: Record<string, string> = {};

    await convertRoadmapToSpecKit(
      {
        roadmapPath: '/app/roadmap.json',
        specsDir: '/app/specs/roadmap',
        tasksOutput: '/app/specs/roadmap/tasks.generated.md',
        include: ['docs-templates'],
        timestamp: '2025-01-02T00:00:00Z',
      },
      {
        readJson: jest.fn().mockResolvedValue(minimalRoadmap),
        ensureDir: jest.fn(),
        writeFile: async (file, contents) => {
          writes[file] = contents;
        },
      },
    );

    const doc = writes['/app/specs/roadmap/docs-templates.md'];
    expect(doc).toContain('# Documentation Templates');
    expect(doc).not.toContain('Priority:');
    expect(doc).not.toContain('Complexity:');

    const tasksDoc = writes['/app/specs/roadmap/tasks.generated.md'];
    expect(tasksDoc).toContain('## Phase 3');
    expect(tasksDoc).toContain('DOCS-TEMPLATES Documentation Templates');
    expect(tasksDoc).not.toContain('AUTOPILOT-RUNTIME');
  });

  it('throws when roadmap entry missing required fields', async () => {
    await expect(
      convertRoadmapToSpecKit(
        {},
        {
          readJson: jest.fn().mockResolvedValue([{ id: 'bad', phase: 1 }]),
          ensureDir: jest.fn(),
          writeFile: jest.fn(),
        },
      ),
    ).rejects.toThrow(/missing required fields/);
  });

  it('writes placeholder when filters remove all tasks', async () => {
    const writes: Record<string, string> = {};

    await convertRoadmapToSpecKit(
      {
        roadmapPath: '/app/roadmap.json',
        specsDir: '/app/specs/roadmap',
        tasksOutput: '/app/specs/roadmap/tasks.generated.md',
        include: ['non-existent'],
      },
      {
        readJson: jest.fn().mockResolvedValue(roadmap),
        ensureDir: jest.fn(),
        writeFile: async (file, contents) => {
          writes[file] = contents;
        },
      },
    );

    expect(writes['/app/specs/roadmap/tasks.generated.md']).toContain('_No tasks selected from roadmap._');
  });

  it('writes files using default filesystem dependencies', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmap-'));
    const roadmapPath = path.join(tmp, 'roadmap.json');
    await fs.writeFile(roadmapPath, JSON.stringify(roadmap), 'utf8');

    const specsDir = path.join(tmp, 'specs', 'roadmap');
    const tasksOutput = path.join(specsDir, 'tasks.generated.md');

    await convertRoadmapToSpecKit({ roadmapPath, specsDir, tasksOutput, timestamp: '2025-01-03T00:00:00Z' });

    const docContents = await fs.readFile(path.join(specsDir, 'vscode-roadmap.md'), 'utf8');
    expect(docContents).toContain('# VS Code AI Roadmap Generation');

    const tasksContents = await fs.readFile(tasksOutput, 'utf8');
    expect(tasksContents).toContain('Generated: 2025-01-03T00:00:00Z');
  });
});
