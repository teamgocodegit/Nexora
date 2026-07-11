import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';
import {
  Send, Plus, Clock, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Search, Eye, PauseCircle, Mail,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  audienceType: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  scheduledAt: string | null;
  createdAt: string;
  completedAt: string | null;
  createdBy: { id: string; name: string };
  _count: { recipients: number };
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  DRAFT: { bg: 'var(--bg-muted)', text: 'var(--text-muted)', icon: Eye },
  SCHEDULED: { bg: 'var(--blue-dim)', text: 'var(--blue)', icon: Clock },
  QUEUED: { bg: 'var(--yellow-dim)', text: 'var(--yellow)', icon: Loader2 },
  PROCESSING: { bg: 'var(--yellow-dim)', text: 'var(--yellow)', icon: Loader2 },
  COMPLETED: { bg: 'var(--green-dim)', text: 'var(--green)', icon: CheckCircle2 },
  PARTIAL: { bg: 'var(--orange-dim)', text: 'var(--orange)', icon: AlertTriangle },
  FAILED: { bg: 'var(--red-dim)', text: 'var(--red)', icon: XCircle },
  CANCELLED: { bg: 'var(--bg-muted)', text: 'var(--text-disabled)', icon: PauseCircle },
};

export function EmailCampaignsPage() {
  const { activeHackathon } = useHackathonStore();
  const { user } = useAuthStore();
  const { toast } = useUIStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCampaigns = useCallback(async () => {
    if (!activeHackathon) return;
    setLoading(true);
    try {
      const data = await api.get<Campaign[]>(`/hackathons/${activeHackathon.id}/email`);
      setCampaigns(data);
    } catch { } finally { setLoading(false); }
  }, [activeHackathon?.id]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.subject.toLowerCase().includes(search.toLowerCase())
  );

  if (!activeHackathon) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="empty-state">
          <div className="empty-icon"><Mail className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No hackathon selected</p>
          <p className="text-caption">Select a hackathon to manage email campaigns.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="empty-state">
          <div className="empty-icon"><XCircle className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">Access restricted</p>
          <p className="text-caption">Only Super Admins can manage email campaigns.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-heading">Email Campaigns</h1>
          <p className="text-caption mt-0.5">{campaigns.length} campaigns</p>
        </div>
        <button
          onClick={() => navigate(`/email/composer`)}
          className="btn btn-primary btn-sm"
        >
          <Plus className="w-3.5 h-3.5" /> New campaign
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-disabled)' }} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className="input pl-10"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-4 w-2/3 rounded mb-2" />
              <div className="skeleton h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Send className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No campaigns yet</p>
          <p className="text-caption mb-6">Create your first email campaign</p>
          <button
            onClick={() => navigate(`/email/composer`)}
            className="btn btn-primary btn-sm"
          >
            <Plus className="w-3.5 h-3.5" /> New campaign
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.DRAFT;
            const Icon = config.icon;
            return (
              <div
                key={c.id}
                onClick={() => navigate(`/email/${c.id}`)}
                className="card card-hover p-4"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: config.bg }}
                  >
                    <Icon className="w-5 h-5" style={{ color: config.text }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold truncate" style={{ fontSize: 14 }}>{c.name}</p>
                      <span
                        className="badge text-xs"
                        style={{ background: config.bg, color: config.text, border: `1px solid ${config.text}20` }}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="text-caption truncate mb-1">{c.subject}</p>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>{c.audienceType.replace(/_/g, ' ')}</span>
                      <span>·</span>
                      <span>{c.totalRecipients} recipients</span>
                      <span>·</span>
                      <span>{formatDateTime(c.createdAt)}</span>
                      {c.createdBy && <span>· {c.createdBy.name}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {c.status === 'COMPLETED' || c.status === 'PARTIAL' || c.status === 'PROCESSING' ? (
                      <>
                        <p className="text-sm font-medium" style={{ color: 'var(--green)' }}>{c.sentCount} sent</p>
                        {c.failedCount > 0 && (
                          <p className="text-xs" style={{ color: 'var(--red)' }}>{c.failedCount} failed</p>
                        )}
                      </>
                    ) : c.status === 'SCHEDULED' && c.scheduledAt ? (
                      <p className="text-sm font-medium" style={{ color: 'var(--blue)' }}>
                        <Clock className="w-3 h-3 inline mr-1" />
                        {formatDateTime(c.scheduledAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
