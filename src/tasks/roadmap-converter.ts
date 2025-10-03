import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface RoadmapItem {
  id: string;
  title: string;
  phase: number;
  priority?: number;
  complexity?: string;
  prompt: string;
}

export interface ConvertRoadmapOptions {
  roadmapPath?: string;
  specsDir?: string;
  tasksOutput?: string;
  timestamp?: string;
  include?: string[];
  exclude?: string[];
}

export interface RoadmapConverterDependencies {
  readJson: (file: string) => Promise<unknown>;
  ensureDir: (dir: string) => Promise<void>;
  writeFile: (file: string, contents: string) => Promise<void>;
}

const defaultOptions = {
  roadmapPath: 'roadmap.json',
  specsDir: path.join('specs', 'roadmap'),
  tasksOutput: path.join('specs', 'roadmap', 'tasks.generated.md'),
  timestamp: new Date().toISOString(),
} as const;

const defaultDependencies: RoadmapConverterDependencies = {
  readJson: async (file: string) => {
    const contents = await fs.readFile(file, 'utf8');
    return JSON.parse(contents);
  },
  ensureDir: async (dir: string) => {
    await fs.mkdir(dir, { recursive: true });
  },
  writeFile: async (file: string, contents: string) => {
    await fs.writeFile(file, contents, 'utf8');
  },
};

export async function convertRoadmapToSpecKit(
  options: ConvertRoadmapOptions = {},
  deps: Partial<RoadmapConverterDependencies> = {},
): Promise<void> {
  const resolvedOptions = {
    roadmapPath: options.roadmapPath ?? defaultOptions.roadmapPath,
    specsDir: options.specsDir ?? defaultOptions.specsDir,
    tasksOutput: options.tasksOutput ?? defaultOptions.tasksOutput,
    timestamp: options.timestamp ?? defaultOptions.timestamp,
    include: (options.include ?? []).map(id => id.toUpperCase()),
    exclude: (options.exclude ?? []).map(id => id.toUpperCase()),
  };
  const resolvedDeps: RoadmapConverterDependencies = {
    readJson: deps.readJson ?? defaultDependencies.readJson,
    ensureDir: deps.ensureDir ?? defaultDependencies.ensureDir,
    writeFile: deps.writeFile ?? defaultDependencies.writeFile,
  };

  const roadmapData = await resolvedDeps.readJson(resolvedOptions.roadmapPath);
  if (!Array.isArray(roadmapData)) {
    throw new Error('Roadmap must be an array');
  }

  const items: RoadmapItem[] = roadmapData.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Roadmap entry at index ${index} is not an object`);
    }
    const item = raw as Partial<RoadmapItem>;
    if (!item.id || !item.title || typeof item.phase !== 'number' || !item.prompt) {
      throw new Error(`Roadmap entry at index ${index} is missing required fields`);
    }
    return {
      id: item.id,
      title: item.title,
      phase: item.phase,
      priority: item.priority,
      complexity: item.complexity,
      prompt: item.prompt,
    };
  });

  const specsDir = resolvedOptions.specsDir;
  await resolvedDeps.ensureDir(specsDir);

  const filteredItems = items.filter(item => {
    const id = item.id.toUpperCase();
    if (resolvedOptions.include.length > 0 && !resolvedOptions.include.includes(id)) {
      return false;
    }
    if (resolvedOptions.exclude.includes(id)) {
      return false;
    }
    return true;
  });

  const docPaths: { item: RoadmapItem; docPath: string }[] = [];
  for (const item of filteredItems) {
    const docFileName = `${item.id}.md`;
    const docPath = path.join(specsDir, docFileName);
    docPaths.push({ item, docPath });

    const docContents = createSpecDocument(item);
    await resolvedDeps.writeFile(docPath, docContents);
  }

  const tasksMarkdown = createTasksMarkdown(docPaths, specsDir, resolvedOptions.timestamp);
  await resolvedDeps.writeFile(resolvedOptions.tasksOutput, tasksMarkdown);
}

function createSpecDocument(item: RoadmapItem): string {
  const lines: string[] = [];
  lines.push(`# ${item.title}`);
  lines.push('');
  lines.push(`Phase: ${item.phase}`);
  if (item.priority !== undefined) {
    lines.push(`Priority: ${item.priority}`);
  }
  if (item.complexity) {
    lines.push(`Complexity: ${item.complexity}`);
  }
  lines.push('');
  lines.push('## Problem Statement');
  lines.push(item.prompt.trim());
  lines.push('');
  lines.push('## Implementation Plan');
  lines.push('- TODO: Outline implementation steps');
  lines.push('');
  lines.push('## Testing Strategy');
  lines.push('- TODO: Define tests');
  lines.push('');
  lines.push('## Notes');
  lines.push('- Auto-generated from roadmap. Update as tasks progress.');

  return lines.join('\n');
}

function createTasksMarkdown(
  docs: { item: RoadmapItem; docPath: string }[],
  specsDir: string,
  timestamp: string,
): string {
  const relDocs = docs.map(({ item, docPath }) => ({
    item,
    relativePath: toRelativePath(docPath, specsDir),
  }));

  const grouped = new Map<number, typeof relDocs>();
  for (const entry of relDocs) {
    const current = grouped.get(entry.item.phase) ?? [];
    current.push(entry);
    grouped.set(entry.item.phase, current);
  }

  const sortedPhases = Array.from(grouped.keys()).sort((a, b) => a - b);

  const lines: string[] = [];
  lines.push('# SpecKit Tasks (Auto-generated)');
  lines.push('');
  lines.push(`Generated: ${timestamp}`);
  lines.push('');

  if (sortedPhases.length === 0) {
    lines.push('_No tasks selected from roadmap._');
    lines.push('');
    return lines.join('\n');
  }

  for (const phase of sortedPhases) {
    lines.push(`## Phase ${phase}`);
    lines.push('');
    const entries = grouped.get(phase)!;
    for (const entry of entries) {
      const taskId = entry.item.id.toUpperCase();
      lines.push(
        `- [ ] ${taskId} ${entry.item.title} in specs/roadmap/${entry.relativePath}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function toRelativePath(docPath: string, specsDir: string): string {
  const relative = path.relative(specsDir, docPath).replace(/\\/g, '/');
  return relative;
}
