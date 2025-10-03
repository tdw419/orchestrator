import { convertRoadmapToSpecKit } from '../src/tasks/roadmap-converter';

const roadmapFile = 'roadmap.json';
const specsDir = 'specs/roadmap';
const tasksFile = 'specs/roadmap/tasks.generated.md';

console.log('Converting roadmap...');
await convertRoadmapToSpecKit({
  roadmapPath: roadmapFile,
  specsDir: specsDir,
  tasksOutput: tasksFile,
});
console.log('Conversion complete');