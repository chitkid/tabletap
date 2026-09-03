import QRCode from 'qrcode';
import { LandingContent } from '../components/landing/landing-content';
import { fetchDemoLinks } from '../lib/demo-links';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'TableTap — QR ordering with a live kitchen display' };

export default async function LandingPage() {
  const links = await fetchDemoLinks();
  const qrSvg = links
    ? await QRCode.toString(links.guest.url, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      })
    : null;
  return <LandingContent links={links} qrSvg={qrSvg} />;
}
