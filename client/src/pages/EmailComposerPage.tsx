import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';
import {
  Send, Clock, Save, Eye, ArrowLeft, Loader2, Check,
  AlertTriangle, HelpCircle, FileText, Plus, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Template {
  name: string;
  subject: string;
  body: string;
}

interface AudienceResult {
  totalCount: number;
  missingEmailCount: number;
  duplicateCount: number;
  recipients: Array<{ email: string; name: string }>;
}

const AUDIENCE_TYPES = [
  { value: 'ALL_PARTICIPANTS', label: 'All Participants' },
  { value: 'ALL_TEAMS', label: 'All Teams (Leader only)' },
  { value: 'TEAM_LEADERS', label: 'Team Leaders' },
  { value: 'CHECKED_IN', label: 'Checked-in Teams' },
  { value: 'NOT_CHECKED_IN', label: 'Not Checked-in Teams' },
  { value: 'REGISTERED', label: 'Registered Teams' },
  { value: 'ACTIVE', label: 'Active Teams' },
  { value: 'SUBMITTED', label: 'Submitted Teams' },
  { value: 'ROOM_SPECIFIC', label: 'Teams in a Room' },
  { value: 'SELECTED_TEAMS', label: 'Selected Teams' },
];

const VARIABLES = [
  { var: '{{participant_name}}', desc: 'Recipient name' },
  { var: '{{team_name}}', desc: 'Team name' },
  { var: '{{team_id}}', desc: 'Team ID (e.g. NEX-BF24-001)' },
  { var: '{{leader_name}}', desc: 'Team leader name' },
  { var: '{{leader_email}}', desc: 'Team leader email' },
  { var: '{{hackathon_name}}', desc: 'Hackathon name' },
  { var: '{{hackathon_venue}}', desc: 'Event venue' },
  { var: '{{room_name}}', desc: 'Assigned room' },
  { var: '{{event_date}}', desc: 'Event date' },
  { var: '{{event_time}}', desc: 'Event time' },
];

export function EmailComposerPage() {
  const { activeHackathon } = useHackathonStore();
  const { toast } = useUIStore();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState('ALL_PARTICIPANTS');
  const [audience, setAudience] = useState<AudienceResult | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [showVariables, setShowVariables] = useState(false);

  useEffect(() => {
    if (!activeHackathon) return;
    api.get<Template[]>(`/hackathons/${activeHackathon.id}/email/templates/list`)
      .then(setTemplates).catch(() => {});
    api.get<Array<{ id: string; name: string }>>(`/hackathons/${activeHackathon.id}/email/rooms/list`)
      .then(setRooms).catch(() => {});
  }, [activeHackathon?.id]);

  const loadAudience = useCallback(async () => {
    if (!activeHackathon) return;
    try {
      const params = new URLSearchParams({ audienceType });
      if (selectedRoom) params.set('room', selectedRoom);
      const data = await api.get<AudienceResult>(
        `/hackathons/${activeHackathon.id}/email/audience/count?${params}`
      );
      setAudience(data);
    } catch { setAudience(null); }
  }, [activeHackathon?.id, audienceType, selectedRoom]);

  useEffect(() => { loadAudience(); }, [loadAudience]);

  const insertVariable = (v: string) => {
    setBody((prev) => prev + v);
  };

  const loadTemplate = (t: Template) => {
    setName(t.name);
    setSubject(t.subject);
    setBody(t.body);
    toast(`Template "${t.name}" loaded`, 'success');
  };

  const handleSaveDraft = async () => {
    if (!activeHackathon || !name || !subject || !body) {
      toast('Name, subject, and body are required', 'warning');
      return;
    }
    setSaving(true);
    try {
      const data = await api.post<{ id: string }>(`/hackathons/${activeHackathon.id}/email/draft`, {
        name, subject, messageBody: body, audienceType,
        audienceFilter: selectedRoom ? { room: selectedRoom } : undefined,
        scheduledAt: scheduledAt || undefined,
      });
      toast('Draft saved', 'success');
      navigate(`/email/${data.id}`);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleSendNow = async () => {
    if (!activeHackathon || !name || !subject || !body) {
      toast('Name, subject, and body are required', 'warning');
      return;
    }
    if (!audience || audience.totalCount === 0) {
      toast('No recipients found for selected audience', 'warning');
      return;
    }

    setSaving(true);
    try {
      const draft = await api.post<{ id: string }>(`/hackathons/${activeHackathon.id}/email/draft`, {
        name, subject, messageBody: body, audienceType,
        audienceFilter: selectedRoom ? { room: selectedRoom } : undefined,
      });

      setSending(true);
      await api.post(`/hackathons/${activeHackathon.id}/email/${draft.id}/send-now`);
      toast(`Campaign queued for ${audience.totalCount} recipients`, 'success');
      navigate(`/email/${draft.id}`);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSaving(false); setSending(false); }
  };

  const handleTestEmail = async () => {
    if (!activeHackathon || !testEmail || !subject || !body) {
      toast('Enter a test email, subject, and body', 'warning');
      return;
    }
    setTestSending(true);
    try {
      const result = await api.post<{ success: boolean; error?: string }>(
        `/hackathons/${activeHackathon.id}/email/test`,
        { subject, messageBody: body, testEmail, testName: 'Test User' }
      );
      if (result.success) toast('Test email sent!', 'success');
      else toast(result.error || 'Failed to send test', 'error');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setTestSending(false); }
  };

  if (!activeHackathon) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="empty-state">
          <div className="empty-icon"><Send className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No hackathon selected</p>
          <p className="text-caption">Select a hackathon to compose emails.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/email')} className="btn btn-ghost btn-icon btn-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-heading">New Email Campaign</h1>
            <p className="text-caption mt-0.5">Compose and send emails to participants</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVariables(!showVariables)}
            className="btn btn-secondary btn-sm"
          >
            <HelpCircle className="w-3.5 h-3.5" /> Variables
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="btn btn-secondary btn-sm"
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
          <button onClick={handleSaveDraft} disabled={saving} className="btn btn-ghost btn-sm">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Draft
          </button>
          <button onClick={handleSendNow} disabled={saving || sending} className="btn btn-primary btn-sm">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main composer */}
        <div className="lg:col-span-2 space-y-4">
          {/* Campaign Name */}
          <div>
            <p className="text-label mb-1.5">Campaign Name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Welcome Email"
              className="input"
            />
          </div>

          {/* Subject */}
          <div>
            <p className="text-label mb-1.5">Subject</p>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Welcome to {{hackathon_name}}!"
              className="input"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-label">Message Body (HTML)</p>
              {showVariables && (
                <div className="flex gap-1 flex-wrap">
                  {VARIABLES.slice(0, 5).map((v) => (
                    <button
                      key={v.var}
                      onClick={() => insertVariable(v.var)}
                      className="px-2 py-0.5 rounded text-xs font-mono"
                      style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(79,70,229,0.15)' }}
                      title={v.desc}
                    >
                      {v.var}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              placeholder="<p>Dear {{participant_name}},</p>..."
              className="input font-mono"
              style={{ height: 'auto', fontSize: 13, lineHeight: 1.6 }}
            />
          </div>

          {/* Test email */}
          <div className="card p-4">
            <p className="text-label mb-2">Send Test Email</p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your@email.com"
                className="input flex-1"
              />
              <button
                onClick={handleTestEmail}
                disabled={testSending || !testEmail}
                className="btn btn-secondary"
              >
                {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send test
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Templates */}
          <div className="card p-4">
            <p className="text-label mb-2">Templates</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.name}
                  onClick={() => loadTemplate(t)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <FileText className="w-3 h-3 inline mr-2" />
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Variable Reference */}
          {showVariables && (
            <div className="card p-4">
              <p className="text-label mb-2">Available Variables</p>
              <div className="space-y-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v.var}
                    onClick={() => insertVariable(v.var)}
                    className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                    style={{ background: 'var(--bg-elevated)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  >
                    <code className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{v.var}</code>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{v.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Audience */}
          <div className="card p-4">
            <p className="text-label mb-2">Audience</p>
            <select
              value={audienceType}
              onChange={(e) => setAudienceType(e.target.value)}
              className="input mb-2"
            >
              {AUDIENCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {audienceType === 'ROOM_SPECIFIC' && (
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="input mb-2"
              >
                <option value="">Select room…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            )}

            {audience && (
              <div className="mt-2 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-sm font-medium">{audience.totalCount} recipients</p>
                {audience.missingEmailCount > 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--orange)' }}>
                    ⚠ {audience.missingEmailCount} without email
                  </p>
                )}
                {audience.duplicateCount > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {audience.duplicateCount} duplicates removed
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="card p-4">
            <p className="text-label mb-2">Schedule (optional)</p>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="input"
            />
            {scheduledAt && (
              <div className="flex items-center gap-1.5 mt-2">
                <Clock className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                <p className="text-xs" style={{ color: 'var(--blue)' }}>
                  Will send on {new Date(scheduledAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="card p-4">
              <p className="text-label mb-2">Preview</p>
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Subject: {subject.replace(/\{\{(\w+)\}\}/g, '[ $1 ]')}
                </p>
                <div
                  className="text-xs prose prose-sm max-w-none"
                  style={{ color: 'var(--text)' }}
                  dangerouslySetInnerHTML={{
                    __html: body.replace(/\{\{(\w+)\}\}/g, '<span style="color:var(--accent);font-weight:600">[$1]</span>')
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
