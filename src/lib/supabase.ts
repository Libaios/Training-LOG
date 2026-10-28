import { createClient } from '@supabase/supabase-js'
import config from '../../app.config.json'

export const isConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey)

export const supabase = createClient(
  config.supabaseUrl || 'http://localhost',
  config.supabasePublishableKey || 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'training-log-auth',
    },
  },
)

/** Message d'erreur lisible pour l'interface. */
export function errorMessage(err: unknown): string {
  if (!navigator.onLine) return 'Pas de connexion internet. Réessaie une fois connecté.'
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message)
    if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.'
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Serveur injoignable. Réessaie dans un instant.'
    if (/Password should be at least/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.'
    if (/duplicate key value.*exercises_name_unique/i.test(msg)) return 'Un exercice porte déjà ce nom.'
    return msg
  }
  return 'Une erreur inattendue est survenue.'
}
