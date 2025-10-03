# Feature Specification: Orchestrator API Endpoints

**Feature Branch**: `001-core-task-system-api`
**Created**: 2025-10-02
**Status**: Draft
**Input**: Based on existing linux-orchestrator implementation

## User Scenarios & Testing

### Primary User Story
As a client application, I want to interact with the orchestrator through a RESTful API that allows me to submit tasks, monitor their progress, and retrieve results, so that I can integrate task automation into my workflows.

### Acceptance Scenarios
1. **Given** a valid task request, **When** POSTing to /tasks, **Then** receive a task ID
2. **Given** a task ID, **When** GETting /tasks/{id}, **Then** receive current status
3. **Given** a task ID, **When** connecting to /events/{id}, **Then** receive SSE updates
4. **Given** a running task, **When** GETting /tasks/{id}/messages, **Then** receive execution log

### Edge Cases
- How are invalid task requests handled?
- What happens when requesting a non-existent task?
- How are SSE connections managed for completed tasks?
- How is task data cleaned up/archived?

## Requirements

### Functional Requirements

#### Task Management
- **FR-001**: POST /tasks MUST accept task submission with goal
- **FR-002**: POST /tasks MUST validate input format
- **FR-003**: POST /tasks MUST return task ID on success
- **FR-004**: GET /tasks MUST list all known tasks
- **FR-005**: GET /tasks/{id} MUST return task metadata and status
- **FR-006**: GET /tasks/{id}/messages MUST return execution log
- **FR-007**: GET /tasks/{id}/context MUST return current task context
- **FR-008**: GET /tasks/{id}/notes MUST return task annotations
- **FR-009**: POST /tasks/{id}/notes MUST accept new annotations

#### Real-time Updates
- **FR-010**: GET /events/{id} MUST establish SSE connection
- **FR-011**: SSE stream MUST emit step execution updates
- **FR-012**: SSE stream MUST emit verification results
- **FR-013**: SSE stream MUST close on task completion

#### System Health
- **FR-014**: GET /health MUST return service status
- **FR-015**: Health check MUST verify API dependencies

### Key Entities

- **TaskRequest**:
  - goal: string
  - env: optional environment variables
  - params: optional parameters

- **TaskResponse**:
  - id: string (UUID)
  - status: enum (pending, running, success, failed)
  - created_at: ISO timestamp
  - updated_at: ISO timestamp

- **TaskMessage**:
  - timestamp: ISO timestamp
  - level: enum (info, warning, error)
  - content: string
  - step_id: optional reference

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed