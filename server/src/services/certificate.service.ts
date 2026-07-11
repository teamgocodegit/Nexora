import { prisma } from '../lib/prisma';
import type { CertType } from '@prisma/client';
import QRCode from 'qrcode';
import { renderCertificateTemplate } from './certificateTemplate';
import { generatePdf } from './pdf.service';
import { sendCertificateEmail } from './email.service';
export interface CertGenerationResult {
  total: number;
  generated: number;
  emailed: number;
  failed: number;
}

const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`;

export async function generateCertificates(
  hackathonId: string,
  type: CertType,
  teamIds?: string[],
): Promise<CertGenerationResult> {
  const teams = await prisma.team.findMany({
    where: teamIds ? { hackathonId, id: { in: teamIds }, deletedAt: null } : { hackathonId, deletedAt: null },
    include: { participants: true },
  });

  const hackathon = await prisma.hackathon.findUnique({ where: { id: hackathonId } });
  const hackathonName = hackathon?.name || 'Hackathon';

  const result: CertGenerationResult = { total: 0, generated: 0, emailed: 0, failed: 0 };

  for (const team of teams) {
    for (const p of team.participants) {
      if (!p.email) continue;
      result.total++;

      const certId = `cert-${team.id}-${p.id}`;
      const issueDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      try {
        await prisma.certificate.upsert({
          where: { id: certId },
          update: { status: 'GENERATING', type },
          create: {
            id: certId, hackathonId, teamId: team.id,
            participantName: p.name, email: p.email, type, status: 'GENERATING',
          },
        });

        const verifyUrl = `${APP_URL}/api/certificates/${certId}/verify`;
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 200, margin: 1 });

        const html = renderCertificateTemplate({
          participantName: p.name,
          teamName: team.name,
          hackathonName,
          certificateType: type,
          issueDate,
          certificateId: certId,
          qrDataUrl,
        });

        const pdfPath = await generatePdf(html, certId);
        const pdfUrl = `/uploads/certificates/${certId}.pdf`;

        await prisma.certificate.update({
          where: { id: certId },
          data: { status: 'GENERATED', pdfUrl, generatedAt: new Date() },
        });
        result.generated++;

        const emailResult = await sendCertificateEmail(
          p.email, p.name, pdfPath, certId, type,
        );

        if (emailResult.skipped) {
          // email skipped (dev mode — no RESEND_API_KEY)
        } else if (emailResult.success) {
          await prisma.certificate.update({
            where: { id: certId },
            data: { status: 'SENT', sentAt: new Date() },
          });
          result.emailed++;
        } else {
          await prisma.certificate.update({
            where: { id: certId },
            data: { status: 'FAILED', errorMessage: emailResult.error },
          });
          result.failed++;
        }
      } catch (err: any) {
        await prisma.certificate.update({
          where: { id: certId },
          data: { status: 'FAILED', errorMessage: err.message },
        });
        result.failed++;
      }
    }
  }

  return result;
}
