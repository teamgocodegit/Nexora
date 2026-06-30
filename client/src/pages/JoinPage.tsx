import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Zap, Users, MapPin, Calendar, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/utils';

interface InviteInfo {
  hackathon: {
    id: string;
    name: string;
    description?: string;
    venue?: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  createdBy: string;
  expiresAt: string;
  requiresApproval: boolean;
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api
      .get<InviteInfo>(`/invites/${token}`)
      .then(setInfo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    if (!isAuthenticated) {
      sessionStorage.setItem('pendingInvite', token!);
      navigate('/auth');
      return;
    }
    setJoining(true);
    try {
      await api.post(`/invites/${token}/accept`);
      setJoined(true);
      setTimeout(() => navigate('/'), 2200);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#060606' }}
      >
        <div className="spinner-white" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  const statusColor = (status: string) => {
    if (status === 'ACTIVE') return 'var(--green)';
    if (status === 'ENDED') return 'var(--text-muted)';
    return 'var(--yellow)';
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: '#060606' }}
    >
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(167,139,250,0.1) 0%, transparent 65%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center gap-2.5 px-6 py-5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <span
          className="font-display font-bold text-white"
          style={{ fontSize: 15, letterSpacing: '-0.02em' }}
        >
          Nexora
        </span>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 pb-12 max-w-sm mx-auto w-full">

        {/* Joined state */}
        {joined && (
          <div className="text-center animate-scale-in">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: 'var(--green-dim)', border: '1px solid rgba(0,232,122,0.3)' }}
            >
              <CheckCircle2 className="w-9 h-9" style={{ color: 'var(--green)' }} />
            </div>
            <h1
              className="font-display font-bold text-white mb-2"
              style={{ fontSize: 28, letterSpacing: '-0.025em' }}
            >
              You're in! 🎉
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, lineHeight: 1.6 }}>
              Redirecting to your dashboard…
            </p>
            <div
              className="w-48 h-1 rounded-full overflow-hidden mx-auto mt-6"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  background: 'var(--green)',
                  animation: 'progress-load 2.2s linear forwards',
                  width: '0%',
                }}
              />
            </div>
            <style>{`@keyframes progress-load { from { width: 0% } to { width: 100% } }`}</style>
          </div>
        )}

        {/* Error state */}
        {!joined && error && (
          <div className="text-center animate-scale-in">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.25)' }}
            >
              <XCircle className="w-9 h-9" style={{ color: 'var(--red)' }} />
            </div>
            <h1
              className="font-display font-bold text-white mb-2"
              style={{ fontSize: 26, letterSpacing: '-0.025em' }}
            >
              Invalid invite
            </h1>
            <p
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}
            >
              {error}
            </p>
            <button
              onClick={() => navigate('/auth')}
              style={{
                height: 48,
                width: '100%',
                background: 'white',
                color: '#000',
                borderRadius: 'var(--r-md)',
                border: 'none',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Go to login
            </button>
          </div>
        )}

        {/* Invite info */}
        {!joined && !error && info && (
          <div className="animate-fade-in">
            {/* Inviter label */}
            <p
              className="mb-4"
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.35)',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Invited by {info.createdBy}
            </p>

            {/* Heading */}
            <h1
              className="font-display font-bold text-white mb-2"
              style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.025em' }}
            >
              Join as coordinator
            </h1>
            <p
              style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 28 }}
            >
              Accept this invite to manage teams and help run the event.
            </p>

            {/* Hackathon card */}
            <div
              className="rounded-2xl p-5 mb-5 space-y-3"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
              }}
            >
              {/* Name + status */}
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-white flex-shrink-0"
                  style={{ fontSize: 16, background: 'rgba(255,255,255,0.1)' }}
                >
                  {info.hackathon.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-display font-bold text-white"
                    style={{ fontSize: 17, letterSpacing: '-0.015em' }}
                  >
                    {info.hackathon.name}
                  </p>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: statusColor(info.hackathon.status),
                    }}
                  >
                    {info.hackathon.status}
                  </span>
                </div>
              </div>

              {info.hackathon.description && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55 }}>
                  {info.hackathon.description}
                </p>
              )}

              <div className="space-y-2 pt-1">
                {info.hackathon.venue && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
                      {info.hackathon.venue}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
                    {formatDate(info.hackathon.startDate)} — {formatDate(info.hackathon.endDate)}
                  </span>
                </div>
                {info.requiresApproval && (
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                      Requires admin approval
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Auth notice */}
            {!isAuthenticated && (
              <div
                className="px-4 py-3 rounded-xl mb-4"
                style={{
                  background: 'rgba(167,139,250,0.08)',
                  border: '1px solid rgba(167,139,250,0.2)',
                }}
              >
                <p style={{ fontSize: 13, color: 'rgba(167,139,250,0.85)', lineHeight: 1.6 }}>
                  You'll need to log in or create an account to accept this invite.
                </p>
              </div>
            )}

            {/* Accept button */}
            <button
              onClick={handleJoin}
              disabled={joining}
              style={{
                width: '100%',
                height: 52,
                background: joining ? 'rgba(0,232,122,0.2)' : 'var(--green)',
                color: joining ? 'rgba(0,232,122,0.6)' : '#000',
                borderRadius: 'var(--r-md)',
                border: 'none',
                fontSize: 15,
                fontWeight: 700,
                cursor: joining ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s',
                fontFamily: 'Syne, sans-serif',
                letterSpacing: '0.01em',
              }}
            >
              {joining ? (
                <div className="spinner-green" style={{ width: 18, height: 18 }} />
              ) : (
                <>
                  {isAuthenticated ? 'Accept invite' : 'Log in & accept'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p
              style={{
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.18)',
                marginTop: 16,
                textAlign: 'center',
              }}
            >
              Invite expires {formatDate(info.expiresAt)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
