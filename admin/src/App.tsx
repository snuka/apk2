import { useState, useEffect } from 'react'

// Available OpenAI Realtime API voices
const VOICE_OPTIONS = [
  { value: 'alloy', label: 'Alloy', description: 'Neutral and balanced' },
  { value: 'ash', label: 'Ash', description: 'Warm and conversational' },
  { value: 'ballad', label: 'Ballad', description: 'Expressive and emotive' },
  { value: 'coral', label: 'Coral', description: 'Professional and clear' },
  { value: 'echo', label: 'Echo', description: 'Smooth and refined' },
  { value: 'sage', label: 'Sage', description: 'Authoritative and wise' },
  { value: 'shimmer', label: 'Shimmer', description: 'Energetic and friendly' },
  { value: 'verse', label: 'Verse', description: 'Creative and dynamic' }
]

function App() {
  const [prompt, setPrompt] = useState('')
  const [voice, setVoice] = useState('alloy')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  // Load current prompt and voice on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/prompt')
        if (response.ok) {
          const data = await response.json()
          setPrompt(data.instruction || 'You are a helpful assistant answering phone calls. Be concise, friendly, and professional.')
          setVoice(data.voice || 'alloy')
        }
      } catch (error) {
        // Use defaults if loading fails
        setPrompt('You are a helpful assistant answering phone calls. Be concise, friendly, and professional.')
        setVoice('alloy')
      }
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    if (!prompt.trim()) {
      setMessage('Please enter a prompt before saving.')
      setIsError(true)
      return
    }

    setIsLoading(true)
    setMessage('')
    setIsError(false)

    try {
      const response = await fetch('/api/prompt', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instruction: prompt.trim(),
          voice: voice
        })
      })

      const data = await response.json() as { error?: string; message?: string }

      if (response.ok) {
        setMessage('✅ Settings saved successfully! Changes will take effect on the next call.')
        setIsError(false)
      } else {
        setMessage(`❌ Error: ${data.error || 'Failed to save settings'}`)
        setIsError(true)
      }
    } catch (error) {
      setMessage('❌ Network error: Could not save prompt')
      setIsError(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      handleSave()
    }
  }

  return (
    <div className="container">
      <header>
        <h1>🎯 AlwaysPickup-Lite Admin</h1>
        <p>Customize your AI voice agent's prompt and voice. Changes take effect on the next call.</p>
      </header>

      <main>
        <div className="form-group">
          <label htmlFor="prompt">
            Voice Agent Prompt
            <span className="hint">Tell your AI how to respond to callers</span>
          </label>
          
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your AI agent's instructions here..."
            rows={10}
            maxLength={5000}
            disabled={isLoading}
          />
          
          <div className="char-count">
            {prompt.length} / 5000 characters
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="voice">
            AI Voice
            <span className="hint">Choose how your AI assistant sounds</span>
          </label>
          
          <select
            id="voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={isLoading}
            className="voice-select"
          >
            {VOICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.description}
              </option>
            ))}
          </select>
        </div>

        <div className="actions">
          <button 
            onClick={handleSave}
            disabled={isLoading || !prompt.trim()}
            className="save-btn"
          >
            {isLoading ? '💾 Saving...' : '💾 Save Settings'}
          </button>
          
          <div className="help-text">
            💡 Tip: Press Ctrl+Enter to save quickly
          </div>
        </div>

        {message && (
          <div className={`message ${isError ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
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
