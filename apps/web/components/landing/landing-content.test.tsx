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
  payments: { provider: 'demo' as const, testCard: null },
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
  it('offers Simulate rush and the live board copy in demo mode', () => {
    render(<LandingContent links={links} qrSvg="<svg />" />);
    expect(screen.getByRole('button', { name: 'Simulate rush' })).toBeInTheDocument();
    expect(screen.getByText(/Opens the live board signed in as kitchen staff/)).toBeInTheDocument();
  });
  it('hides Simulate rush without demo mode', () => {
    render(<LandingContent links={null} qrSvg={null} />);
    expect(screen.queryByRole('button', { name: 'Simulate rush' })).toBeNull();
  });
  it('says payment takes no card when the demo provider is live', () => {
    render(<LandingContent links={links} qrSvg="<svg />" />);
    expect(screen.getByText('Payments run in demo mode: no card, no money.')).toBeInTheDocument();
  });
  it('hands over the test card when Stripe is configured', () => {
    render(
      <LandingContent
        links={{
          ...links,
          payments: { provider: 'stripe' as const, testCard: '4242 4242 4242 4242' },
        }}
        qrSvg="<svg />"
      />,
    );
    expect(
      screen.getByText(
        'Payments run in Stripe test mode. Card 4242 4242 4242 4242, any future date, any CVC.',
      ),
    ).toBeInTheDocument();
  });
});
