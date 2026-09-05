import QRCode from 'qrcode';
import { LandingContent } from '../components/landing/landing-content';
import { loadDemoLinks } from '../lib/demo-links';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'TableTap — QR ordering with a live kitchen display' };

export default async function LandingPage() {
  // The landing is the one surface that acts on *why* the links are missing: demo mode being off
  // is the plain product page, and anything else is worth saying out loud.
  const { links, notice } = await loadDemoLinks();
  const qrSvg = links
    ? await QRCode.toString(links.guest.url, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      })
    : null;
  return <LandingContent links={links} qrSvg={qrSvg} notice={notice} />;
}
