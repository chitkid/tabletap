import { ClaimTable } from '../../../components/claim-table';

export const metadata = { title: 'Your table · TableTap' };

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClaimTable token={token} />;
}
