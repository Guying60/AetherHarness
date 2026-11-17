import { icon, type IconName } from './icons.js';

/**
 * Shared console navigation.
 *
 * Server-side only: the strings below are inlined into each page shell. Keeping
 * one definition means the workbench and the studio page can never drift.
 *
 * `route` marks same-document links; those get `data-route` (client-side
 * navigation) and `data-nav` (active-state highlighting). Links to a different
 * HTML document intentionally have neither — they are full page loads.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  route?: string;
}

export const NAV: NavItem[] = [
  { href: '/', label: '工作台', icon: 'navWorkbench', route: 'workbench' },
  { href: '/runs', label: '任务执行', icon: 'navRuns', route: 'execution' },
  { href: '/studio/agents', label: 'Agent 中心', icon: 'navAgents' },
  { href: '/teams', label: '团队', icon: 'navTeams' },
  { href: '/workflows', label: '工作流', icon: 'navWorkflows' },
  { href: '/delivery', label: '验收与交付', icon: 'navDelivery', route: 'delivery' },
  { href: '/settings', label: '系统设置', icon: 'navSettings', route: 'settings' }
];

export function navItem(item: NavItem): string {
  return '<a href="' + item.href + '"' +
    (item.route ? ' data-route data-nav="' + item.route + '"' : '') +
    '>' + icon(item.icon) + '<span>' + item.label + '</span></a>';
}

export const NAV_MARKUP = NAV.map(navItem).join('');
