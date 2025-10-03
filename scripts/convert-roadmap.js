import { convertRoadmapToSpecKit } from '../src/tasks/roadmap-converter';
async function main() {
    try {
        await convertRoadmapToSpecKit({
            roadmapPath: 'roadmap.json',
            specsDir: 'specs/roadmap',
            tasksOutput: 'specs/roadmap/tasks.generated.md'
        });
        console.log('Roadmap conversion complete');
    }
    catch (error) {
        console.error('Failed to convert roadmap:', error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=convert-roadmap.js.map