import { prisma } from '../../lib/prisma';
import type { Team, Participant } from '@prisma/client';
import { renderTemplate, type TemplateContext } from './template.service';
import { logger } from '../../lib/logger';

export interface AudienceResolution {
  recipients: Array<{
    email: string;
    name: string;
    teamId?: string;
    participantId?: string;
    teamName?: string;
  }>;
  totalCount: number;
  missingEmailCount: number;
  duplicateCount: number;
}

export type AudienceType =
  | 'ALL_TEAMS'
  | 'ALL_PARTICIPANTS'
  | 'TEAM_LEADERS'
  | 'CHECKED_IN'
  | 'NOT_CHECKED_IN'
  | 'REGISTERED'
  | 'ACTIVE'
  | 'SUBMITTED'
  | 'ROOM_SPECIFIC'
  | 'SELECTED_TEAMS';

export async function resolveAudience(
  hackathonId: string,
  audienceType: AudienceType,
  filter?: Record<string, unknown>
): Promise<AudienceResolution> {
  let teams: (Team & { participants: Participant[] })[] = [];

  const teamFilter: Record<string, unknown> = { hackathonId };

  switch (audienceType) {
    case 'ALL_TEAMS':
    case 'ALL_PARTICIPANTS':
      teams = await prisma.team.findMany({
        where: { hackathonId },
        include: { participants: true },
      }) as (Team & { participants: Participant[] })[];
      break;
    case 'TEAM_LEADERS':
      teams = await prisma.team.findMany({
        where: { hackathonId },
        include: { participants: { where: { isLeader: true } } },
      }) as (Team & { participants: Participant[] })[];
      break;
    case 'CHECKED_IN':
      teams = await prisma.team.findMany({
        where: { ...teamFilter, status: 'CHECKED_IN' },
        include: { participants: true },
      }) as (Team & { participants: Participant[] })[];
      break;
    case 'NOT_CHECKED_IN':
      teams = await prisma.team.findMany({
        where: { ...teamFilter, status: 'REGISTERED' },
        include: { participants: true },
      }) as (Team & { participants: Participant[] })[];
      break;
    case 'REGISTERED':
      teams = await prisma.team.findMany({
        where: { ...teamFilter, status: 'REGISTERED' },
        include: { participants: true },
      }) as (Team & { participants: Participant[] })[];
      break;
    case 'ACTIVE':
      teams = await prisma.team.findMany({
        where: { ...teamFilter, status: 'ACTIVE' },
        include: { participants: true },
      }) as (Team & { participants: Participant[] })[];
      break;
    case 'SUBMITTED':
      teams = await prisma.team.findMany({
        where: { ...teamFilter, status: 'SUBMITTED' },
        include: { participants: true },
      }) as (Team & { participants: Participant[] })[];
      break;
    case 'ROOM_SPECIFIC':
      if (filter?.room) {
        teams = await prisma.team.findMany({
          where: { ...teamFilter, room: filter.room as string },
          include: { participants: true },
        }) as (Team & { participants: Participant[] })[];
      }
      break;
    case 'SELECTED_TEAMS':
      if (filter?.teamIds && Array.isArray(filter.teamIds)) {
        teams = await prisma.team.findMany({
          where: { ...teamFilter, id: { in: filter.teamIds as string[] } },
          include: { participants: true },
        }) as (Team & { participants: Participant[] })[];
      }
      break;
  }

  const seenEmails = new Set<string>();
  const recipients: Array<{
    email: string;
    name: string;
    teamId?: string;
    participantId?: string;
    teamName?: string;
  }> = [];
  let missingEmailCount = 0;
  let duplicateCount = 0;

  for (const team of teams) {
    if (audienceType === 'TEAM_LEADERS') {
      const leader = team.participants.find((p) => p.isLeader);
      if (!leader?.email) { missingEmailCount++; continue; }
      const key = leader.email.toLowerCase();
      if (seenEmails.has(key)) { duplicateCount++; continue; }
      seenEmails.add(key);
      recipients.push({
        email: leader.email,
        name: leader.name,
        teamId: team.id,
        participantId: leader.id,
        teamName: team.name,
      });
    } else if (audienceType === 'ALL_TEAMS') {
      const leader = team.participants.find((p) => p.isLeader);
      if (!leader?.email) { missingEmailCount++; continue; }
      const key = leader.email.toLowerCase();
      if (seenEmails.has(key)) { duplicateCount++; continue; }
      seenEmails.add(key);
      recipients.push({
        email: leader.email,
        name: leader.name,
        teamId: team.id,
        participantId: leader.id,
        teamName: team.name,
      });
    } else {
      for (const p of team.participants) {
        if (!p.email) { missingEmailCount++; continue; }
        const key = p.email.toLowerCase();
        if (seenEmails.has(key)) { duplicateCount++; continue; }
        seenEmails.add(key);
        recipients.push({
          email: p.email,
          name: p.name,
          teamId: team.id,
          participantId: p.id,
          teamName: team.name,
        });
      }
    }
  }

  return {
    recipients,
    totalCount: recipients.length,
    missingEmailCount,
    duplicateCount,
  };
}

export function buildTemplateContext(
  hackathon: { name: string; venue?: string | null; startDate: Date },
  teamName: string,
  teamId: string | null | undefined,
  roomName: string | null | undefined,
  participantName: string,
  leaderName: string,
  leaderEmail: string,
  additional?: Record<string, string>
): TemplateContext {
  const eventDate = hackathon.startDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const eventTime = hackathon.startDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  return {
    participantName,
    teamName,
    teamId: teamId || 'NEX-000',
    leaderName,
    leaderEmail,
    hackathonName: hackathon.name,
    hackathonVenue: hackathon.venue || 'TBD',
    roomName: roomName || 'TBD',
    eventDate,
    eventTime,
    registrationId: '',
    certificateUrl: '',
    ...additional,
  };
}

export async function createCampaign(
  hackathonId: string,
  createdById: string,
  data: {
    name: string;
    subject: string;
    messageBody: string;
    bodyFormat?: string;
    audienceType: AudienceType;
    audienceFilter?: Record<string, unknown>;
    scheduledAt?: string;
  }
) {
  const audience = await resolveAudience(hackathonId, data.audienceType, data.audienceFilter);

  const campaign = await prisma.emailCampaign.create({
    data: {
      hackathonId,
      createdById,
      name: data.name,
      subject: data.subject,
      messageBody: data.messageBody,
      bodyFormat: data.bodyFormat || 'html',
      audienceType: data.audienceType,
      audienceFilter: data.audienceFilter ? JSON.parse(JSON.stringify(data.audienceFilter)) : undefined,
      status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      totalRecipients: audience.totalCount,
      pendingCount: audience.totalCount,
    },
  });

  return { campaign, audience };
}

export async function queueCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) throw new Error('Campaign not found');

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'QUEUED', startedAt: new Date() },
  });
}

export async function launchCampaign(
  hackathonId: string,
  campaignId: string,
  createdById: string
): Promise<{ campaignId: string; totalRecipients: number }> {
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: campaignId, hackathonId },
  });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    throw new Error(`Campaign is already ${campaign.status}`);
  }

  const hackathon = await prisma.hackathon.findUnique({ where: { id: hackathonId } });
  if (!hackathon) throw new Error('Hackathon not found');

  const audience = await resolveAudience(
    hackathonId,
    campaign.audienceType as AudienceType,
    (campaign.audienceFilter || undefined) as Record<string, unknown> | undefined
  );

  const recipients = audience.recipients.map((r) => {
    const leaderName = r.name;
    const teamRecord = { name: r.teamName || 'Team', teamId: null, room: null, participants: [] };
    const context = buildTemplateContext(
      hackathon,
      r.teamName || 'Team',
      null,
      null,
      r.name,
      leaderName,
      r.email,
    );
    return {
      email: r.email,
      recipientName: r.name,
      participantId: r.participantId,
      teamId: r.teamId,
      personalizedSubject: renderTemplate(campaign.subject, context),
      status: 'PENDING' as const,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'QUEUED',
        startedAt: new Date(),
        totalRecipients: recipients.length,
        pendingCount: recipients.length,
      },
    });

    for (const r of recipients) {
      await tx.emailRecipient.create({
        data: {
          campaignId,
          email: r.email,
          recipientName: r.recipientName,
          personalizedSubject: r.personalizedSubject,
          participantId: r.participantId,
          teamId: r.teamId,
        },
      }).catch((e: Error) => {
        if (!e.message.includes('Unique constraint')) throw e;
      });
    }
  });

  return { campaignId, totalRecipients: recipients.length };
}
