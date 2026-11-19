import { icon, type IconName } from './icons.js';

/**
 * Shared console navigation.
 *
 * Server-side only: all console pages render the same sidebar and links.
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
  { href: '/studio/agents', label: '智能体中心', icon: 'navAgents' },
  { href: '/teams', label: '团队', icon: 'navTeams' },
  { href: '/workflows', label: '工作流', icon: 'navWorkflows' },
  { href: '/delivery', label: '验收与交付', icon: 'navDelivery', route: 'delivery' },
  { href: '/settings', label: '系统设置', icon: 'navSettings', route: 'settings' }
];

function navItem(item: NavItem, activePath?: string): string {
  return '<a href="' + item.href + '" title="' + item.label + '"' +
    (item.href === activePath ? ' aria-current="page"' : '') +
    (item.route ? ' data-route data-nav="' + item.route + '"' : '') +
    '>' + icon(item.icon) + '<span>' + item.label + '</span></a>';
}

export function consoleSidebar(footer = '', activePath?: string): string {
  return `<aside class="sidebar">
    <div class="sidebar-head" aria-hidden="true"></div>
    <nav aria-label="控制台导航">${NAV.map(item => navItem(item, activePath)).join('')}</nav>
    ${footer ? `<div class="sidebar-foot">${footer}</div>` : ''}
  </aside>`;
}
