import { useEffect, useState } from 'react'
import {
  buildAppHash,
  navigateAppRoute,
  parseAppRoute,
} from '../utils/appRoutes.js'

function readRoute() {
  return parseAppRoute(window.location.hash)
}

export function useAppRoute() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute())
    }

    if (!window.location.hash) {
      window.location.replace(`${window.location.pathname}${window.location.search}#/assets`)
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(next) {
    const hash = buildAppHash(next)
    if (window.location.hash !== hash) {
      navigateAppRoute(next)
    }
    setRoute(parseAppRoute(hash))
  }

  return { route, navigate }
}
