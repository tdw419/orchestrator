# Orchestrator ↔ LM Studio Integration Plan

## Goals
- Let VS Code AI (Codex) draft roadmap items.
- Delegate roadmap → SpecKit conversion to the orchestrator using LM Studio.
- Automate SpecKit task execution via orchestrator templates.
- Run the full loop (planning + execution) with orchestrator + LM Studio as the autopilot runtime.

## Components

| Layer | Responsibilities | Key Files |
|-------|-------------------|-----------|
| VS Code Extension | Collect roadmap ideas from Codex, send roadmap payloads to orchestrator, display resulting SpecKit tasks & run status | `projects/vscode_to_llm/src/extension.ts`, `projects/vscode_to_llm/src/orchestratorClient.ts` |
| Orchestrator (Roadmap Converter) | Call LM Studio to transform roadmap entries into SpecKit docs/tasks, update `specs/...` | `src/tasks/roadmap-converter.ts` *(new)*, `docs/roadmap.md` |
| SpecKit Automation | Parse `specs/.../tasks.md`, map tasks to templates, enqueue orchestrator tasks | `src/tasks/speckit-runner.ts`, `templates/speckit_*.yaml`, `scripts/speckit/*.sh` |
| Orchestrator Runtime | Execute templates (tests, builds, verifiers), call LM Studio for reasoning, emit logs/events | `src/tasks/templates.ts`, `src/tasks/manager.ts`, `linux-orchestrator/src/index.ts` |
| LM Studio | Local OpenAI-compatible API serving chosen model | external |

## Data Flow

1. **VS Code AI drafts roadmap** (Markdown/JSON).
2. Extension sends roadmap payload to orchestrator (`POST /automation/roadmap`).
3. Orchestrator prompts LM Studio to emit SpecKit phase/task entries, updates `specs/.../*` accordingly.
4. Extension requests template catalog (`GET /templates`), lets user choose phases/tasks, and submits runs via `POST /templates/:name/run` or `POST /automation/speckit`.
5. Orchestrator executes templates; LM Studio handles reasoning/repair steps during execution.
6. Progress streams back to VS Code via `/tasks/:id/events` and automation status endpoints.

## Implementation Tasks Mapping

| SpecKit Task | Summary | Dependencies |
|--------------|---------|--------------|
| T055–T058 | Template catalog/listing and run handlers. Already covered by unit tests `tests/api/templates/*.test.ts`. Need HTTP wiring. | Phase 10 completed features |
| T059–T062 | CLI + automation runner to enqueue tasks (done: `runTemplateCli`, `runSpecKitAutomation`). | T055–T058 |
| **T063** | Add VS Code tests ensuring roadmap conversion & template catalog retrieval. Mock orchestrator responses. |
| **T064** | Implement extension commands to submit roadmap, review generated SpecKit tasks, and start runs. |
| **T065** | Integration tests for REST catalog endpoint (supertest or e2e). |
| **T066** | Add `/templates` GET handler to orchestrator HTTP server returning data from `buildTemplateCatalog`. |
| **T067** | HTTP tests covering `POST /templates/:name/run` (happy path, validation). |
| **T068** | Wire run endpoint to call `runTemplateTask` + `runSpecKitAutomation` as needed. |
| **T069** | Integration tests verifying orchestrator → LM Studio calls for conversion and execution. |
| **T070** | Add LM Studio provider config (`src/config.ts`), extend executor to call `fetch` with streaming or JSON. |
| **T071** | HTTP-level tests calling SpecKit automation route (`POST /automation/speckit`). |
| **T072** | Add orchestrator API/CLI to call `runSpecKitAutomation` with payload (phase/include/exclude). |
| **T073** | Roadmap conversion tests in `tests/tasks/roadmap-converter.test.ts`. |
| **T074** | Roadmap conversion implementation & `/automation/roadmap` handler. |

## Configuration

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_BASE` | Point to LM Studio server (default `http://127.0.0.1:1234/v1`). |
| `OPENAI_API_KEY` | LM Studio key (if required). |
| `LM_STUDIO_MODEL` | Optional override for orchestrator prompts. |

### CLI Usage (after T059/T070/T072/T074)

```bash
# Run a single template
node dist/cli/templates.js run speckit_T055_api_catalog_tests --param project=gvpie --goal "Verify catalog endpoint"

# Automate entire phase via CLI wrapper
node dist/cli/speckit.js run --phase "Phase 11: Template Runtime & Automation" --include T055 T056 --orchestrator http://localhost:4100

# Convert roadmap then enqueue phase runs
node dist/cli/roadmap.js convert --input docs/roadmap.md --phase "Phase 12: VSCode & Orchestrator Integration" --run
```

## Open Questions
- Should template execution queue allow parallel `[P]` tasks? `runSpecKitAutomation` currently sends sequentially; future enhancement: group parallel tasks.
- How should orchestration errors be surfaced to VS Code? Option: new SSE channel `/automation/:id/events`.
- Do we need persistence for automation runs (e.g. artifact of template submissions)? Could write `data/automation/<run-id>.json`.

## Next Steps
1. Implement roadmap conversion (T073/T074) and expose `/automation/roadmap`.
2. Implement orchestrator endpoints (T066/T068/T072) for catalog/run/automation.
3. Extend VS Code extension end-to-end (T063/T064).
4. Configure orchestrator executor to call LM Studio (T069/T070) and document setup.
