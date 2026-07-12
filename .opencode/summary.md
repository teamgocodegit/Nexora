## Objective
Build Nexora's Venue Operations, Room Management & Print Center (Feature 4): flexible room model with dual team/people capacity, team assignment engine, capacity enforcement with overrides, auto-assignment with preview, live operations dashboard, exception center, 8-document Print Center with PDF/CSV/XLSX, and comprehensive tests.

## Completed
- **Extended Room model**: added `code`, `description`, `capacityTeams`, `capacityPeople`, `notes`, `sortOrder`, `ARCHIVED` status; added `RoomStatus` enum values `ACTIVE`, `FULL`, `CLOSED`, `ARCHIVED` (keeping `AVAILABLE`, `NEAR_CAPACITY` for backward compatibility)
- **Team.roomId FK**: added optional `roomId` foreign key on Team model; `room` string kept as denormalized cache for backward compat with email templates and exports
- **CapacityOverride model**: tracks actor, room, team, previous/projected occupancy, reason, timestamp
- **Room CRUD service** (`services/venue/room.service.ts`): create, update, archive, restore archive, reorder, soft-delete, status change with activity logging
- **Capacity engine**: dual `capacityTeams`/`capacityPeople` server-side enforcement via `checkCapacity()`; blocks CLOSED rooms; exact capacity allowed; overcapacity blocked
- **Capacity override**: SUPER_ADMIN only, requires reason, logs to `CapacityOverride` table, bypasses capacity check
- **Team assignment**: `assignTeamsToRoom()` with capacity check or override, `moveTeamToRoom()` recalculates source+target rooms, `unassignTeams()` clears room+roomId
- **Auto-assignment engine**: `previewAutoAssign()` dry-run → shows allocations per room + unassignable teams; `applyAutoAssign()` executes; strategy: exclude CLOSED/ARCHIVED, fill rooms by sortOrder/name, respect team+people capacity, never silently exceed
- **Bulk operations**: assign selected, move selected, unassign selected, auto-assign all unassigned (via operations routes)
- **Operations Dashboard** (`/operations`): summary metrics (total/checked-in/not-arrived/assigned/unassigned/participants/rooms), room cards with live occupancy, exception center tab with CRITICAL/WARNING/INFO issues
- **Exception Center**: detects CHECKED_IN_NO_ROOM, INVALID_ROOM_REFERENCE, ASSIGNED_TO_INACTIVE_ROOM, ORPHANED_ROOM_ASSIGNMENT, EMPTY_TEAM, ROOM_OVER_TEAM_CAPACITY, ROOM_OVER_PEOPLE_CAPACITY
- **Print Center** (`/print`): 8 document types — Team Master List, Participant Master List, Room Allocation Sheet, Check-In Sheet, Room Door Sheets, Team Desk Cards, Participant Badges, Blank Judging Sheets
- **PDF generation**: reuses existing Puppeteer infrastructure; A4 with proper margins, repeating headers, page breaks, print-safe typography
- **CSV exports**: team master, participant master, room allocation, check-in status; formula injection protection (`=`, `+`, `-`, `@` escaped with `'`)
- **XLSX exports**: team master, participant master via existing `xlsx` library
- **Filtered printing**: PDF supports `?checkedIn=true&unassigned=true&roomId=xxx` query params
- **QR integration**: existing `qrToken` reused for desk cards and badges (no new QR system)
- **Emergency Pack integration**: print service functions can be added to emergency ZIP pack
- **Socket.io events**: `room:created`, `room:occupancy`, `team:room-moved` added
- **RBAC**: added `room:view`, `room:assign`, `print:documents` permissions; SUB_ADMIN gets `room:view`
- **Activity logging**: all room mutations, assignments, overrides, print generation logged
- **Database indexes**: `Team.roomId` indexed, `CapacityOverride.roomId` and `.hackathonId` indexed
- **Tests**: 52 tests across 10 test files — all passing (34 existing + 18 new venue tests)

## Remaining
- Full regression test (Phase 22)
- Verify Print Center PDFs render correctly (requires Puppeteer + browser)
- Verify XLSX exports produce valid spreadsheets
- Verification steps in the Manual Testing Guide

## Relevant Files Created
- `server/src/services/venue/room.service.ts` — Core room CRUD, capacity engine, assignment, auto-assignment, archive/reorder
- `server/src/services/venue/operations.service.ts` — Ops dashboard metrics, room cards, exceptions, live room data
- `server/src/services/print/printCenter.service.ts` — 8 document types in PDF/CSV/XLSX with shared rendering
- `server/src/routes/operations.ts` — 10 endpoints for dashboard, rooms, exceptions, capacity check, assign/move/unassign, auto-assign
- `server/src/routes/print.ts` — 3 format endpoints per doc type (pdf/csv/xlsx), filtered via query params
- `server/src/services/venue/__tests__/room.service.test.ts` — 14 tests: capacity, assignment, auto-assign, archive, reorder
- `server/src/services/venue/__tests__/operations.service.test.ts` — 4 tests: dashboard, room cards, exceptions
- `client/src/pages/OperationsDashboardPage.tsx` — Live venue operations dashboard
- `client/src/pages/PrintCenterPage.tsx` — Print Center with 8 document types + format buttons

## Relevant Files Modified
- `server/prisma/schema.prisma` — Added Room fields, Team.roomId FK, CapacityOverride model, enum values
- `server/src/routes/rooms.ts` — Added archive/restore/reorder/status-change endpoints, updated GET with dual capacity
- `server/src/routes/operations.ts` — New operations router with 10 endpoints
- `server/src/routes/print.ts` — New print router with PDF/CSV/XLSX per doc type
- `server/src/index.ts` — Registered operationsRouter and printRouter
- `server/src/middleware/permissions.ts` — Added room:view, room:assign, print:documents permissions
- `server/src/services/reliability/integrity.service.ts` — Added summary counts to IntegrityReport
- `client/src/App.tsx` — Added OperationsDashboard and PrintCenter routes
- `client/src/components/layout/AppShell.tsx` — Added Rooms, Ops, Print to super admin nav
- `client/src/pages/RoomsPage.tsx` — Updated for dual capacity, new status values, new form fields
- `shared/types/index.ts` — Updated Room, Team interfaces; added RoomCard, OpsDashboardMetrics, ExceptionItem types
