"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertRoadmapHandler = convertRoadmapHandler;
const roadmap_converter_1 = require("../tasks/roadmap-converter");
async function convertRoadmapHandler(req, res) {
    try {
        const { roadmapFile, outputDir, tasksFile, include, exclude } = req.body;
        if (!roadmapFile || !outputDir || !tasksFile) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        await (0, roadmap_converter_1.convertRoadmapToSpecKit)({
            roadmapPath: roadmapFile,
            specsDir: outputDir,
            tasksOutput: tasksFile,
            include,
            exclude,
        });
        res.status(200).json({
            success: true,
            tasksFile,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}
//# sourceMappingURL=roadmap.js.map