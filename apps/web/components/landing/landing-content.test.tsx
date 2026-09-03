import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingContent } from './landing-content';

const links = {
  guest: { tableNumber: 7, url: 'http://localhost:3000/t/abc.def.ghi' },
  staff: [
    {
      role: 'kitchen' as const,
      email: 'kitchen@littlefurnace.demo',
      name: 'Theo Baptiste',
      password: 'tabletap-demo',
    },
    {
      role: 'admin' as const,
      email: 'admin@littlefurnace.demo',
      name: 'Mara Quinn',
      password: 'tabletap-demo',
    },
  ],
  resetsEveryMinutes: 60,
};

describe('LandingContent', () => {
  it('offers the three demo entry points and the QR code', () => {
    render(<LandingContent links={links} qrSvg="<svg role='presentation'></svg>" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TableTap');
    expect(screen.getByRole('link', { name: 'Table 7 as a guest' })).toHaveAttribute(
      'href',
      '/t/abc.def.ghi',
    );
    expect(screen.getByRole('link', { name: 'Open the kitchen display' })).toHaveAttribute(
      'href',
      '/login?demo=kitchen',
    );
    expect(screen.getByRole('link', { name: 'Open the admin' })).toHaveAttribute(
      'href',
      '/login?demo=admin',
    );
    expect(screen.getByText('QR code for table 7')).toBeInTheDocument();
    expect(screen.getByText('Demo data resets every 60 minutes.')).toBeInTheDocument();
  });
  it('degrades to a product page without demo mode', () => {
    render(<LandingContent links={null} qrSvg={null} />);
    expect(screen.queryByRole('link', { name: 'Table 7 as a guest' })).toBeNull();
    expect(screen.getByText('Scan the QR code on your table to order.')).toBeInTheDocument();
  });
});
