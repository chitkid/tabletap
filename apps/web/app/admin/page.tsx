import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** `/admin` is the door, not a room: the menu is the thing an admin came to change. */
export default function AdminPage(): never {
  redirect('/admin/menu');
}
