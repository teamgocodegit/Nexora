import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { parseFile, inspectFile, cleanupFile } from '../services/import/parser.service';
import { suggestMapping, detectLayout, applyMapping, type LayoutType, type ColumnMapping } from '../services/import/mapper.service';
import { normalizeRecord } from '../services/import/normalizer.service';
import { validateTeams } from '../services/import/validator.service';
import { executeImport, finalizeImport } from '../services/import/importer.service';
import { emitToHackathon } from '../lib/socket';
import { io } from '../index';
import { getMetrics } from '../services/metricsService';
import { logger } from '../lib/logger';

export const importRouter = Router({ mergeParams: true });
importRouter.use(authenticate);
importRouter.use(requireSuperAdmin);

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/imports');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Supported: .xlsx, .xls, .csv'));
    }
  },
});

interface SimpleMapping {
  sourceHeader: string;
  targetField: string;
}

// GET import history
importRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const batches = await prisma.importBatch.findMany({
      where: { hackathonId: req.params.hackathonId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch import history' });
  }
});

// GET single import batch
importRouter.get('/:batchId', async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.batchId, hackathonId: req.params.hackathonId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });
    res.json(batch);
  } catch {
    res.status(500).json({ error: 'Failed to fetch import batch' });
  }
});

// Phase 1: Upload file
importRouter.post('/upload', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const hackathonId = req.params.hackathonId;

    const { sheets, fileFingerprint } = inspectFile(filePath, originalName);

    const batch = await prisma.importBatch.create({
      data: {
        hackathonId,
        originalFileName: originalName,
        fileType: path.extname(originalName).toLowerCase().replace('.', ''),
        status: 'UPLOADED',
        fileFingerprint,
        createdById: req.user!.id,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: `File "${originalName}" uploaded for import. Batch: ${batch.id}`,
        hackathonId,
        actorId: req.user!.id,
        metadata: JSON.parse(JSON.stringify({ batchId: batch.id, sheets, fileFingerprint })),
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.json({
      batchId: batch.id,
      sheets,
      fileFingerprint,
    });
  } catch (err: any) {
    if (req.file) cleanupFile(req.file.path);
    res.status(400).json({ error: err.message });
  }
});

// Phase 2: Inspect / preview data
importRouter.post('/:batchId/inspect', async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.batchId, hackathonId: req.params.hackathonId },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });

    const hackathonId = req.params.hackathonId;

    const dir = fs.readdirSync(UPLOAD_DIR);
    const file = dir.find((f) => f.endsWith(batch.originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')));
    if (!file) return res.status(400).json({ error: 'Uploaded file not found. Please re-upload.' });

    const filePath = path.join(UPLOAD_DIR, file);
    const { sheetName } = req.body || {};

    const parsed = parseFile(filePath, batch.originalFileName, sheetName);

    const detected = detectLayout(parsed.headers);
    const mappings = suggestMapping(parsed.headers, detected.layout);

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        selectedSheetName: parsed.selectedSheet,
        totalRows: parsed.rows.length,
        mappingConfig: JSON.parse(JSON.stringify({ headers: parsed.headers, mappings, layout: detected.layout, confidence: detected.confidence })),
      },
    });

    res.json({
      headers: parsed.headers,
      rows: parsed.rows.slice(0, 10),
      totalRows: parsed.rows.length,
      sheets: parsed.sheets,
      selectedSheet: parsed.selectedSheet,
      detectedLayout: detected,
      mappings,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Phase 3: Map columns
importRouter.post('/:batchId/map', async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.batchId, hackathonId: req.params.hackathonId },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });

    const schema = z.object({
      mappings: z.array(z.object({
        sourceHeader: z.string(),
        targetField: z.string(),
      })),
      layout: z.enum(['TEAM_PER_ROW', 'PARTICIPANT_PER_ROW']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid mappings', details: parsed.error.errors });
    }

    const { mappings, layout } = parsed.data;
    const existingConfig = batch.mappingConfig as Record<string, unknown> || {};

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: 'MAPPED',
        mappingConfig: JSON.parse(JSON.stringify({ ...existingConfig, mappings, layout })),
      },
    });

    res.json({ success: true, mappings, layout });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Phase 4: Preview & Validate
importRouter.post('/:batchId/validate', async (req: AuthRequest, res) => {
  try {
    const hackathonId = req.params.hackathonId;
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.batchId, hackathonId },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });

    const config = batch.mappingConfig as { headers?: string[]; mappings?: SimpleMapping[]; layout?: LayoutType } || {};
    if (!config.mappings || !config.layout) {
      return res.status(400).json({ error: 'Mapping configuration not found. Please complete mapping step.' });
    }

    const dir = fs.readdirSync(UPLOAD_DIR);
    const file = dir.find((f) => f.endsWith(batch.originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')));
    if (!file) return res.status(400).json({ error: 'Uploaded file not found. Please re-upload.' });

    const filePath = path.join(UPLOAD_DIR, file);
    const parsed = parseFile(filePath, batch.originalFileName, batch.selectedSheetName || undefined);

    const fullMappings: ColumnMapping[] = config.mappings.map((m) => ({
      sourceHeader: m.sourceHeader,
      targetField: m.targetField,
      confidence: 100,
      confidenceLabel: 'HIGH' as const,
      reason: 'User configured',
    }));

    const mappedRecords = applyMapping(parsed.rows, parsed.headers, fullMappings, config.layout);

    const normalization = normalizeRecord(mappedRecords, config.layout);

    const hackathon = await prisma.hackathon.findUnique({
      where: { id: hackathonId },
      select: { maxTeamSize: true },
    });

    const existingTeamNames = await prisma.team.findMany({
      where: { hackathonId, deletedAt: null },
      select: { name: true },
    }).then((teams) => teams.map((t) => t.name));

    const existingEmails: string[] = [];

    const validation = await validateTeams(
      normalization.records,
      hackathonId,
      hackathon?.maxTeamSize || 5,
      existingTeamNames,
      existingEmails
    );

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: 'VALIDATED',
        validRows: validation.totalValid,
        warningRows: validation.totalWarnings,
        errorRows: validation.totalErrors,
      },
    });

    res.json({
      validation,
      normalization: {
        totalRecords: normalization.records.length,
        skippedRows: normalization.skippedRows,
        errors: normalization.errors,
      },
      parsed: {
        totalRows: parsed.rows.length,
        headers: parsed.headers,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Phase 5: Execute Import
importRouter.post('/:batchId/import', async (req: AuthRequest, res) => {
  try {
    const hackathonId = req.params.hackathonId;
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.batchId, hackathonId },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });

    if (batch.status === 'COMPLETED' || batch.status === 'IMPORTING') {
      return res.status(400).json({ error: `Import batch is already ${batch.status}` });
    }

    const config = batch.mappingConfig as { headers?: string[]; mappings?: SimpleMapping[]; layout?: LayoutType } || {};
    if (!config.mappings || !config.layout) {
      return res.status(400).json({ error: 'Mapping configuration not found.' });
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'IMPORTING' },
    });

    const dir = fs.readdirSync(UPLOAD_DIR);
    const file = dir.find((f) => f.endsWith(batch.originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')));
    if (!file) {
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: 'FAILED', failureReason: 'Uploaded file not found on server' },
      });
      return res.status(400).json({ error: 'Uploaded file not found.' });
    }

    const filePath = path.join(UPLOAD_DIR, file);
    const parsed = parseFile(filePath, batch.originalFileName, batch.selectedSheetName || undefined);

    const fullMappings: ColumnMapping[] = config.mappings.map((m) => ({
      sourceHeader: m.sourceHeader,
      targetField: m.targetField,
      confidence: 100,
      confidenceLabel: 'HIGH' as const,
      reason: 'User configured',
    }));

    const mappedRecords = applyMapping(parsed.rows, parsed.headers, fullMappings, config.layout);
    const normalization = normalizeRecord(mappedRecords, config.layout);

    const existingTeamNames = await prisma.team.findMany({
      where: { hackathonId, deletedAt: null },
      select: { name: true },
    }).then((teams) => teams.map((t) => t.name));

    const validation = await validateTeams(
      normalization.records,
      hackathonId,
      5,
      existingTeamNames,
      []
    );

    const validTeams = validation.teams.filter((t) => t.status !== 'ERROR');

    const importResult = await executeImport(hackathonId, req.user!.id, batch.id, validTeams);

    await finalizeImport(
      batch.id,
      importResult,
      parsed.rows.length,
      validation.totalValid,
      validation.totalWarnings,
      validation.totalErrors
    );

    await prisma.activityLog.create({
      data: {
        action: `Import "${batch.originalFileName}" completed: ${importResult.importedTeams} teams, ${importResult.importedParticipants} participants`,
        hackathonId,
        actorId: req.user!.id,
        metadata: JSON.parse(JSON.stringify({ batchId: batch.id, ...importResult })),
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    getMetrics(hackathonId).then((m) => {
      emitToHackathon(io, hackathonId, 'metrics:updated', m);
    }).catch((e: Error) => logger.error(`[Metrics] ${e}`));

    cleanupFile(filePath);

    res.json(importResult);
  } catch (err: any) {
    await prisma.importBatch.update({
      where: { id: req.params.batchId },
      data: { status: 'FAILED', failureReason: err.message },
    }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// Cancel import
importRouter.post('/:batchId/cancel', async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.batchId, hackathonId: req.params.hackathonId },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found' });
    if (['COMPLETED', 'IMPORTING', 'FAILED'].includes(batch.status)) {
      return res.status(400).json({ error: `Cannot cancel import with status: ${batch.status}` });
    }
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'CANCELLED' },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to cancel import' });
  }
});

export function cleanupImportFiles(): void {
  const dir = fs.readdirSync(UPLOAD_DIR);
  const now = Date.now();
  for (const file of dir) {
    const filePath = path.join(UPLOAD_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // skip
    }
  }
}

setInterval(cleanupImportFiles, 60 * 60 * 1000);
