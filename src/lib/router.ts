import { useEffect, useState } from 'react'

function current(): string[] {
  const path = window.location.hash.replace(/^#\/?/, '')
  return path.split('/').filter(Boolean)
}

/** Routage par ancre (#/muscu/nouvelle) : compatible GitHub Pages et bouton retour. */
export function useRoute(): string[] {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => {
      setRoute(current())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  const hash = `#/${path.replace(/^\//, '')}`
  if (options.replace) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}
