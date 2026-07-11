import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { AppShell } from '@/components/layout/AppShell';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TeamsPage } from '@/pages/TeamsPage';
import { CheckInPage } from '@/pages/Checkinpage';
import { MessagesPage } from '@/pages/MessagesPage';
import { CertificatesPage } from '@/pages/CertificatesPage';
import { HackathonsPage } from '@/pages/HackathonsPage';
import { HackathonDashboardPage } from '@/pages/HackathonDashboardPage';
import { CoordinatorView } from '@/pages/CoordinatorView';
import { AdminPage } from '@/pages/AdminPage';
import { RegistrationsPage } from '@/pages/RegistrationsPage';
import { JoinPage } from '@/pages/JoinPage';
import { PublicRegisterPage } from '@/pages/PublicRegisterPage';
import { RoomsPage } from '@/pages/RoomsPage';
import { LiveOpsPage } from '@/pages/LiveOpsPage';
import { AutomationsPage } from '@/pages/AutomationsPage';
import { MilestonesPage } from '@/pages/MilestonesPage';
import { CertificateVerifyPage } from '@/pages/CertificateVerifyPage';
import { RegistrationDataHub } from '@/pages/RegistrationDataHub';
import { EmailCampaignsPage } from '@/pages/EmailCampaignsPage';
import { EmailComposerPage } from '@/pages/EmailComposerPage';
import { EmailCampaignDetailPage } from '@/pages/EmailCampaignDetailPage';
import { ReliabilityCenterPage } from '@/pages/ReliabilityCenterPage';

function Guard({ children }: { children: React.ReactNode }) {
  const auth = useAuthStore((s) => s.isAuthenticated);
  return auth ? <>{children}</> : <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/register/:slug" element={<PublicRegisterPage />} />
        <Route path="/verify/:certificateId" element={<CertificateVerifyPage />} />
        <Route
          path="/coordinator"
          element={
            <Guard>
              <CoordinatorView />
            </Guard>
          }
        />
        <Route
          path="/"
          element={
            <Guard>
              <AppShell />
            </Guard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="hackathons" element={<HackathonsPage />} />
          <Route path="hackathons/:id" element={<HackathonDashboardPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="checkin" element={<CheckInPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="registrations" element={<RegistrationsPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="operations" element={<LiveOpsPage />} />
          <Route path="automations" element={<AutomationsPage />} />
          <Route path="milestones" element={<MilestonesPage />} />
          <Route path="data-hub" element={<RegistrationDataHub />} />
          <Route path="email" element={<EmailCampaignsPage />} />
          <Route path="email/composer" element={<EmailComposerPage />} />
          <Route path="email/:id" element={<EmailCampaignDetailPage />} />
          <Route path="reliability" element={<ReliabilityCenterPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
