/**
 * Nouvelle version de l'appli : le service worker l'installe tout seul (autoUpdate), mais la page garde
 * l'ancienne tant qu'elle n'est pas rechargée. On la recharge quand l'appli passe en arrière-plan
 * (jamais sous les yeux du coureur, ni au milieu d'une saisie), sinon à son retour au premier plan.
 * Et on cherche une mise à jour à chaque retour au premier plan.
 */
export function watchAppUpdates() {
  if (!('serviceWorker' in navigator)) return
  // Première installation : pas d'ancienne version à remplacer.
  const hadController = !!navigator.serviceWorker.controller
  let pending = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return
    pending = true
    if (document.visibilityState === 'hidden') window.location.reload()
  })
  document.addEventListener('visibilitychange', () => {
    if (pending) {
      window.location.reload()
      return
    }
    if (document.visibilityState === 'visible') {
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.update())
        .catch(() => {})
    }
  })
}
