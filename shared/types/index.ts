export type UserRole = 'SUPER_ADMIN' | 'SUB_ADMIN';

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  token: string;
}

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

export interface Hackathon {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: HackathonStatus;
  mode: HackathonMode;
  venue?: string;
  maxTeams?: number;
  slug?: string;
  registrationOpen?: string;
  registrationDeadline?: string;
  minTeamSize: number;
  maxTeamSize: number;
  approvalRequired: boolean;
  waitlistEnabled: boolean;
  createdAt: string;
}

export type TeamStatus = 'REGISTERED' | 'CHECKED_IN' | 'ACTIVE' | 'SUBMITTED' | 'DISQUALIFIED';

export interface Participant {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isLeader: boolean;
}

export interface Team {
  id: string;
  hackathonId: string;
  teamId?: string;
  qrToken?: string;
  name: string;
  status: TeamStatus;
  room?: string;
  roomId?: string;
  tableNumber?: string;
  projectName?: string;
  projectUrl?: string;
  notes?: string;
  leaderPhone?: string;
  checkInTime?: string;
  checkInBy?: string;
  submissionTime?: string;
  coordinatorId?: string;
  coordinator?: { id: string; name: string } | null;
  participants: Participant[];
  createdAt: string;
  updatedAt: string;
}

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

export interface HackathonMetrics {
  totalTeams: number;
  checkedIn: number;
  checkedInPercent: number;
  active: number;
  submitted: number;
  missing: number;
  totalParticipants: number;
  messagesToday: number;
}

export type RegistrationStatus = 'PENDING_APPROVAL' | 'ACCEPTED' | 'WAITLISTED' | 'REJECTED';

export interface Registration {
  id: string;
  registrationId: string;
  status: RegistrationStatus;
  teamName: string;
  college?: string;
  city?: string;
  leaderName: string;
  leaderEmail: string;
  leaderPhone?: string;
  memberData?: any;
  gitHubUrl?: string;
  linkedInUrl?: string;
  portfolioUrl?: string;
  dietary?: string;
  accessibility?: string;
  notes?: string;
  hackathonId: string;
  createdAt: string;
  updatedAt: string;
}

export type RoomStatusType = 'ACTIVE' | 'FULL' | 'CLOSED' | 'ARCHIVED';

export interface Room {
  id: string;
  name: string;
  code?: string;
  description?: string;
  building?: string;
  floor?: string;
  capacityTeams?: number;
  capacityPeople?: number;
  capacity: number;
  notes?: string;
  sortOrder: number;
  status: RoomStatusType;
  hackathonId: string;
  createdAt: string;
  updatedAt: string;
  currentTeams?: number;
  currentPeople?: number;
}

export interface RoomCard {
  id: string;
  name: string;
  code: string | null;
  building: string | null;
  floor: string | null;
  status: string;
  capacityTeams: number | null;
  capacityPeople: number | null;
  currentTeams: number;
  currentPeople: number;
  remainingTeamCapacity: number | null;
  remainingPeopleCapacity: number | null;
  sortOrder: number;
}

export interface OpsDashboardMetrics {
  totalTeams: number;
  checkedIn: number;
  notArrived: number;
  assigned: number;
  unassigned: number;
  totalParticipants: number;
  activeRooms: number;
  fullRooms: number;
  closedRooms: number;
  nearlyFullRooms: number;
  capacityOverrides: number;
  checkedInNoRoom: number;
}

export interface ExceptionItem {
  type: 'INFO' | 'WARNING' | 'CRITICAL';
  category: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  explanation: string;
  suggestedAction: string;
}

export type AutomationTriggerType = 'TIME_BASED' | 'EVENT_TRIGGERED';
export type AutomationStatusEnum = 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Automation {
  id: string;
  name: string;
  description?: string;
  triggerType: AutomationTriggerType;
  triggerConfig?: any;
  recipientGroup?: string;
  template?: string;
  templateSubject?: string;
  status: AutomationStatusEnum;
  scheduledTime?: string;
  lastExecutedAt?: string;
  hackathonId: string;
  createdById: string;
  createdAt: string;
}

export interface EventMilestone {
  id: string;
  title: string;
  time: string;
  description?: string;
  hackathonId: string;
}
