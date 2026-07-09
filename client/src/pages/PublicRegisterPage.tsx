import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Zap, CheckCircle2, Users, Calendar, MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface HackathonInfo {
  id: string;
  name: string;
  description?: string;
  venue?: string;
  startDate: string;
  endDate: string;
  minTeamSize: number;
  maxTeamSize: number;
}

interface RegisterResult {
  registrationId: string;
  status: string;
  teamName: string;
  message: string;
}

interface FieldError {
  field: string;
  message: string;
}

export function PublicRegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const [hackathon, setHackathon] = useState<HackathonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const [teamName, setTeamName] = useState('');
  const [college, setCollege] = useState('');
  const [city, setCity] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [leaderEmail, setLeaderEmail] = useState('');
  const [leaderPhone, setLeaderPhone] = useState('');
  const [members, setMembers] = useState([{ name: '', email: '', phone: '' }]);
  const [agreeTerms, setAgreeTerms] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api.get<HackathonInfo>(`/hackathons/slug/${slug}`)
      .then(setHackathon)
      .catch(() => setError('Hackathon not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  const addMember = () => {
    if (members.length < (hackathon?.maxTeamSize || 5) - 1) {
      setMembers([...members, { name: '', email: '', phone: '' }]);
    }
  };

  const removeMember = (idx: number) => {
    setMembers(members.filter((_, i) => i !== idx));
  };

  const updateMember = (idx: number, field: string, value: string) => {
    const updated = [...members];
    (updated[idx] as any)[field] = value;
    setMembers(updated);
  };

  const handleSubmit = async () => {
    setFieldErrors([]);
    setError('');

    if (!leaderName.trim() || !leaderEmail.trim() || !teamName.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!agreeTerms) {
      setError('You must agree to the terms and conditions.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<RegisterResult>(`/register/${slug}`, {
        teamName: teamName.trim(),
        college: college.trim() || undefined,
        city: city.trim() || undefined,
        leaderName: leaderName.trim(),
        leaderEmail: leaderEmail.trim(),
        leaderPhone: leaderPhone.trim() || undefined,
        members: members.filter((m) => m.name.trim()).map((m) => ({
          name: m.name.trim(),
          email: m.email.trim(),
          phone: m.phone.trim() || undefined,
        })),
      });
      setResult(res);
    } catch (e: any) {
      if (e.details && Array.isArray(e.details)) {
        setFieldErrors(e.details);
      }
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (error && !hackathon) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}>
            <Zap className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="text-heading mb-2">Hackathon not found</h2>
          <p className="text-caption">The event you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--green-dim)' }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--green)' }} />
          </div>
          <h2 className="text-heading mb-2">Registration submitted!</h2>
          <p className="text-caption mb-1">Team: {result.teamName}</p>
          <p className="text-caption mb-6" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>ID: {result.registrationId}</p>
          <div className="card p-4 mb-8 text-left">
            <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {result.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const remaining = (hackathon?.maxTeamSize || 5) - 1 - members.length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-lg mx-auto px-5 py-8">
        {/* Event header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--text)' }}>
              <Zap className="w-4 h-4" style={{ color: '#FFFFFF' }} strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold" style={{ fontSize: 15, letterSpacing: '-0.02em' }}>Nexora</span>
          </div>

          <h1 className="text-heading mb-2">{hackathon?.name}</h1>
          {hackathon?.description && (
            <p className="text-caption mb-4">{hackathon.description}</p>
          )}

          <div className="flex flex-wrap gap-4 mb-2">
            {hackathon?.startDate && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span className="text-caption">{formatDate(hackathon.startDate)} – {formatDate(hackathon.endDate)}</span>
              </div>
            )}
            {hackathon?.venue && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span className="text-caption">{hackathon.venue}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <span className="text-caption">{hackathon?.minTeamSize}–{hackathon?.maxTeamSize} members per team</span>
            </div>
          </div>
          <div className="divider mt-4" />
        </div>

        {/* Error banner */}
        {error && (
          <div className="card p-4 mb-6" style={{ border: '1px solid rgba(220,38,38,0.2)', background: 'var(--red-dim)' }}>
            <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
          </div>
        )}

        {/* Field errors */}
        {fieldErrors.length > 0 && (
          <div className="card p-4 mb-6" style={{ border: '1px solid rgba(220,38,38,0.2)', background: 'var(--red-dim)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--red)' }}>Please fix the following:</p>
            {fieldErrors.map((fe, i) => (
              <p key={i} className="text-xs" style={{ color: 'var(--red)', opacity: 0.8 }}>{fe.field}: {fe.message}</p>
            ))}
          </div>
        )}

        <div className="space-y-5">
          {/* Team Information */}
          <div>
            <p className="text-label mb-3">Team Information</p>
            <div className="space-y-3">
              <div>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Team name *"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={college} onChange={(e) => setCollege(e.target.value)} placeholder="College / Organization" className="input" />
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="input" />
              </div>
            </div>
          </div>

          {/* Team Leader */}
          <div>
            <p className="text-label mb-3">Team Leader</p>
            <div className="space-y-3">
              <input value={leaderName} onChange={(e) => setLeaderName(e.target.value)} placeholder="Full name *" className="input" />
              <input value={leaderEmail} onChange={(e) => setLeaderEmail(e.target.value)} type="email" placeholder="Email address *" className="input" />
              <input value={leaderPhone} onChange={(e) => setLeaderPhone(e.target.value)} type="tel" placeholder="Phone number" className="input" />
            </div>
          </div>

          {/* Team Members */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-label">Team Members</p>
              {remaining > 0 && (
                <button onClick={addMember} className="btn btn-ghost btn-sm">
                  <Users className="w-3.5 h-3.5" /> Add member
                </button>
              )}
            </div>
            <div className="space-y-3">
              {members.map((m, idx) => (
                <div key={idx} className="card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-caption font-semibold">Member {idx + 1}</span>
                    {members.length > 1 && (
                      <button onClick={() => removeMember(idx)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      value={m.name}
                      onChange={(e) => updateMember(idx, 'name', e.target.value)}
                      placeholder="Full name"
                      className="input"
                    />
                    <input
                      value={m.email}
                      onChange={(e) => updateMember(idx, 'email', e.target.value)}
                      type="email"
                      placeholder="Email address"
                      className="input"
                    />
                    <input
                      value={m.phone}
                      onChange={(e) => updateMember(idx, 'phone', e.target.value)}
                      type="tel"
                      placeholder="Phone (optional)"
                      className="input"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Terms */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-caption">
              I confirm that all information provided is accurate and agree to the event's terms and conditions.
            </span>
          </label>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full btn btn-primary btn-lg"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Submit registration <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
