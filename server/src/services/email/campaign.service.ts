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
  | 'SELECTED_TEAMS'
  | 'APPROVED_REGISTRATIONS'
  | 'REJECTED_REGISTRATIONS';

export async function resolveAudience(
  hackathonId: string,
  audienceType: AudienceType,
  filter?: Record<string, unknown>
): Promise<AudienceResolution> {
  let teams: (Team & { participants: Participant[] })[] = [];

  const teamFilter: Record<string, unknown> = { hackathonId, deletedAt: null };

  switch (audienceType) {
    case 'ALL_TEAMS':
    case 'ALL_PARTICIPANTS':
      teams = await prisma.team.findMany({
        where: { hackathonId, deletedAt: null },
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
    case 'APPROVED_REGISTRATIONS':
    case 'REJECTED_REGISTRATIONS': {
      const regStatus = audienceType === 'APPROVED_REGISTRATIONS' ? 'ACCEPTED' : 'REJECTED';
      const registrations = await prisma.registration.findMany({
        where: { hackathonId, status: regStatus as any },
      });
      const localRecipients: Array<{ email: string; name: string; teamId?: string; participantId?: string; teamName?: string }> = [];
      const localSeen = new Set<string>();
      let localMissing = 0;
      let localDupes = 0;
      for (const reg of registrations) {
        if (!reg.leaderEmail) { localMissing++; continue; }
        const key = reg.leaderEmail.toLowerCase();
        if (localSeen.has(key)) { localDupes++; continue; }
        localSeen.add(key);
        localRecipients.push({
          email: reg.leaderEmail,
          name: reg.leaderName,
          teamName: reg.teamName,
        });
      }
      return {
        recipients: localRecipients,
        totalCount: localRecipients.length,
        missingEmailCount: localMissing,
        duplicateCount: localDupes,
      };
    }
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

  const teamRoomMap = new Map<string, string | null>();
  if (audience.recipients.some((r) => r.teamId)) {
    const teamIds = audience.recipients.map((r) => r.teamId).filter(Boolean) as string[];
    const teams = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, room: true },
    });
    for (const t of teams) {
      teamRoomMap.set(t.id, t.room);
    }
  }

  const recipientData = audience.recipients.map((r) => {
    const roomName = r.teamId ? teamRoomMap.get(r.teamId) || null : null;
    const context = buildTemplateContext(
      hackathon,
      r.teamName || 'Team',
      null,
      roomName,
      r.name,
      r.name,
      r.email,
    );
    return {
      campaignId,
      email: r.email,
      recipientName: r.name,
      participantId: r.participantId || null,
      teamId: r.teamId || null,
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
        totalRecipients: recipientData.length,
        pendingCount: recipientData.length,
      },
    });

    await tx.emailRecipient.createMany({
      data: recipientData,
      skipDuplicates: true,
    });
  });

  return { campaignId, totalRecipients: recipientData.length };
}
