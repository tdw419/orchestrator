# Orchestrator Self-Improvement Roadmap

**Purpose**: Iteratively harden the orchestrator for production while improving UX, observability, and self-serve automation. Each item is designed to be implemented by Auto Dev through the `scripts/run-roadmap.ps1` runner.

## Phase 1 — Security & Reliability 🛡️

**Priority: High**

- **sec-admin-token**: Protect `/admin/*` endpoints via `ORCH_ADMIN_TOKEN` bearer auth with middleware validation
- **input-limits**: Enforce request size limits (10MB) and rate limiting (100 req/min) for all endpoints  
- **retention-quotas**: Add `MAX_TASKS_ON_DISK`, `MAX_LOG_LINES`, `MAX_SHOT_MB` with automatic eviction/cleanup
- **error-resilience**: Implement retry/backoff for LLM planner and summary calls on transient errors
- **input-validation**: Strengthen JSON schema validation, sanitization, and proper HTTP error codes

## Phase 2 — Observability & DX 📊

**Priority: High**

- **step-metrics**: Record per-step duration, token counts, error rates in `steps.json` and expose via `/tasks/:id/metrics`
- **zip-download**: Add `GET /tasks/:id/download` to bundle `data/tasks/<id>` + screenshots as ZIP
- **structured-logging**: Replace console.log with JSON structured logging with levels and correlation IDs
- **api-docs**: Generate OpenAPI/Swagger docs and serve at `/docs` with interactive explorer
- **health-detailed**: Enhance `/health` with LLM connectivity, disk space, memory usage checks

✅ **logs-filters**: Role filter and since/next_since incremental polling (completed)  
✅ **json-context**: Structured context sections with scores (completed)

## Phase 3 — UX & Viewer Enhancements 🎨

**Priority: Medium**

- **pin-artifacts**: Add "Pin to Notes" buttons near screenshots to promote artifacts to context
- **context-toggles**: Checkboxes to show/hide context sections (notes, errors, results, autodev)
- **dark-mode**: CSS custom properties dark theme with localStorage persistence
- **task-search**: Search and filter tasks by goal, status, date range with pagination
- **viewer-realtime**: WebSocket connections for instant task updates and live context changes

✅ **activity-auto-refresh**: Toggle incremental polling with auto-scroll (completed)

## Phase 4 — Distribution & Ops 🚀

**Priority: Medium**

- **windows-service**: Windows Service installer script and service wrapper for background operation
- **config-profiles**: Support `.env` files and profile switching (`ORCH_PROFILE=dev/prod/test`)
- **single-binary**: Package with `pkg`/`nexe` for zero-dependency deployment
- **monitoring**: Optional Prometheus metrics at `/metrics` with HTTP stats and task throughput
- **deployment-scripts**: Docker containers and deployment automation scripts

## Phase 5 — Self-Improvement & Quality 🔄

**Priority: Low**

- **roadmap-runner**: Script to execute roadmap items via Auto Dev integration (this implementation)
- **quality-gates**: Automated testing gates with API tests, viewer tests, and smoke tests
- **performance-profiling**: Memory tracking, execution analysis, and bottleneck identification
- **plugin-system**: Extensible architecture for custom tools and viewer components
- **auto-docs**: Generate README sections from code annotations and environment variables

## Implementation Strategy

1. **Individual Items**: `scripts\run-roadmap.ps1 -Ids sec-admin-token,zip-download`
2. **Phase Execution**: Run complete phases systematically for comprehensive improvement
3. **Quality Gates**: Test each improvement before moving to next item
4. **Monitoring**: Use viewer Activity tab and structured logs to track progress

## Success Metrics

- **Security**: Zero admin vulnerabilities, proper input validation
- **Reliability**: >99% uptime, graceful error handling, automatic recovery  
- **Performance**: <500ms API response times, efficient resource usage
- **Usability**: Intuitive viewer, comprehensive documentation
- **Maintainability**: Clean code, automated testing, self-documentation

## Usage

```powershell
# Run specific improvements
.\scripts\run-roadmap.ps1 -Ids sec-admin-token,retention-quotas -AutoDevRoot "C:\path\to\ai_auto_development\ai_auto_development"

# Run entire phase
.\scripts\run-roadmap.ps1 -Phase 1 -AutoDevRoot "C:\path\to\ai_auto_development"

# Dry run to preview
.\scripts\run-roadmap.ps1 -Ids step-metrics -DryRun
```

**Notes**: Keep changes minimal and consistent with current style. Validate improvements with the viewer, context JSON endpoint, and logs incremental polling.

