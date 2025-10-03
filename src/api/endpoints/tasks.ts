import { TemplateSpec, loadTemplate, renderTemplate, LoadTemplateOptions } from '../../tasks/templates';

export interface TaskStep {
  action: string;
  [key: string]: unknown;
}

export interface TaskRequestPayload {
  goal?: string;
  steps?: TaskStep[];
  template?: string;
  params?: Record<string, unknown>;
  env?: Record<string, string>;
}

export interface ResolvedTaskRequest {
  goal: string;
  steps: TaskStep[];
  env?: Record<string, string>;
  template?: {
    name: string;
    params: Record<string, unknown>;
  };
}

export interface ResolveTaskRequestOptions {
  loadTemplate?: (name: string, options?: LoadTemplateOptions) => Promise<TemplateSpec>;
  renderTemplate?: (spec: TemplateSpec, params?: Record<string, unknown>) => TemplateSpec;
  loadOptions?: LoadTemplateOptions;
}

export class TaskRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskRequestError';
  }
}

export async function resolveTaskRequest(
  payload: TaskRequestPayload,
  options: ResolveTaskRequestOptions = {},
): Promise<ResolvedTaskRequest> {
  if (!payload || typeof payload !== 'object') {
    throw new TaskRequestError('Invalid task payload');
  }

  const env = payload.env && Object.keys(payload.env).length > 0 ? { ...payload.env } : undefined;

  if (payload.template) {
    const loader = options.loadTemplate ?? loadTemplate;
    const renderer = options.renderTemplate ?? renderTemplate;

    const spec = await loader(payload.template, options.loadOptions);
    const rendered = renderer(spec, payload.params ?? {});

    if (!Array.isArray(rendered.steps) || rendered.steps.length === 0) {
      throw new TaskRequestError(`Template "${payload.template}" did not produce any steps`);
    }

    const goal = payload.goal ?? rendered.name ?? payload.template;

    return {
      goal,
      steps: normalizeSteps(rendered.steps),
      env,
      template: {
        name: payload.template,
        params: { ...(payload.params ?? {}) },
      },
    };
  }

  if (!payload.steps || !Array.isArray(payload.steps) || payload.steps.length === 0) {
    throw new TaskRequestError('Task requires either a template or a non-empty steps array');
  }

  if (!payload.goal) {
    throw new TaskRequestError('Task goal is required when steps are provided directly');
  }

  return {
    goal: payload.goal,
    steps: normalizeSteps(payload.steps),
    env,
  };
}

function normalizeSteps(steps: TaskStep[]): TaskStep[] {
  return steps.map(step => ({ ...step }));
}
