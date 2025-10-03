import { runTemplateTask, RunTemplateTaskOptions, TemplateRunner } from '../api/templates/run';

export interface CliIO {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  exit: (code: number) => void;
}

export interface CliDependencies {
  runTemplateTask: (options: RunTemplateTaskOptions) => Promise<Record<string, unknown>>;
  runner: TemplateRunner;
}

/* istanbul ignore next */
const defaultIO: CliIO = {
  stdout: message => process.stdout.write(`${message}\n`),
  stderr: message => process.stderr.write(`${message}\n`),
  exit: code => process.exit(code),
};

/* istanbul ignore next */
const defaultDependencies: CliDependencies = {
  runTemplateTask,
  runner: {
    loadTemplate: async () => {
      throw new Error('loadTemplate not configured');
    },
    renderTemplate: async () => {
      throw new Error('renderTemplate not configured');
    },
    runSteps: async () => {
      throw new Error('runSteps not configured');
    },
  },
};

export async function runTemplateCli(
  argv: string[],
  io: CliIO = defaultIO,
  dependencies: CliDependencies = defaultDependencies,
): Promise<void> {
  if (argv.length < 3) {
    throw new Error('No command specified');
  }

  const [, , command, ...rest] = argv;

  if (command !== 'run') {
    throw new Error(`Unsupported command "${command}"`);
  }

  if (rest.length === 0) {
    throw new Error('A template name is required for the run command');
  }

  const [template, ...flags] = rest;
  if (!template) {
    throw new Error('Template name is required');
  }

  const params: Record<string, unknown> = {};
  let goal: string | undefined;

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--param') {
      const value = flags[++i];
      if (!value || !value.includes('=')) {
        throw new Error('Parameters must be specified as key=value');
      }
      const [key, paramValue] = value.split('=');
      params[key] = paramValue;
      continue;
    }

    if (flag === '--goal') {
      goal = flags[++i];
      if (!goal) {
        throw new Error('--goal flag requires a value');
      }
      continue;
    }

    throw new Error(`Unknown flag "${flag}"`);
  }

  try {
    const result = await dependencies.runTemplateTask({
      template,
      params,
      metadata: goal ? { goal } : {},
      runner: dependencies.runner,
    });

    io.stdout(JSON.stringify(result, null, 2));
    io.exit(0);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.exit(1);
  }
}
