import puppeteer from 'puppeteer';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH;

function uploadsDir(): string {
  return path.resolve(__dirname, '../../uploads/certificates');
}

export async function generatePdf(html: string, certificateId: string): Promise<string> {
  const launchOpts: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
  if (CHROME_PATH) launchOpts.executablePath = CHROME_PATH;
  const browser = await puppeteer.launch(launchOpts);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' as any });

    const pdfPath = path.join(uploadsDir(), `${certificateId}.pdf`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return pdfPath;
  } finally {
    await browser.close();
  }
}
