import { useState, type FormEvent } from 'react'
import { errorMessage, supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) setError(errorMessage(err))
    setBusy(false)
  }

  return (
    <main className="login">
      <div className="login-mark" aria-hidden>
        <span className="block block-strength" />
        <span className="block block-run" />
        <span className="block block-light" />
      </div>
      <h1>Carnet d’entraînement</h1>
      <p className="muted">Muscu et course, au même endroit.</p>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}

export function NotConfigured() {
  return (
    <main className="login">
      <h1>Presque prêt</h1>
      <p className="muted">
        L’appli n’est pas encore reliée à sa base de données. Renseigne l’URL du projet et la clé publique dans
        app.config.json, puis republie.
      </p>
    </main>
  )
}

export function NoAccess({ email }: { email: string }) {
  return (
    <main className="login">
      <h1>Accès en attente</h1>
      <p className="muted">
        Le compte {email} est bien connecté, mais il n’a pas encore accès au carnet. Il doit être ajouté à la liste
        des membres dans la base.
      </p>
      <button type="button" className="btn btn-quiet btn-block" onClick={() => supabase.auth.signOut()}>
        Se déconnecter
      </button>
    </main>
  )
}
