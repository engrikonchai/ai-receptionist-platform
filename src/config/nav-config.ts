import { NavGroup } from '@/types';

/**
 * Navigation configuration
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 *
 * Auth-based RBAC has been removed for now (see `src/hooks/use-nav.ts`) —
 * every item is shown to everyone until Supabase auth ships.
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Main',
    items: [
      {
        title: 'Overview',
        url: '/dashboard/overview',
        icon: 'dashboard',
        shortcut: ['o', 'v'],
        isActive: false,
        items: []
      },
      {
        title: 'Inbox',
        url: '/dashboard/inbox',
        icon: 'chat',
        shortcut: ['i', 'n'],
        isActive: false,
        items: []
      },
      {
        title: 'Leads',
        url: '/dashboard/leads',
        icon: 'leads',
        shortcut: ['l', 'e'],
        isActive: false,
        items: []
      },
      {
        title: 'Knowledge',
        url: '/dashboard/knowledge',
        icon: 'knowledge',
        shortcut: ['k', 'n'],
        isActive: false,
        items: []
      },
      {
        title: 'Channels',
        url: '/dashboard/channels',
        icon: 'share',
        shortcut: ['c', 'h'],
        isActive: false,
        items: []
      },
      {
        title: 'Widget',
        url: '/dashboard/widget',
        icon: 'code',
        shortcut: ['w', 'i'],
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: 'Workspace',
    items: [
      {
        title: 'Team',
        url: '/dashboard/team',
        icon: 'teams',
        shortcut: ['t', 'e'],
        isActive: false,
        items: []
      },
      {
        title: 'Settings',
        url: '/dashboard/settings',
        icon: 'settings',
        shortcut: ['s', 'e'],
        isActive: false,
        items: []
      }
    ]
  }
];
