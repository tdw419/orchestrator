# Orchestrator REST API Guide

## Overview

The orchestrator provides several HTTP endpoints to support the VS Code → SpecKit → LM Studio workflow:

- `GET /templates`: List available templates with metadata
- `POST /templates/:name/run`: Execute a template with streaming status
- `POST /automation/speckit`: Run SpecKit automation for a phase
- `POST /automation/roadmap`: Convert roadmap to SpecKit docs

## Template Discovery

```http
GET /templates

Response:
{
  "templates": [
    {
      "name": "lmstudio_reasoning",
      "description": "Template demonstrating LM Studio reasoning",
      "stepTypes": ["reason", "command"],
      "params": ["requirements"],
      "hasReasoning": true
    }
  ]
}
```

## Template Execution

```http
POST /templates/:name/run
{
  "params": {
    "requirements": "Add dark mode support"
  },
  "stream": true
}

Response (SSE):
data: {"status": "Executing step analyze"}
data: {"status": "Reasoning: Analyzing requirements..."}
data: {"complete": true, "results": {...}}
```

## SpecKit Automation

```http
POST /automation/speckit
{
  "phase": "Phase 1: Template Runtime",
  "include": ["T001", "T002"],
  "exclude": ["T003"],
  "stream": true
}

Response (SSE):
data: {"status": "Processing task T001"}
data: {"complete": true, "taskCount": 2}
```

## Roadmap Conversion

```http
POST /automation/roadmap
{
  "roadmapFile": "roadmap.json",
  "outputDir": "specs/roadmap",
  "tasksFile": "specs/roadmap/tasks.generated.md"
}

Response:
{
  "success": true,
  "tasksFile": "specs/roadmap/tasks.generated.md"
}
```

## Error Handling

The API uses standard HTTP status codes:

- 200: Success
- 400: Invalid request (missing parameters, invalid template)
- 404: Resource not found (template, phase)
- 500: Server error (execution failure)

When using `stream: true`, errors are sent as SSE events with a status field.

## SSE Status Updates

For endpoints that support streaming (`stream: true`), status updates are sent as Server-Sent Events:

```javascript
// Regular status update
data: {"status": "current operation", "taskId": "..."}

// Warning (operation continues)
data: {"warning": "message", "status": 200, "taskId": "..."}

// Error (operation stops)
data: {"error": "message", "status": 500, "taskId": "..."}

// Completion
data: {"complete": true, "results": {...}}
```

## VS Code Integration

Example usage in the VS Code extension:

```typescript
// List templates
const catalog = await fetch('http://localhost:4100/templates');
const templates = await catalog.json();

// Execute template with streaming
const response = await fetch('http://localhost:4100/templates/lmstudio_reasoning/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    params: { requirements: '...' },
    stream: true
  })
});

const reader = response.body.getReader();
// Process streaming updates...