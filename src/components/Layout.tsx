import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { navigate } from '../lib/router'

const TABS = [
  { path: '', label: 'Aujourd’hui', icon: 'home' },
  { path: 'plan', label: 'Plan', icon: 'calendar' },
  { path: 'course', label: 'Courses', icon: 'route' },
  { path: 'coach', label: 'Coach', icon: 'message' },
  { path: 'profil', label: 'Profil', icon: 'user' },
]

export function BottomNav({ active, badge }: { active: string; badge?: { path: string; count: number } }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {TABS.map((t) => {
        const count = badge && badge.path === t.path ? badge.count : 0
        return (
          <a
            key={t.label}
            href={`#/${t.path}`}
            className={`tab tab-${t.path || 'accueil'}`}
            aria-current={active === t.path ? 'page' : undefined}
          >
            <span className="tab-icon">
              <Icon name={t.icon} />
              {count > 0 && (
                <span className="badge" aria-label={`${count} nouveau${count > 1 ? 'x' : ''}`}>
                  {count}
                </span>
              )}
            </span>
            <span>{t.label}</span>
          </a>
        )
      })}
    </nav>
  )
}

/** En-tête des écrans principaux. */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {action}
    </header>
  )
}

/** En-tête des écrans de saisie, avec retour. */
export function EditorHeader({
  title,
  backTo,
  backLabel = 'Retour',
  action,
}: {
  title: string
  backTo: string
  backLabel?: string
  action?: ReactNode
}) {
  return (
    <header className="editor-header">
      <button type="button" className="icon-text" onClick={() => navigate(backTo)}>
        <Icon name="back" size={20} />
        <span>{backLabel}</span>
      </button>
      <h1>{title}</h1>
      <div className="editor-header-action">{action}</div>
    </header>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action}
    </div>
  )
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden />
      <span>Chargement…</span>
    </div>
  )
}
