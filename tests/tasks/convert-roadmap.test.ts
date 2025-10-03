import { convertRoadmapToSpecKit } from '../../src/tasks/roadmap-converter';

describe('Roadmap Conversion E2E', () => {
  it('converts current roadmap', async () => {
    await convertRoadmapToSpecKit({
      roadmapPath: 'roadmap.json',
      specsDir: 'specs/roadmap',
      tasksOutput: 'specs/roadmap/tasks.generated.md'
    });
  });
});