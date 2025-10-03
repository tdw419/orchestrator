import { Request, Response } from 'express';
import { config } from '../config';

export function healthHandler(req: Request, res: Response): void {
  res.json({
    ok: true,
    config: {
      ORCH_PORT: config.port,
      ORCH_MODEL: config.model,
      OPENAI_API_BASE: config.openaiApiBase
    }
  });
}