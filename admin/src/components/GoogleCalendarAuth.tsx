import { useState, useEffect } from 'react'
import { useGoogleAuth } from '../hooks/useGoogleAuth'

export default function GoogleCalendarAuth() {
  const { 
    isConnected, 
    isLoading, 
    error, 
    accountEmail, 
    lastSynced,
    connect,
    disconnect,
    checkStatus 
  } = useGoogleAuth()

  useEffect(() => {
    checkStatus()
  }, [])

  if (isLoading) {
    return (
      <div className="calendar-section">
        <div className="loading">
          <div className="spinner"></div>
          <p>Checking connection status...</p>
        </div>
      </div>
    )
  }

  if (isConnected) {
    return (
      <div className="calendar-section">
        <h2>📅 Google Calendar Integration</h2>
        
        <div className="status-card connected">
          <div className="status-header">
            <span className="status-indicator success">✅</span>
            <h3>Connected</h3>
          </div>
          
          <div className="account-info">
            <p><strong>📧 Account:</strong> {accountEmail}</p>
            <p><strong>🕐 Last Synced:</strong> {lastSynced}</p>
            <p><strong>📊 Calendar:</strong> Primary Calendar</p>
          </div>
          
          <button 
            className="disconnect-btn"
            onClick={disconnect}
          >
            ❌ Disconnect
          </button>
          
          <div className="features-list">
            <h4>✅ Your voice agent can now:</h4>
            <ul>
              <li>Schedule meetings via voice commands</li>
              <li>Query upcoming events</li>
              <li>Update or cancel appointments</li>
              <li>Check availability</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="calendar-section">
      <h2>📅 Google Calendar Integration</h2>
      
      <div className="status-card">
        <div className="status-header">
          <span className="status-indicator">⚪</span>
          <h3>Not Connected</h3>
        </div>
        
        <p className="description">
          Connect your Google Calendar to enable voice-controlled event management.
        </p>
        
        {error && (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        )}
        
        <button 
          className="connect-btn"
          onClick={connect}
          disabled={isLoading}
        >
          🔗 Connect Google Calendar
        </button>
        
        <div className="permissions-info">
          <h4>📋 Required Permissions:</h4>
          <ul>
            <li>Read calendar events</li>
            <li>Create and modify events</li>
            <li>Access event attendees</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
