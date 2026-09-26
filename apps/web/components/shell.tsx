'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    settings: <><path d="m9 3-1 3-3 1v4l-2 1 2 2v4l3 1 1 2h5l1-2 3-1v-4l2-2-2-1V7l-3-1-1-3Z"/><circle cx="11.5" cy="12" r="3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>, document: <><path d="M14 3H5v18h14V8Z M14 3v5h5M8 12h8M8 16h6"/></>,
    check: <path d="m5 12 4 4L19 6"/>, layers: <><path d="m12 3 9 5-9 5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.document}</svg>;
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [provider,setProvider]=useState('fixture');
  useEffect(()=>{fetch('/api/v1/settings').then(r=>r.json()).then(s=>setProvider(s.generator_mode||'fixture')).catch(()=>{});},[]);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar">
    <Link className="brand" href="/projects"><span className="brand-mark"><Icon name="layers" size={23}/></span><span>TestPilot<span className="brand-ai"> AI</span></span></Link>
    <div className="workspace-switch"><span className="workspace-avatar">D</span><div><strong>Demo workspace</strong><small>Personal workspace</small></div><span className="muted">⌄</span></div>
    <div className="nav-label">WORKSPACE</div><nav aria-label="Main navigation"><Link className={`nav-item ${path.startsWith('/projects') ? 'active' : ''}`} href="/projects"><Icon name="grid"/>Projects</Link><Link className={`nav-item ${path === '/settings' ? 'active' : ''}`} href="/settings"><Icon name="settings"/>Settings</Link></nav>
    <div className="sidebar-bottom"><div className="demo-note"><span className="status-dot"/><strong>{provider==='fixture'?'Demo generation':'External generation'}</strong><p>{provider==='fixture'?'Explore the full workflow. No AI key required.':'Connected model provider. Human review required.'}</p></div><div className="user-profile"><span className="avatar">DT</span><div><strong>Demo Tester</strong><small>Workspace member</small></div></div></div>
  </aside><div className="main-shell"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{path === '/settings' ? 'Settings' : 'Projects'}</strong></div><span className="environment-label"><span className="status-dot"/>Local prototype</span></header><main id="main-content" className="main-content">{children}</main><footer className="app-footer">Designed for thoughtful review. Generated content always needs human approval.<span>TestPilot AI · Prototype</span></footer></div></div>;
}

