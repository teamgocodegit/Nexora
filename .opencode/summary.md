## Objective
Complete Nexora's Reliability, Backup & Disaster Recovery System (Feature 3): individual participant soft delete, team delete guards, ZIP-based emergency pack with PDF report, automated snapshot scheduling, integrity checks, and comprehensive tests.

## Completed
- **Soft Delete**: `softDeleteParticipant()`, `restoreParticipant()`, `checkTeamDeleteGuard()` — blocks deletion if team has scores, certificates, or is CHECKED_IN/ACTIVE/SUBMITTED
- **ZIP Emergency Pack**: `generateEmergencyPackZip()` using `archiver` — bundles CSVs (teams, participants, checkin, rooms, scores) + `snapshot.json` + `manifest.json` (SHA-256 per file). Route: `GET /export/emergency-pack?format=zip`
- **PDF Emergency Report**: `generateEmergencyPdf()` via Puppeteer — A4 printable with summary cards, team/participant/room tables. Route: `GET /export/emergency-pdf`
- **Snapshot Scheduler**: `startSnapshotScheduler()` runs every hour (configurable via `SNAPSHOT_SCHEDULER_INTERVAL`), creates AUTOMATIC snapshots for hackathons with no snapshot in 24h. Registered in `server/src/index.ts`
- **Integrity Checks**: `checkIntegrity()` returns summary counts, issues, overall severity. Added `summary` to return type.
- **Participant Routes**: `DELETE /delete/participant/:participantId`, `POST /restore/participant/:participantId`, `GET /delete/team/:teamId/guard`
- **Tests**: 34 tests across 4 files — all passing (softDelete: 22, snapshot: 4, export: 5, integrity: 2)

## Remaining
- Verify soft-deleted participants appear in `GET /recovery` endpoint
- Verify ZIP pack streaming with archiver works end-to-end
- Run full app smoke test: Registration Data Hub, email campaigns, certificates, check-in, rooms, Socket.io

## Relevant Files
- `server/src/services/reliability/softDelete.service.ts` — soft delete/restore/guard logic
- `server/src/services/reliability/export.service.ts` — CSV exports + ZIP emergency pack
- `server/src/services/reliability/pdfExport.service.ts` — PDF emergency report
- `server/src/services/reliability/snapshot.service.ts` — snapshot create/verify/restore
- `server/src/services/reliability/snapshotScheduler.service.ts` — automated snapshot scheduler
- `server/src/services/reliability/integrity.service.ts` — integrity checks
- `server/src/routes/reliability.ts` — all reliability routes
- `server/src/index.ts` — scheduler registration
- `server/src/services/reliability/__tests__/` — 4 test files (34 tests, all passing)
