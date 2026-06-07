'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Rocket, History, ScrollText, Settings, Activity, PhoneCall, GitBranch } from 'lucide-react';

const navItems = [
  { href: '/',          icon: LayoutDashboard, label: 'Dashboard'       },
  { href: '/workflows', icon: GitBranch,       label: 'Workflows'       },
  { href: '/deploy',    icon: Rocket,          label: 'Deploy Contract' },
  { href: '/call',      icon: PhoneCall,       label: 'Call Contract'   },
  { href: '/history',   icon: History,         label: 'History'         },
  { href: '/logs',      icon: ScrollText,      label: 'Logs'            },
  { href: '/settings',  icon: Settings,        label: 'Settings'        },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 flex flex-col" style={{ background: '#120C2A', minHeight: '100vh', borderRight: '1px solid #2D1F4E' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #2D1F4E' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: 'linear-gradient(135deg, #6B3FA0, #8B5CF6)' }}>
          K
        </div>
        <div>
          <div className="font-semibold text-white text-sm">Kwala</div>
          <div className="text-xs" style={{ color: '#9B89C4' }}>Workflow Deployer</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={active
                ? { background: 'linear-gradient(90deg, rgba(107,63,160,0.8), rgba(107,63,160,0.4))', color: '#fff', fontWeight: 500 }
                : { color: '#9B89C4' }
              }
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#E2D9F3'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#9B89C4'; }}
            >
              {active && <div className="absolute left-0 w-0.5 h-6 rounded-r" style={{ background: '#8B5CF6' }} />}
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Status indicator */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid #2D1F4E' }}>
        <div className="flex items-center gap-2">
          <Activity size={12} style={{ color: '#34D399' }} />
          <span className="text-xs" style={{ color: '#6B5A8E' }}>System Running</span>
        </div>
        <p className="text-xs mt-1" style={{ color: '#4B3A6A' }}>Kwala Automation v1.0</p>
      </div>
    </aside>
  );
}
