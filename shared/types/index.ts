export type UserRole = 'SUPER_ADMIN' | 'SUB_ADMIN' | 'COORDINATOR';
export type AdminStatus = 'ACTIVE' | 'INACTIVE';
export interface AuthUser { id: string; name: string; email?: string; phone?: string; role: UserRole; token: string; }
export interface AdminUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string;
  lastActivityAt?: string;
  assignedRooms?: string;
  createdAt: string;
  assignments?: { hackathonId: string; hackathon: { id: string; name: string } }[];
}
export type HackathonStatus = 'DRAFT' | 'ACTIVE' | 'ENDED';
export type HackathonMode = 'PREDEFINED' | 'ON_SPOT';
export interface Hackathon { id: string; name: string; description?: string; startDate: string; endDate: string; status: HackathonStatus; mode: HackathonMode; venue?: string; maxTeams?: number; createdAt: string; }
export type TeamStatus = 'REGISTERED' | 'CHECKED_IN' | 'ACTIVE' | 'SUBMITTED' | 'DISQUALIFIED';
export interface Participant { id: string; name: string; email?: string; phone?: string; isLeader: boolean; }
export interface Team { id: string; hackathonId: string; name: string; status: TeamStatus; room?: string; tableNumber?: string; projectName?: string; projectUrl?: string; notes?: string; leaderPhone?: string; checkInTime?: string; submissionTime?: string; coordinatorId?: string; coordinator?: { id: string; name: string } | null; participants: Participant[]; createdAt: string; updatedAt: string; }
export type MessageChannel = 'WHATSAPP' | 'SMS' | 'INTERNAL';
export type MessageStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'PENDING';
export type CertType = 'PARTICIPATION' | 'WINNER' | 'RUNNER_UP' | 'SPECIAL';
export type CertStatus = 'PENDING' | 'GENERATING' | 'GENERATED' | 'SENT' | 'FAILED';
export interface Certificate {
  id: string;
  participantName: string;
  email: string;
  type: CertType;
  status: CertStatus;
  pdfUrl?: string;
  errorMessage?: string;
  generatedAt?: string;
  sentAt?: string;
  createdAt: string;
  teamId: string;
  team?: { id: string; name: string };
  hackathonId: string;
}
export interface CertGenerationResult {
  total: number;
  generated: number;
  emailed: number;
  failed: number;
}
export interface HackathonMetrics { totalTeams: number; checkedIn: number; checkedInPercent: number; active: number; submitted: number; missing: number; totalParticipants: number; messagesToday: number; }
