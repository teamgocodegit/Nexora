import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { reconnectSocket } from '@/lib/socket';

export function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login', {
        email: email.trim(),
        password,
      });
      setAuth(res.user, res.token);
      reconnectSocket();
      const pending = sessionStorage.getItem('pendingInvite');
      if (pending) {
        sessionStorage.removeItem('pendingInvite');
        navigate(`/join/${pending}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e: any) {
      setError(e.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: '#060606' }}
    >
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
      </header>

      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 pb-12 max-w-sm mx-auto w-full">
        <div className="mb-8">
          <h1
            className="font-display font-bold text-white mb-2"
            style={{ fontSize: 32, lineHeight: 1.15, letterSpacing: '-0.025em' }}
          >
            Sign in
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            Enter your credentials to access Nexora
          </p>
        </div>

        {error && (
          <div
            className="px-4 py-3 rounded-xl text-sm animate-fade-in mb-4"
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)',
              color: '#FCA5A5',
            }}
          >
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Email address"
            className="input-dark"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Password"
              className="input-dark w-full pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'rgba(255,255,255,0.3)' }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || !email.trim() || !password}
            className="w-full"
            style={{
              height: 52,
              background: loading || !email.trim() || !password ? 'rgba(255,255,255,0.06)' : 'white',
              color: loading || !email.trim() || !password ? 'rgba(255,255,255,0.3)' : '#000',
              borderRadius: 'var(--r-md)',
              border: 'none',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading || !email.trim() || !password ? 'not-allowed' : 'pointer',
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
                Sign in <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
