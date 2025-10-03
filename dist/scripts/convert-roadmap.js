"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const roadmap_converter_1 = require("../src/tasks/roadmap-converter");
async function main() {
    try {
        await (0, roadmap_converter_1.convertRoadmapToSpecKit)({
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