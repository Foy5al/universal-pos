export interface NavLink {
  href: string;
  label: string;
}

export const navLinks: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/pos', label: 'Sell' },
  { href: '/catalog', label: 'Products' },
  { href: '/inventory', label: 'Stock' },
  { href: '/purchasing', label: 'Purchasing' },
  { href: '/reports', label: 'Reports' },
  { href: '/admin', label: 'Team' },
  { href: '/settings', label: 'Settings' },
];

export const hiddenRoutes = new Set(['/pos', '/login']);

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
