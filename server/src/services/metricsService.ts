import { prisma } from '../lib/prisma';
export const getMetrics = async (hackathonId: string) => {
  const [total, checkedIn, active, submitted, participants, messages] = await Promise.all([
    prisma.team.count({ where: { hackathonId, deletedAt: null } }),
    prisma.team.count({ where: { hackathonId, status: 'CHECKED_IN', deletedAt: null } }),
    prisma.team.count({ where: { hackathonId, status: 'ACTIVE', deletedAt: null } }),
    prisma.team.count({ where: { hackathonId, status: 'SUBMITTED', deletedAt: null } }),
    prisma.participant.count({ where: { team: { hackathonId, deletedAt: null } } }),
    prisma.message.count({ where: { hackathonId, sentAt: { gte: new Date(Date.now() - 86400000) } } }),
  ]);
  const checkedInAll = checkedIn + active + submitted;
  return { totalTeams: total, checkedIn: checkedInAll, checkedInPercent: total ? Math.round((checkedInAll / total) * 100) : 0, active, submitted, missing: total - checkedInAll, totalParticipants: participants, messagesToday: messages };
};
