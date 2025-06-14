import { useState } from 'react'
import VoiceSettings from './components/VoiceSettings'
import GoogleCalendarAuth from './components/GoogleCalendarAuth'

function App() {
  const [activeTab, setActiveTab] = useState<'voice' | 'calendar'>('voice')

  return (
    <div className="container">
      <header>
        <h1>🎯 AlwaysPickup-Lite Admin</h1>
        <p>Manage your AI voice agent settings and integrations.</p>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'voice' ? 'active' : ''}`}
          onClick={() => setActiveTab('voice')}
        >
          🎤 Voice Settings
        </button>
        <button 
          className={`tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          📅 Google Calendar
        </button>
      </div>

      <main>
        {activeTab === 'voice' ? <VoiceSettings /> : <GoogleCalendarAuth />}
      </main>

      <footer>
        <div className="status-info">
          <h3>🔧 How it works:</h3>
          <ol>
            <li>Edit your prompt and select a voice</li>
            <li>Click "Save Settings" to update</li>
            <li>Call your Twilio number to test</li>
            <li>The AI will use your settings</li>
          </ol>
        </div>
        
        <div className="links">
          <a href="/" target="_blank" rel="noopener">📞 Test Call</a>
          <a href="https://github.com/your-org/alwayspickup-lite" target="_blank" rel="noopener">📚 Documentation</a>
        </div>
      </footer>
    </div>
  )
}

export default App
