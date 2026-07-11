import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useHackathonStore } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import {
  ArrowLeft, Send, Clock, XCircle, CheckCircle2, AlertTriangle,
  Loader2, Mail, Users, Eye, PauseCircle, RefreshCw,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';

interface CampaignDetail {
  campaign: {
    id: string;
    name: string;
    subject: string;
    messageBody: string;
    status: string;
    audienceType: string;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    pendingCount: number;
    processingCount: number;
    cancelledCount: number;
    scheduledAt: string | null;
    createdAt: string;
    completedAt: string | null;
    createdBy: { id: string; name: string };
  };
  recipients: Array<{
    id: string;
    email: string;
    recipientName: string | null;
    status: string;
    attemptCount: number;
    lastError: string | null;
    sentAt: string | null;
    failedAt: string | null;
    providerMessageId: string | null;
  }>;
  totalRecipients: number;
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

const RECIPIENT_STATUS_CONFIG: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  PENDING: { bg: 'var(--bg-muted)', text: 'var(--text-muted)', icon: Clock },
  PROCESSING: { bg: 'var(--yellow-dim)', text: 'var(--yellow)', icon: Loader2 },
  SENT: { bg: 'var(--green-dim)', text: 'var(--green)', icon: CheckCircle2 },
  RETRYING: { bg: 'var(--orange-dim)', text: 'var(--orange)', icon: AlertTriangle },
  FAILED: { bg: 'var(--red-dim)', text: 'var(--red)', icon: XCircle },
  CANCELLED: { bg: 'var(--bg-muted)', text: 'var(--text-disabled)', icon: PauseCircle },
};

export function EmailCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeHackathon } = useHackathonStore();
  const { toast } = useUIStore();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!activeHackathon || !id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.get<CampaignDetail>(
        `/hackathons/${activeHackathon.id}/email/${id}?${params}`
      );
      setDetail(data);
    } catch { } finally { setLoading(false); }
  }, [activeHackathon?.id, id, statusFilter]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  useEffect(() => {
    if (!activeHackathon) return;
    const socket = getSocket();
    const handler = () => fetchDetail();
    socket.on('campaign:progress', handler);
    return () => { socket.off('campaign:progress', handler); };
  }, [activeHackathon?.id]);

  const handleAction = async (action: 'send-now' | 'cancel') => {
    if (!activeHackathon || !id) return;
    setActionLoading(true);
    try {
      await api.post(`/hackathons/${activeHackathon.id}/email/${id}/${action}`);
      toast(action === 'send-now' ? 'Campaign launched!' : 'Campaign cancelled', 'success');
      fetchDetail();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setActionLoading(false); }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="skeleton h-8 w-48 rounded mb-4" />
        <div className="skeleton h-32 w-full rounded" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="empty-state">
          <div className="empty-icon"><Mail className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">Campaign not found</p>
        </div>
      </div>
    );
  }

  const { campaign, recipients } = detail;
  const config = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.DRAFT;
  const Icon = config.icon;
  const total = campaign.totalRecipients;
  const progress = total > 0 ? Math.round(((campaign.sentCount + campaign.failedCount) / total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => navigate('/email')} className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Back to campaigns
        </button>
        <div className="flex items-center gap-2">
          <button onClick={fetchDetail} className="btn btn-secondary btn-icon btn-sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
            <>
              <button
                onClick={() => handleAction('send-now')}
                disabled={actionLoading}
                className="btn btn-primary btn-sm"
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send now
              </button>
              <button
                onClick={() => handleAction('cancel')}
                disabled={actionLoading}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red)' }}
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </button>
            </>
          )}
          {campaign.status === 'QUEUED' || campaign.status === 'PROCESSING' ? (
            <button
              onClick={() => handleAction('cancel')}
              disabled={actionLoading}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)' }}
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel remaining
            </button>
          ) : null}
        </div>
      </div>

      {/* Campaign header */}
      <div className="card p-5 mb-5">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: config.bg }}
          >
            <Icon className="w-6 h-6" style={{ color: config.text }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-heading">{campaign.name}</h1>
              <span
                className="badge"
                style={{ background: config.bg, color: config.text, border: `1px solid ${config.text}20` }}
              >
                {campaign.status}
              </span>
            </div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{campaign.subject}</p>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{campaign.audienceType.replace(/_/g, ' ')}</span>
              <span>·</span>
              <span>Created by {campaign.createdBy?.name}</span>
              <span>·</span>
              <span>{formatDateTime(campaign.createdAt)}</span>
              {campaign.scheduledAt && (
                <>
                  <span>·</span>
                  <span>Scheduled: {formatDateTime(campaign.scheduledAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      {['QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL'].includes(campaign.status) && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label">Delivery Progress</p>
            <p className="text-sm font-medium">{progress}%</p>
          </div>
          <div className="progress-track mb-4">
            <div
              className="progress-fill"
              style={{
                width: `${progress}%`,
                background: campaign.failedCount > 0 ? 'var(--orange)' : 'var(--green)',
              }}
            />
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="metric-num-sm" style={{ color: 'var(--green)' }}>{campaign.sentCount}</p>
              <p className="text-caption">Sent</p>
            </div>
            <div>
              <p className="metric-num-sm" style={{ color: 'var(--red)' }}>{campaign.failedCount}</p>
              <p className="text-caption">Failed</p>
            </div>
            <div>
              <p className="metric-num-sm" style={{ color: 'var(--yellow)' }}>{campaign.pendingCount + campaign.processingCount}</p>
              <p className="text-caption">Pending</p>
            </div>
            <div>
              <p className="metric-num-sm" style={{ color: 'var(--text)' }}>{total}</p>
              <p className="text-caption">Total</p>
            </div>
          </div>
        </div>
      )}

      {/* Recipient filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none">
        {['', 'PENDING', 'SENT', 'FAILED', 'RETRYING', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn('filter-chip', statusFilter === s && 'active')}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Message body */}
      <div className="card p-4 mb-5">
        <p className="text-label mb-2">Message</p>
        <div
          className="p-4 rounded-xl text-sm prose prose-sm max-w-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text)' }}
          dangerouslySetInnerHTML={{ __html: campaign.messageBody }}
        />
      </div>

      {/* Recipients */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
          <p className="text-label">Recipients ({recipients.length} shown)</p>
        </div>
        {recipients.length === 0 ? (
          <div className="p-6 text-center text-caption">No recipients</div>
        ) : (
          recipients.map((r) => {
            const rConfig = RECIPIENT_STATUS_CONFIG[r.status] || RECIPIENT_STATUS_CONFIG.PENDING;
            const RIcon = rConfig.icon;
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <RIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rConfig.text }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{r.recipientName || r.email}</p>
                  <p className="text-caption truncate">{r.email}</p>
                </div>
                <span
                  className="badge text-xs"
                  style={{ background: rConfig.bg, color: rConfig.text }}
                >
                  {r.status}
                </span>
                {r.attemptCount > 1 && (
                  <span className="text-caption">{r.attemptCount} attempts</span>
                )}
                {r.lastError && (
                  <span className="text-xs max-w-48 truncate" style={{ color: 'var(--red)' }} title={r.lastError}>
                    {r.lastError}
                  </span>
                )}
                {r.sentAt && (
                  <span className="text-caption whitespace-nowrap">{formatDateTime(r.sentAt)}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
