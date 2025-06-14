# 🎯 AlwaysPickup-Lite

A minimal voice agent that answers phone calls with AI, powered by OpenAI's Realtime API and Twilio.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

## 🚀 Features

- **AI Voice Agent**: Answers calls with customizable AI personality
- **Real-time Conversations**: Powered by OpenAI's Realtime API
- **Web Admin Panel**: Easy prompt and voice management
- **Multiple Voices**: Choose from 8 different AI voices
- **Simple Deployment**: One-click Railway deployment
- **Local Storage**: No database required

## 🏗️ Architecture

```
Railway Server (Single Deployment):
├── /admin (React admin interface)
├── /api/prompt (prompt management API)
├── /voice (Twilio webhook endpoint)
├── /media (WebSocket for audio streaming)
├── prompts.json (local file storage)
└── Static assets (CSS, JS, images)
```

## 🔧 Quick Start

### Prerequisites

1. **OpenAI API Key** with Realtime API access
2. **Twilio Account** with a phone number
3. **Railway Account** for hosting

### Deploy to Railway

1. **Clone and Deploy**:
   ```bash
   git clone https://github.com/your-org/alwayspickup-lite.git
   cd alwayspickup-lite
   
   # Install dependencies
   npm install
   
   # Deploy to Railway
   railway login
   railway init
   railway up
   ```

2. **Set Environment Variables**:
   ```bash
   railway variables set OPENAI_API_KEY=sk-your-openai-api-key
   ```

3. **Configure Twilio**:
   - Go to [Twilio Console](https://console.twilio.com)
   - Navigate to Phone Numbers → Manage → Active numbers
   - Click your phone number
   - Set Voice webhook URL to: `https://your-app.railway.app/voice`
   - Set HTTP method to `POST`

4. **Access Admin Panel**:
   - Visit `https://your-app.railway.app/admin`
   - Update your AI agent's prompt and voice
   - Save changes

5. **Test Your Agent**:
   - Call your Twilio phone number
   - Your AI agent will answer!

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Add your OPENAI_API_KEY to .env

# Run development server
npm run dev
```

### Building Admin Interface

```bash
# Build admin React app
npm run build:admin
```

### Project Structure

```
alwayspickup-lite/
├── server.js                 # Main Fastify server
├── package.json              # Dependencies
├── railway.json              # Railway config
├── prompts.json              # Local prompt storage
├── public/                   # Static assets
│   └── admin/               # Admin interface
└── admin/                   # Admin React source
    ├── src/
    └── package.json
```

## 📡 How It Works

1. **Phone Call → Twilio**: When someone calls your number
2. **Twilio → Your Server**: Twilio POSTs to `/voice` endpoint
3. **Server → TwiML**: Returns WebSocket URL for audio streaming
4. **WebSocket Connection**: Twilio connects to `/media` endpoint
5. **Audio Streaming**: Real-time bidirectional audio with OpenAI

## 🎨 Customization

### Available Voices

- **Alloy**: Neutral and balanced
- **Ash**: Warm and conversational
- **Ballad**: Expressive and emotive
- **Coral**: Professional and clear
- **Echo**: Smooth and refined
- **Sage**: Authoritative and wise
- **Shimmer**: Energetic and friendly
- **Verse**: Creative and dynamic

### Prompt Guidelines

- Keep prompts concise and clear
- Define the agent's personality
- Specify response style
- Include any specific instructions

Example:
```
You are a friendly customer service agent for a pizza restaurant. 
Be warm, helpful, and efficient. Keep responses brief and natural.
Always confirm orders and provide the total cost.
```

## 🔒 Security Considerations

- Store API keys securely in environment variables
- prompts.json is local storage (not committed to git)
- Consider adding authentication to admin panel for production
- Monitor API usage to control costs

## 💰 Cost Estimation

- **Railway**: ~$5/month (Hobby plan)
- **OpenAI**: Pay per usage (Realtime API pricing)
- **Twilio**: Pay per minute for calls

## 🐛 Troubleshooting

### Common Issues

1. **"WebSocket connection failed"**
   - Check your Railway deployment URL
   - Ensure HTTPS/WSS protocols are used

2. **"No audio on calls"**
   - Verify OpenAI API key has Realtime access
   - Check Railway logs for errors

3. **"Admin panel not loading"**
   - Run `npm run build:admin`
   - Check static file serving in logs

### Debug Commands

```bash
# View Railway logs
railway logs --tail

# Check environment variables
railway variables

# Test endpoints
curl https://your-app.railway.app/ping
```

## 📚 Documentation

- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Twilio Voice Webhooks](https://www.twilio.com/docs/voice/webhooks)
- [Railway Documentation](https://docs.railway.app)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- OpenAI for the Realtime API
- Twilio for telephony infrastructure
- Railway for simple deployments
