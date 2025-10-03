# Tasks: Core Task Orchestration System

**Input**: Design documents from `/specs/001-core-task-system/`
**Prerequisites**: plan.md, core-task-system.spec.md, api-endpoints.spec.md, verification-system.spec.md

## Phase 1: Project Setup
- [ ] T001 Create TypeScript project structure per implementation plan
- [ ] T002 [P] Configure TypeScript compiler options in tsconfig.json
- [ ] T003 [P] Set up testing infrastructure
- [ ] T004 [P] Configure linting and formatting
- [ ] T005 Configure build scripts in package.json

## Phase 2: Core Task System (Tests First)
- [ ] T006 [P] Task type definitions in src/types.ts
- [ ] T007 [P] Task manager interface in tests/tasks/manager.test.ts
- [ ] T008 [P] Task executor interface in tests/tasks/executor.test.ts
- [ ] T009 [P] Task storage interface in tests/tasks/storage.test.ts
- [ ] T010 [P] Retry logic tests in tests/tasks/retry.test.ts
- [ ] T011 [P] Event emission tests in tests/tasks/events.test.ts

## Phase 3: Core Implementation
- [ ] T012 Task manager implementation in src/tasks/manager.ts
- [ ] T013 Task executor implementation in src/tasks/executor.ts
- [ ] T014 Task storage implementation in src/tasks/storage.ts
- [ ] T015 Retry logic implementation in src/tasks/retry.ts
- [ ] T016 Event system implementation in src/tasks/events.ts

## Phase 4: API Layer (Tests First)
- [ ] T017 [P] HTTP server tests in tests/api/server.test.ts
- [ ] T018 [P] Router tests in tests/api/router.test.ts
- [ ] T019 [P] Task endpoints tests in tests/api/endpoints/tasks.test.ts
- [ ] T020 [P] Events endpoint tests in tests/api/endpoints/events.test.ts
- [ ] T021 [P] Health endpoint tests in tests/api/endpoints/health.test.ts

## Phase 5: API Implementation
- [ ] T022 HTTP server implementation in src/api/server.ts
- [ ] T023 Router implementation in src/api/router.ts
- [ ] T024 Task endpoints in src/api/endpoints/tasks.ts
- [ ] T025 Events endpoint in src/api/endpoints/events.ts
- [ ] T026 Health endpoint in src/api/endpoints/health.ts

## Phase 6: Verifiers (Tests First)
- [ ] T027 [P] Verifier interface tests in tests/verifiers/index.test.ts
- [ ] T028 [P] File verifier tests in tests/verifiers/file.test.ts
- [ ] T029 [P] API verifier tests in tests/verifiers/api.test.ts
- [ ] T030 [P] Script verifier tests in tests/verifiers/test.test.ts
- [ ] T031 [P] VSCode verifier tests in tests/verifiers/vscode.test.ts

## Phase 7: Verifier Implementation
- [ ] T032 Verifier registry in src/verifiers/index.ts
- [ ] T033 File verifier in src/verifiers/file.ts
- [ ] T034 API verifier in src/verifiers/api.ts
- [ ] T035 Script verifier in src/verifiers/test.ts
- [ ] T036 VSCode verifier in src/verifiers/vscode.ts

## Phase 8: Utils & Integration
- [ ] T037 [P] Logging system in src/utils/logger.ts
- [ ] T038 [P] SSE helpers in src/utils/sse.ts
- [ ] T039 [P] Process management in src/utils/subprocess.ts
- [ ] T040 Environment configuration in src/config.ts
- [ ] T041 Main entry point in src/index.ts

## Phase 9: Testing & Documentation
- [ ] T042 [P] Integration test suite in tests/integration/
- [ ] T043 [P] End-to-end test scenarios in tests/e2e/
- [ ] T044 [P] API documentation in docs/api.md
- [ ] T045 [P] Verifier guide in docs/verifiers.md
- [ ] T046 [P] Deployment guide in docs/deploy.md

## Phase 10: Template & Diagnostics Enhancements
- [ ] T047 [P] Template rendering tests in tests/tasks/templates.test.ts
- [ ] T048 Template rendering implementation in src/tasks/templates.ts
- [ ] T049 [P] Template submission tests in tests/api/templates.test.ts
- [ ] T050 Template submission handling in src/api/endpoints/tasks.ts
- [ ] T051 [P] Pluggable verifier loading tests in tests/verifiers/loader.test.ts
- [ ] T052 Verifier loader implementation in src/verifiers/loader.ts
- [ ] T053 [P] Diagnostics hook tests in tests/tasks/diagnostics.test.ts
- [ ] T054 Diagnostics hook implementation in src/tasks/manager.ts

## Phase 11: Template Runtime & Automation
- [ ] T055 [P] Template catalog endpoint tests in tests/api/templates/catalog.test.ts
- [ ] T056 Template catalog endpoint implementation in src/api/templates/catalog.ts
- [ ] T057 [P] Template execution endpoint tests in tests/api/templates/run.test.ts
- [ ] T058 Template execution endpoint implementation in src/api/templates/run.ts
- [ ] T059 [P] Template CLI runner tests in tests/cli/templates.test.ts
- [ ] T060 Template CLI runner implementation in src/cli/templates.ts
- [ ] T061 [P] SpecKit automation runner tests in tests/tasks/speckit-runner.test.ts
- [ ] T062 SpecKit automation runner implementation in src/tasks/speckit-runner.ts

## Phase 12: VSCode & Orchestrator Integration
- [ ] T063 [P] VSCode extension templating tests in projects/vscode_to_llm/tests/templates.test.ts
- [ ] T064 VSCode extension template integration in projects/vscode_to_llm/src/extension.ts
- [ ] T065 [P] Template catalog API endpoint tests in tests/api/templates/catalog.http.test.ts
- [ ] T066 Template catalog API endpoint implementation in src/api/templates/catalog-endpoint.ts
- [ ] T067 [P] Template run API integration tests in tests/api/templates/run.http.test.ts
- [ ] T068 Template run API handler wiring in src/api/endpoints/templates.ts
- [ ] T069 [P] LM Studio provider tests in tests/integration/lmstudio-provider.test.ts
- [ ] T070 LM Studio provider config & executor integration in src/tasks/executor/lmstudio.ts
- [ ] T071 [P] SpecKit automation orchestration tests in tests/tasks/speckit-runner.http.test.ts
- [ ] T072 SpecKit automation orchestrator in src/tasks/speckit-orchestrator.ts
- [ ] T073 [P] Roadmap conversion tests in tests/tasks/roadmap-converter.test.ts
- [ ] T074 Roadmap conversion implementation & HTTP handler in src/tasks/roadmap-converter.ts

## Dependencies
- Setup (T001-T005) before any implementation
- Tests (T006-T011) before core implementation (T012-T016)
- Core system before API layer
- API tests before implementation
- Verifier tests before implementation
- Utils can be built in parallel
- Documentation after implementation
- Template & diagnostics enhancements (T047-T054) after core and API functionality
- Template runtime & automation (T055-T062) after template & diagnostics enhancements
- VSCode & orchestrator integration (T063-T074) after template runtime & automation

## Parallel Example
```
# Launch all interface tests:
Task: "Task manager interface in tests/tasks/manager.test.ts"
Task: "Task executor interface in tests/tasks/executor.test.ts"
Task: "Task storage interface in tests/tasks/storage.test.ts"
Task: "Retry logic tests in tests/tasks/retry.test.ts"
Task: "Event emission tests in tests/tasks/events.test.ts"
```

## Task Generation Rules
- Tests before implementation
- Interface definitions before concrete code
- Core system before API layer
- Utils can be built independently
- Documentation after features

## Validation Checklist
- [x] All specs have corresponding tests
- [x] All interfaces have implementation tasks
- [x] All tests come before implementation
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
