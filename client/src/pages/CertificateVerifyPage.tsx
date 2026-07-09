import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Award, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { api } from '@/lib/api';

interface CertData {
  participantName: string;
  teamName: string;
  hackathonName: string;
  issueDate: string;
  status: string;
  certificateId: string;
}

export function CertificateVerifyPage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [cert, setCert] = useState<CertData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!certificateId) return;
    api.get<CertData>(`/certificates/${certificateId}/verify`)
      .then(setCert)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [certificateId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div className="card p-8 text-center max-w-md w-full">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--red-dim)' }}>
            <XCircle className="w-6 h-6" style={{ color: 'var(--red)' }} />
          </div>
          <h1 className="font-display font-bold text-xl mb-2">Certificate not found</h1>
          <p className="text-caption">This certificate could not be verified. Check the link and try again.</p>
        </div>
      </div>
    );
  }

  const isValid = cert.status === 'GENERATED' || cert.status === 'SENT';

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="card p-8 text-center max-w-md w-full">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--text)' }}>
            <Zap className="w-4 h-4" style={{ color: 'var(--bg)' }} strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold" style={{ fontSize: 15, letterSpacing: '-0.02em' }}>Nexora</span>
        </div>

        {/* Status icon */}
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 ${isValid ? 'ring-4' : ''}`}
          style={{ background: isValid ? 'var(--green-dim)' : 'var(--red-dim)', boxShadow: isValid ? '0 0 0 4px var(--green-dim)' : 'none' }}>
          {isValid ? (
            <CheckCircle2 className="w-7 h-7" style={{ color: 'var(--green)' }} />
          ) : (
            <XCircle className="w-7 h-7" style={{ color: 'var(--red)' }} />
          )}
        </div>

        <h1 className="font-display font-bold text-xl mb-1" style={{ letterSpacing: '-0.02em' }}>
          {isValid ? 'Verified Certificate' : 'Certificate Issue'}
        </h1>
        <p className="text-caption mb-6">
          {isValid
            ? 'This certificate was issued by Nexora and is authentic.'
            : `Status: ${cert.status}`}
        </p>

        <div className="space-y-3 text-left">
          <DetailRow label="Participant" value={cert.participantName} />
          <DetailRow label="Team" value={cert.teamName} />
          <DetailRow label="Event" value={cert.hackathonName} />
          <DetailRow label="Issued" value={new Date(cert.issueDate).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })} />
          <DetailRow label="Certificate ID" value={cert.certificateId} />
        </div>

        {isValid && (
          <div className="mt-6 px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            <Award className="w-4 h-4 inline mr-1.5" style={{ verticalAlign: -2 }} />
            This certificate is digitally verified
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium text-sm text-right" style={{ color: 'var(--text)', maxWidth: '60%' }}>
        {value}
      </span>
    </div>
  );
}
