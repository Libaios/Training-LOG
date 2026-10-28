import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, requireAuth, supabase } from './lib/supabase'
import { DataProvider, useStore } from './lib/store'
import { useRoute } from './lib/router'
import { BottomNav, Loading } from './components/Layout'
import { Login, NoAccess, NotConfigured } from './screens/Login'
import { Today } from './screens/Today'
import { Plan } from './screens/Plan'
import { SessionDetail } from './screens/SessionDetail'
import { Coach } from './screens/Coach'
import { Profile } from './screens/Profile'
import { RunList } from './screens/RunList'
import { RunEditor } from './screens/RunEditor'

// Les graphiques (plus lourds) ne sont chargés qu'à l'ouverture de l'onglet Progrès.
const Progress = lazy(() => import('./screens/Progress').then((m) => ({ default: m.Progress })))
// Partie muscu et réglages, masquée pour l'instant : chargée seulement si on l'ouvre.
const WorkoutList = lazy(() => import('./screens/WorkoutList').then((m) => ({ default: m.WorkoutList })))
const WorkoutEditor = lazy(() => import('./screens/WorkoutEditor').then((m) => ({ default: m.WorkoutEditor })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))
const TemplateEditor = lazy(() => import('./screens/TemplateEditor').then((m) => ({ default: m.TemplateEditor })))

type Access = 'checking' | 'member' | 'denied'

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [access, setAccess] = useState<Access>('checking')

  useEffect(() => {
    if (!isConfigured || !requireAuth) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setAccess('checking')
    supabase
      .from('members')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        // En cas d'erreur réseau on laisse passer : les règles de la base protègent les données.
        setAccess(data || error ? 'member' : 'denied')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!isConfigured) return <NotConfigured />
  if (!requireAuth) {
    return (
      <DataProvider>
        <Routes email="" />
      </DataProvider>
    )
  }
  if (session === undefined) return <Loading />
  if (!session) return <Login />
  if (access === 'checking') return <Loading />
  if (access === 'denied') return <NoAccess email={session.user.email ?? ''} />

  return (
    <DataProvider>
      <Routes email={session.user.email ?? ''} />
    </DataProvider>
  )
}

function Routes({ email }: { email: string }) {
  const [section = '', sub, extra] = useRoute()
  const { loading, error, reload, coachNotes } = useStore()

  const editing =
    ((section === 'muscu' || section === 'course') && sub !== undefined) ||
    (section === 'reglages' && sub === 'modele') ||
    section === 'seance'

  let screen
  if (section === 'plan') {
    screen = <Plan />
  } else if (section === 'seance') {
    screen = <SessionDetail key={sub} id={sub === 'nouvelle' ? undefined : sub} />
  } else if (section === 'course') {
    screen = sub ? (
      <RunEditor key={`${sub}-${extra ?? ''}`} id={sub === 'nouvelle' ? undefined : sub} sessionId={sub === 'nouvelle' ? extra : undefined} />
    ) : (
      <RunList />
    )
  } else if (section === 'coach') {
    screen = <Coach />
  } else if (section === 'profil') {
    screen = <Profile />
  } else if (section === 'muscu') {
    screen = sub ? <WorkoutEditor key={sub} id={sub === 'nouvelle' ? undefined : sub} /> : <WorkoutList />
  } else if (section === 'progres') {
    screen = <Progress />
  } else if (section === 'reglages') {
    screen =
      sub === 'modele' ? (
        <TemplateEditor key={extra} id={extra === 'nouveau' ? undefined : extra} />
      ) : (
        <Settings email={email} />
      )
  } else {
    screen = <Today />
  }

  const navActive = section === 'seance' ? 'plan' : section
  const unread = coachNotes.filter((n) => !n.read).length

  return (
    <div className={`app${editing ? ' is-editing' : ''}`}>
      {error && (
        <div className="banner-error" role="alert">
          <span>Impossible de charger les données. {navigator.onLine ? '' : 'Pas de connexion internet.'}</span>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => void reload()}>
            Réessayer
          </button>
        </div>
      )}
      {loading ? <Loading /> : <Suspense fallback={<Loading />}>{screen}</Suspense>}
      {!editing && <BottomNav active={navActive} badge={{ path: 'coach', count: unread }} />}
    </div>
  )
}
