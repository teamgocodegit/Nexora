import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Shield, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export function AuthPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'SUPER_ADMIN' | 'COORDINATOR'>('SUPER_ADMIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login', {
        name: name.trim(),
        email: email.trim(),
        role,
      });
      setAuth(res.user, res.token);
      const pending = sessionStorage.getItem('pendingInvite');
      if (pending) {
        sessionStorage.removeItem('pendingInvite');
        navigate(`/join/${pending}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: '#060606' }}
    >
      {/* Background effects */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% -10%, rgba(167,139,250,0.12) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: 300,
          background:
            'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(0,232,122,0.05) 0%, transparent 70%)',
        }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
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
          className="font-display font-bold text-white tracking-tight"
          style={{ fontSize: 15 }}
        >
          Nexora
        </span>
        <span
          className="ml-auto text-xs font-mono px-2 py-0.5 rounded"
          style={{
            background: 'rgba(0,232,122,0.1)',
            color: '#00E87A',
            border: '1px solid rgba(0,232,122,0.2)',
          }}
        >
          DEV
        </span>
      </header>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 pb-12 max-w-sm mx-auto w-full">

        {/* Heading */}
        <div className="mb-8">
          <h1
            className="font-display font-bold text-white mb-2"
            style={{ fontSize: 32, lineHeight: 1.15, letterSpacing: '-0.025em' }}
          >
            Dev Login
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            Enter your details to access the dashboard
          </p>
        </div>

        {/* Dev badge */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6 animate-fade-in"
          style={{
            background: 'var(--purple-dim)',
            border: '1px solid rgba(167,139,250,0.2)',
          }}
        >
          <Shield className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--purple)' }} />
          <div>
            <p
              style={{
                fontSize: 10,
                color: 'var(--purple)',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Development Mode
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
              No OTP required — instant access
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {/* Error */}
          {error && (
            <div
              className="px-4 py-3 rounded-xl text-sm animate-fade-in"
              style={{
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.2)',
                color: '#FCA5A5',
              }}
            >
              {error}
            </div>
          )}

          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Full name"
            className="input-dark"
          />

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Email address"
            className="input-dark"
          />

          {/* Role dropdown */}
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'SUPER_ADMIN' | 'COORDINATOR')}
              className="input-dark appearance-none"
              style={{ cursor: 'pointer' }}
            >
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="COORDINATOR">Coordinator</option>
            </select>
            <ChevronDown
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || !name.trim() || !email.trim()}
            className="w-full"
            style={{
              height: 52,
              background: loading || !name.trim() || !email.trim() ? 'rgba(255,255,255,0.06)' : 'white',
              color: loading || !name.trim() || !email.trim() ? 'rgba(255,255,255,0.3)' : '#000',
              borderRadius: 'var(--r-md)',
              border: 'none',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading || !name.trim() || !email.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {loading ? (
              <div className="spinner" style={{ width: 18, height: 18 }} />
            ) : (
              <>
                Continue <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <p
          className="mt-8 text-center"
          style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.18)', lineHeight: 1.7 }}
        >
          Temporary development authentication — No OTP required
        </p>
      </div>
    </div>
  );
}
