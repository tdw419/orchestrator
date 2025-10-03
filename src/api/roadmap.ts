import { Request, Response } from 'express';
import { convertRoadmapToSpecKit } from '../tasks/roadmap-converter';

export interface ConvertRoadmapRequest {
  roadmapFile: string;
  outputDir: string;
  tasksFile: string;
  phase?: number;
  include?: string[];
  exclude?: string[];
}

export async function convertRoadmapHandler(req: Request, res: Response): Promise<void> {
  try {
    const { roadmapFile, outputDir, tasksFile, include, exclude } = req.body as ConvertRoadmapRequest;

    if (!roadmapFile || !outputDir || !tasksFile) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    await convertRoadmapToSpecKit({
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}