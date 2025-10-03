import { TemplateSpec } from '../../tasks/templates';

export interface TemplateRunMetadata {
  goal: string;
  template: string;
  params: Record<string, unknown>;
}

export interface TemplateRunner {
  loadTemplate: (name: string) => Promise<TemplateSpec>;
  renderTemplate: (spec: TemplateSpec, params: Record<string, unknown>) => Promise<TemplateSpec> | TemplateSpec;
  runSteps: (steps: TemplateSpec['steps'], metadata: TemplateRunMetadata) => Promise<Record<string, unknown>>;
}

export interface RunTemplateTaskOptions {
  template: string;
  params?: Record<string, unknown>;
  metadata?: { goal?: string };
  runner: TemplateRunner;
}

export async function runTemplateTask(options: RunTemplateTaskOptions): Promise<Record<string, unknown>> {
  const templateName = (options.template ?? '').trim();
  if (!templateName) {
    throw new Error('template name is required');
  }

  const params = options.params ?? {};

  const spec = await options.runner.loadTemplate(templateName);
  const rendered = await options.runner.renderTemplate(spec, params);

  const steps = Array.isArray(rendered?.steps) ? rendered.steps : undefined;

  if (!steps || steps.length === 0) {
    throw new Error(`Template "${templateName}" produced no steps`);
  }

  const goal = options.metadata?.goal ?? spec.name ?? rendered.name ?? templateName;
  const runMetadata: TemplateRunMetadata = {
    goal,
    template: templateName,
    params,
  };

  return options.runner.runSteps(steps, runMetadata);
}
