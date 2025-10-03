import express from 'express';
import { getTemplateCatalog, runTemplate, runSpecKitAutomation } from './templates';

export function createApiRouter(): express.Router {
  const router = express.Router();

  // Template discovery and execution
  router.get('/templates', getTemplateCatalog);
  router.post('/templates/:name/run', runTemplate);

  // SpecKit automation
  router.post('/automation/speckit', runSpecKitAutomation);

  return router;
}