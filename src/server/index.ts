import express from 'express';
import cors from 'cors';
import { createApiRouter } from '../api';
import { config } from '../config';
import { healthHandler } from './health';

export function createServer() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cors());

  // Health check
  app.get('/health', healthHandler);

  // API Routes
  app.use('/', createApiRouter());

  // Start server
  return app.listen(config.port, '0.0.0.0', () => {
    console.log(`[orchestrator] Listening on http://0.0.0.0:${config.port}`);
    console.log(`[orchestrator] MODEL=${config.model} API_BASE=${config.openaiApiBase}`);
  });
}