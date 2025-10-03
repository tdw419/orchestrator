/**
 * Orchestrator main entry point
 */

import { createServer } from './server';

async function main() {
  // Start server unless disabled
  if (process.env.ORCH_NO_SERVER !== 'true') {
    createServer();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}