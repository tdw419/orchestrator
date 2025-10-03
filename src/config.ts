/**
 * Environment configuration
 */

export const config = {
  port: parseInt(process.env.ORCH_PORT || '4101', 10),
  model: process.env.ORCH_MODEL || 'qwen2.5-coder-1.5b',
  openaiApiBase: process.env.OPENAI_API_BASE || 'http://localhost:1234/v1',
  openaiApiKey: process.env.OPENAI_API_KEY,
  desktopDriverUrl: process.env.DESKTOP_DRIVER_URL || 'http://127.0.0.1:39990/computer-use',
  maxSteps: parseInt(process.env.MAX_STEPS || '8', 10),
  maxRetriesPerStep: parseInt(process.env.MAX_RETRIES_PER_STEP || '2', 10),
  maxRecursionDepth: parseInt(process.env.MAX_RECURSION_DEPTH || '2', 10),
  baseBackoffMs: parseInt(process.env.BASE_BACKOFF_MS || '500', 10),
  pythonBin: process.env.PYTHON_BIN || 'python3',
  maxContextChars: parseInt(process.env.MAX_CONTEXT_CHARS || '6000', 10),
};