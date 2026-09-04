import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * `/admin` is the door, not a room. It opens on the day's figures: an operator opens this tool to
 * find out how the day is going, and only then goes and changes something.
 */
export default function AdminPage(): never {
  redirect('/admin/dashboard');
}
