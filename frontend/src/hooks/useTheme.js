import { useEffect, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { selectTheme, toggleTheme, setTheme as setThemeAction } from '@/store/slices/uiSlice'

export function useTheme() {
  const dispatch = useDispatch()
  const theme = useSelector(selectTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  const toggle   = useCallback(() => dispatch(toggleTheme()),       [dispatch])
  const setTheme = useCallback((t) => dispatch(setThemeAction(t)), [dispatch])

  return { theme, isDark: theme === 'dark', toggle, setTheme }
}
