import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { loadTemplate, TemplateSpec } from '../tasks/templates';
import { StepExecutor } from '../tasks/step-executor';
import { buildTemplateCatalog } from '../tasks/catalog';

export interface TemplateMetadata {
  name: string;
  description?: string;
  stepTypes: string[];
  params?: string[];
  hasReasoning: boolean;
}

export async function getTemplateCatalog(req: Request, res: Response): Promise<void> {
  try {
    const templates = await buildTemplateCatalog();
    const metadata = await Promise.all(
      templates.map(async (name): Promise<TemplateMetadata> => {
        const spec = await loadTemplate(name);
        const stepTypes = Array.from(new Set(spec.steps.map(step => step.type ?? 'command')));
        return {
          name,
          description: spec.description,
          stepTypes,
          params: spec.params,
          hasReasoning: stepTypes.includes('reason')
        };
      })
    );

    res.json({ templates: metadata });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}

export async function runTemplate(req: Request, res: Response): Promise<void> {
  const { name } = req.params;
  const { params = {}, stream = false } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Template name is required' });
    return;
  }

  try {
    const spec = await loadTemplate(name);

    if (!spec.steps || spec.steps.length === 0) {
      const error = `Template "${name}" has no steps defined`;
      if (stream) {
        res.write(`data: ${JSON.stringify({ error, status: 400 })}\n\n`);
        res.end();
      } else {
        res.status(400).json({ error });
      }
      return;
    }

    const taskId = `template-${Date.now()}`;
    const emitter = new EventEmitter();
    let isClientConnected = true;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      emitter.on('status', (event) => {
        if (isClientConnected) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

      res.on('close', () => {
        isClientConnected = false;
        emitter.removeAllListeners();
      });
    }

    const executor = new StepExecutor({
      taskId,
      emitter: stream ? emitter : undefined
    });

    const results: Record<string, unknown> = {};
    for (const step of spec.steps) {
      if (!isClientConnected && stream) {
        break;
      }

      const result = await executor.executeStep({
        ...step,
        params
      });

      if (!result.success) {
        if (stream && isClientConnected) {
          res.write(`data: ${JSON.stringify({
            error: result.error,
            step: step.id,
            status: 500
          })}\n\n`);
          res.end();
        } else if (!stream) {
          res.status(500).json({
            error: result.error,
            step: step.id,
            results
          });
        }
        return;
      }

      results[step.id] = result.output;
    }

    if (stream && isClientConnected) {
      res.write(`data: ${JSON.stringify({ complete: true, results })}\n\n`);
      res.end();
    } else if (!stream) {
      res.json({
        taskId,
        results,
        stats: executor.stats
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status =
      message.includes('not found') ? 404 :
      message.includes('invalid YAML') || message.includes('must define a steps array') ? 400 :
      500;

    if (stream) {
      res.write(`data: ${JSON.stringify({
        error: message,
        status,
        taskId: name
      })}\n\n`);
      res.end();
    } else {
      res.status(status).json({
        error: message,
        taskId: name
      });
    }
  }
}

export interface AutomationRequest {
  phase: string;
  include?: string[];
  exclude?: string[];
  stream?: boolean;
}

export async function runSpecKitAutomation(req: Request, res: Response): Promise<void> {
  const { phase, include, exclude, stream = false } = req.body as AutomationRequest;

  if (!phase) {
    res.status(400).json({ error: 'Phase is required' });
    return;
  }

  try {
    const emitter = new EventEmitter();
    let isClientConnected = true;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      emitter.on('status', (event) => {
        if (isClientConnected) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

      res.on('close', () => {
        isClientConnected = false;
        emitter.removeAllListeners();
      });
    }

    const taskId = `speckit-${Date.now()}`;
    const executor = new StepExecutor({
      taskId,
      emitter: stream ? emitter : undefined
    });

    // Get tasks for phase
    const tasks = await executor.getTasksForPhase(phase);
    const filteredTasks = tasks.filter(task => {
      if (include && include.length > 0 && !include.includes(task.id)) {
        return false;
      }
      if (exclude && exclude.includes(task.id)) {
        return false;
      }
      return true;
    });

    if (filteredTasks.length === 0) {
      const message = include || exclude ?
        `No tasks matched the filters (include: ${include?.join(', ')}, exclude: ${exclude?.join(', ')})` :
        `No tasks found in phase "${phase}"`;

      if (stream && isClientConnected) {
        res.write(`data: ${JSON.stringify({
          warning: message,
          status: 200,
          taskId
        })}\n\n`);
        res.end();
      } else {
        res.json({
          warning: message,
          taskId,
          phase
        });
      }
      return;
    }

    // Execute tasks
    const results: Record<string, unknown> = {};
    for (const task of filteredTasks) {
      if (!isClientConnected && stream) {
        break;
      }

      const result = await executor.executeTask(task);
      if (!result.success) {
        if (stream && isClientConnected) {
          res.write(`data: ${JSON.stringify({
            error: result.error,
            task: task.id,
            status: 500
          })}\n\n`);
          res.end();
        } else {
          res.status(500).json({
            error: result.error,
            task: task.id,
            results
          });
        }
        return;
      }

      results[task.id] = result.output;
    }

    if (stream && isClientConnected) {
      res.write(`data: ${JSON.stringify({
        complete: true,
        results,
        taskCount: filteredTasks.length
      })}\n\n`);
      res.end();
    } else {
      res.json({
        taskId,
        phase,
        results,
        taskCount: filteredTasks.length,
        stats: executor.stats
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status =
      message.includes('phase not found') ? 404 :
      message.includes('invalid phase') ? 400 :
      500;

    if (stream) {
      res.write(`data: ${JSON.stringify({
        error: message,
        status,
        phase
      })}\n\n`);
      res.end();
    } else {
      res.status(status).json({
        error: message,
        phase
      });
    }
  }
}