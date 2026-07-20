import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Flame, LayoutDashboard, Kanban, FileText, Download, Users, ScrollText, Settings, LogOut, MapPin, Truck, RefreshCw, Paintbrush, ClipboardList, BarChart3, Settings2, Terminal, Car, UserCheck, Menu, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useBrandStore } from '../../store/brandStore';
import { authApi } from '../../api';
import { ROLE_LABELS, cn } from '../../utils';

export default function Layout() {
  const { user, clearAuth, hasRole } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useBrandStore();
  const { colors, logos, appName, appSubtitle, features } = settings;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Drawer bei Seitenwechsel automatisch schließen (Tablet/Handy)
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => { clearAuth(); navigate('/login'); }
  });

  const isFilialen = hasRole('filialen');
  const canMelden = hasRole('filialen', 'administrator') || user?.lagerMelden?.aktiv;
  const canLesen  = hasRole('lagerist', 'administrator') || user?.lagerLesen?.aktiv;

  const navGroups = [
    !isFilialen && {
      label: 'Disposition',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/kanban', label: 'Kanban-Board', icon: Kanban },
        { to: '/lieferscheine', label: 'Lieferscheine', icon: FileText },
        ...(features?.showMapView !== false ? [{ to: '/karte', label: 'Kartenansicht', icon: MapPin }] : []),
        ...(features?.showTourPlanning !== false && hasRole('administrator','disponent') ? [{ to: '/touren', label: 'Tourenplanung', icon: Truck }] : []),
      ]
    },
    (canMelden || canLesen) && {
      label: 'Lagerbestand',
      items: [
        ...(canMelden ? [{ to: '/lager/melden', label: 'Bestand melden', icon: ClipboardList }] : []),
        ...(canLesen  ? [{ to: '/lager/uebersicht', label: 'Übersicht', icon: BarChart3 }] : []),
        ...(hasRole('administrator') ? [{ to: '/lager/produkte', label: 'Produkte verwalten', icon: Settings2 }] : []),
      ]
    },
    !isFilialen && {
      label: 'Verwaltung',
      items: [
        ...(hasRole('administrator','disponent') ? [{ to: '/import', label: 'Import', icon: Download }] : []),
        ...(features?.showAutoImport !== false && hasRole('administrator','disponent') ? [{ to: '/auto-import', label: 'Auto-Import', icon: RefreshCw }] : []),
        ...(features?.showAuditLog !== false && hasRole('administrator','disponent') ? [{ to: '/audit', label: 'Audit-Log', icon: ScrollText }] : []),
        ...(hasRole('administrator') ? [{ to: '/benutzer', label: 'Benutzer', icon: Users }] : []),
        ...(hasRole('administrator') ? [{ to: '/whitelabel', label: 'Whitelabel', icon: Paintbrush }] : []),
        ...(hasRole('administrator') ? [{ to: '/fahrzeuge', label: 'Fahrzeuge', icon: Car }] : []),
        ...(hasRole('administrator') ? [{ to: '/fahrer', label: 'Fahrer', icon: UserCheck }] : []),
        ...(hasRole('administrator') ? [{ to: '/api-tester', label: 'API Tester', icon: Terminal }] : []),
        { to: '/einstellungen', label: 'Einstellungen', icon: Settings },
      ]
    },
  ].filter(g => g && g.items.length > 0) as { label: string; items: { to: string; label: string; icon: any }[] }[];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fb' }}>
      {/* Mobile/Tablet Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={cn(
        'w-72 lg:w-60 flex-shrink-0 flex flex-col fixed lg:static inset-y-0 left-0 z-50 transition-transform duration-200 ease-out safe-top safe-bottom',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )} style={{ background: colors.sidebar }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {logos.sidebar ? (
            <img src={logos.sidebar} alt={appName} className="h-8 w-auto object-contain max-w-[140px]" />
          ) : (
            <>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: colors.primary }}>
                <Flame className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-bold text-sm leading-tight text-white">{appName}</div>
                <div className="text-xs" style={{ color: colors.sidebarText }}>{appSubtitle}</div>
              </div>
            </>
          )}
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto p-1.5 rounded-lg lg:hidden"
            style={{ color: colors.sidebarText }}
            aria-label="Menü schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-4">
          {navGroups.map(group => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.sidebarText + '80' }}>
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) =>
                    cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                      isActive ? 'text-white' : 'hover:text-white')
                  } style={({ isActive }) => ({
                    background: isActive ? colors.sidebarActive : 'transparent',
                    color: isActive ? 'white' : colors.sidebarText,
                    boxShadow: isActive ? `0 4px 12px ${colors.sidebarActive}30` : 'none',
                  })}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: colors.primary }}>
              <span className="text-white text-xs font-bold">{user?.name?.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{user?.name}</div>
              <div className="text-xs" style={{ color: colors.sidebarText }}>{ROLE_LABELS[user?.role||'']}</div>
            </div>
            <button onClick={() => logoutMutation.mutate()} className="p-1.5 rounded-lg transition-all" style={{ color: colors.sidebarText }} title="Abmelden">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile/Tablet Top-Bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 safe-top flex-shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Menü öffnen"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {logos.sidebar ? (
              <img src={logos.sidebar} alt={appName} className="h-6 w-auto object-contain max-w-[120px]" />
            ) : (
              <>
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: colors.primary }}>
                  <Flame className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-sm text-slate-800 truncate">{appName}</span>
              </>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-auto safe-bottom safe-left safe-right"><Outlet /></main>
      </div>
    </div>
  );
}
