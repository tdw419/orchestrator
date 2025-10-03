# Orchestrator Usage Guide

## VS Code Commands

### Orchestrator: Convert Roadmap to SpecKit Tasks
Converts a roadmap.json file into structured SpecKit tasks:
```bash
# Example roadmap.json structure
{
  "id": "feature-x",
  "title": "Implement Feature X",
  "phase": 1,
  "priority": 2,
  "complexity": "medium",
  "prompt": "Add Feature X with these requirements..."
}
```

The command generates:
- specs/roadmap/tasks.generated.md
- Individual spec files per task

### Orchestrator: Browse and Run Templates
Access the template catalog and execute specific templates:
1. Select a template from the catalog
2. Configure any template parameters
3. Monitor progress in the Output channel

### Orchestrator: Run SpecKit Phase
Automate execution of an entire SpecKit phase:
1. Choose the phase number
2. Watch real-time progress in Output
3. Review generated files after completion

### Orchestrator: Cancel Operation
Immediately stop the current operation:
- Click the Cancel button in the status bar
- Or run this command directly
- Useful for long-running operations

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| orchestrator.apiUrl | Orchestrator server URL | http://localhost:4100 |
| orchestrator.timeoutMs | Operation timeout | 30000 |
| orchestrator.provider | LLM provider (lmstudio/ollama) | lmstudio |

## What Success Looks Like

### Roadmap Conversion
```
Converting roadmap to SpecKit tasks...
✓ Generated tasks.generated.md
✓ Created 3 spec files
Done! Review specs/roadmap/ for results
```

### Template Execution
```
Running template: setup-component
✓ Created component scaffold
✓ Added unit tests
✓ Updated exports
Template completed successfully
```

### Phase Automation
```
Executing Phase 2...
Task T021: Component Setup ✓
Task T022: Integration Tests ✓
Task T023: Documentation ✓
Phase 2 completed
```

## Troubleshooting

### SSE Disconnects
- Check orchestrator server is running
- Verify network connectivity
- Operation continues in background
- Reconnect preserves progress

### Retry Behavior
- Automatic retry on transient errors
- Exponential backoff (1s, 2s, 4s...)
- Configure via orchestrator.timeoutMs
- Check Output for retry details

### Cancellation
- Tasks stop gracefully
- May take a few seconds
- Check Output for confirmation
- Reload window if stuck