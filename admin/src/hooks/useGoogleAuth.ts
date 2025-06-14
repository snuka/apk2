import { useState, useCallback } from 'react'

interface GoogleAuthState {
  isConnected: boolean
  isLoading: boolean
  error: string | null
  accountEmail: string | null
  lastSynced: string | null
}

export function useGoogleAuth() {
  const [state, setState] = useState<GoogleAuthState>({
    isConnected: false,
    isLoading: false,
    error: null,
    accountEmail: null,
    lastSynced: null
  })

  const checkStatus = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }))
    try {
      const response = await fetch('/api/auth/google/status')
      const data = await response.json()
      
      setState({
        isConnected: data.isConnected,
        isLoading: false,
        error: null,
        accountEmail: data.email || null,
        lastSynced: data.lastSynced || null
      })
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to check connection status'
      }))
    }
  }, [])

  const connect = useCallback(async () => {
    try {
      // Generate CSRF token
      const csrfToken = generateCSRFToken()
      sessionStorage.setItem('oauth_csrf', csrfToken)
      
      // Redirect to OAuth flow
      window.location.href = `/api/auth/google/init?state=${csrfToken}`
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to initiate connection'
      }))
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (!confirm('Are you sure you want to disconnect your Google Calendar?')) {
      return
    }

    setState(prev => ({ ...prev, isLoading: true }))
    try {
      const response = await fetch('/api/auth/google/disconnect', {
        method: 'POST'
      })
      
      if (response.ok) {
        setState({
          isConnected: false,
          isLoading: false,
          error: null,
          accountEmail: null,
          lastSynced: null
        })
      } else {
        throw new Error('Failed to disconnect')
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to disconnect calendar'
      }))
    }
  }, [])

  return {
    ...state,
    connect,
    disconnect,
    checkStatus
  }
}

function generateCSRFToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}
