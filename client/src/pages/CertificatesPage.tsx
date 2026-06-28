import { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';

interface Cert {
  id: string;
  participantName: string;
  email: string;
  type: string;
  status: string;
  teamId: string;
  team: { name: string };
}

interface GenResult {
  total: number;
  generated: number;
  emailed: number;
  failed: number;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string }
> = {
  PENDING: {
    icon: <Clock className="w-4 h-4" />,
    color: 'var(--yellow)',
  },
  GENERATING: {
    icon: <Loader2 className="w-4 h-4" />,
    color: 'var(--blue)',
  },
  GENERATED: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'var(--blue)',
  },
  SENT: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'var(--green)',
  },
  FAILED: {
    icon: <XCircle className="w-4 h-4" />,
    color: 'var(--red)',
  },
};

export function CertificatesPage() {
  const { activeHackathon } = useHackathonStore();
  const { user } = useAuthStore();
  const { toast } = useUIStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [certType, setCertType] = useState<
    'PARTICIPATION' | 'WINNER' | 'RUNNER_UP' | 'SPECIAL'
  >('PARTICIPATION');

  const load = async () => {
    if (!activeHackathon) return;
    setLoading(true);
    try {
      setCerts(
        await api.get<Cert[]>(
          `/hackathons/${activeHackathon.id}/certificates`
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeHackathon?.id]);

  const stats = useMemo(() => {
    const s = { total: certs.length, generated: 0, emailed: 0, failed: 0 };
    for (const c of certs) {
      if (c.status === 'GENERATED') s.generated++;
      if (c.status === 'SENT') s.emailed++;
      if (c.status === 'FAILED') s.failed++;
    }
    return s;
  }, [certs]);

  const generate = async () => {
    if (!activeHackathon) return;
    setGenerating(true);
    try {
      const r = await api.post<GenResult>(
        `/hackathons/${activeHackathon.id}/certificates/generate`,
        { type: certType }
      );
      toast(
        `Generated ${r.generated} · Emailed ${r.emailed} · Failed ${r.failed} (${r.total} total)`,
        r.failed > 0 ? 'warning' : 'success'
      );
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const typeLabels: Record<string, string> = {
    PARTICIPATION: 'Participation',
    WINNER: 'Winner',
    RUNNER_UP: 'Runner Up',
    SPECIAL: 'Special',
  };

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-heading">Certificates</h1>
          <p className="text-caption mt-0.5">{certs.length} total</p>
        </div>
        {isAdmin && (
          <button
            className="btn btn-primary btn-sm"
            onClick={generate}
            disabled={generating}
          >
            {generating ? (
              <div className="spinner-white" style={{ width: 14, height: 14 }} />
            ) : (
              <Award className="w-3.5 h-3.5" />
            )}
            Generate
          </button>
        )}
      </div>

      {/* Stats bar */}
      {certs.length > 0 && (
        <div
          className="card p-3 mb-4 grid grid-cols-3 gap-3 text-center"
          style={{ border: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              {stats.generated}
            </p>
            <p className="text-caption">Generated</p>
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--green)' }}>
              {stats.emailed}
            </p>
            <p className="text-caption">Emailed</p>
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--red)' }}>
              {stats.failed}
            </p>
            <p className="text-caption">Failed</p>
          </div>
        </div>
      )}

      {/* Type selector */}
      {isAdmin && (
        <div
          className="card p-4 mb-5"
          style={{ border: '1px solid var(--border)' }}
        >
          <p className="text-label mb-3">Certificate type</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              ['PARTICIPATION', 'WINNER', 'RUNNER_UP', 'SPECIAL'] as const
            ).map((t) => (
              <button
                key={t}
                onClick={() => setCertType(t)}
                className="py-2.5 px-3 rounded-xl font-semibold transition-all duration-150"
                style={{
                  fontSize: 12,
                  background:
                    certType === t ? 'var(--text)' : 'var(--bg-elevated)',
                  color: certType === t ? 'var(--bg)' : 'var(--text-secondary)',
                  border:
                    certType === t
                      ? '1px solid transparent'
                      : '1px solid var(--border-strong)',
                }}
              >
                {typeLabels[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Certs list */}
      {loading ? (
        <div className="card overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3.5 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="skeleton w-4 h-4 rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-36 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : certs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Award className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-title mb-2">No certificates yet</p>
          {isAdmin && (
            <button
              className="btn btn-primary btn-sm mt-4"
              onClick={generate}
              disabled={generating}
            >
              <Award className="w-3.5 h-3.5" />
              Generate now
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {certs.slice(0, 100).map((c) => {
            const sc = STATUS_CONFIG[c.status] || STATUS_CONFIG.PENDING;
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <span style={{ color: sc.color, flexShrink: 0 }}>
                  {sc.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ fontSize: 14 }}>
                    {c.participantName}
                  </p>
                  <p className="text-caption truncate">
                    {c.team?.name} · {c.email}
                  </p>
                </div>
                <span
                  className="badge flex-shrink-0"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  {typeLabels[c.type] || c.type}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
