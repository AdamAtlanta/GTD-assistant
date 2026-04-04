# GTD Assistant Roadmap

## Current Position

This project is now a working personal-tool prototype with:

- Google sign-in
- Google Tasks review and task completion
- Gmail triage with AI-generated summaries
- Calendar review with event-to-task conversion
- Slack context collection
- SMS webhook ingestion with local persistence

## Phase 1: Stabilize The Core

Goal: make the existing workflow reliable enough for daily personal use.

- Keep auth and token refresh healthy
- Improve API failure handling and user-facing error states
- Preserve local SMS data across restarts
- Document setup, required scopes, and workflow assumptions
- Keep lint clean and shared types consistent

## Phase 2: Make Reviews More Useful

Goal: increase decision quality during the daily or weekly review.

- Save review history
- Explain why each suggestion was made
- Add AI confidence or rationale labels where helpful
- Let the UI hold quick manual notes on emails, tasks, and events
- Improve stale-task detection and follow-up prompts

## Phase 3: Expand Inputs

Goal: widen the capture net without overcomplicating the tool.

- Show SMS triage directly in the dashboard
- Include additional calendars beyond `primary`
- Add calendar presets for legal or trial calendars
- Refine Slack summaries by channel or recency

## Phase 4: Legal Workflow Enhancements

Goal: support client and matter preparation work when the core tool feels solid.

- Clio OAuth integration
- Matter matching from calendar events
- Discovery-folder document surfacing in calendar review
- Better cross-linking between calendar, tasks, and matter context

## Recommended Build Order

1. Save audit history
2. Add better error and rationale display in the dashboard
3. Add SMS review UI
4. Expand multi-calendar support
5. Add Clio integration

## Guardrails

- Keep this project optimized for one user unless requirements change
- Prefer low-maintenance local persistence before adding infrastructure
- Avoid adding more integrations until the current review loop feels dependable
