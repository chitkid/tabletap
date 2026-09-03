'use client';
import { Button } from '@tabletap/ui';
import { authClient } from '../../lib/auth-client';

function goToLogin() {
  // A full document load rather than a router push, which is what the lint rule below assumes:
  // the session cookie the server components read has just been destroyed, and the router's
  // cache still holds pages rendered for it.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/login');
}

export function SignOutButton() {
  return (
    <Button type="button" variant="ghost" onClick={() => void authClient.signOut().then(goToLogin)}>
      Sign out
    </Button>
  );
}
