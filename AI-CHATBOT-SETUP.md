# 🤖 AI Chatbot Setup Instructions

Your chatbot is now configured to use **Groq API (Llama 3.3 70B)** for intelligent responses!

## 📋 Quick Setup (4 Steps)

### Step 1: Get Your FREE Groq API Key
1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to **API Keys** section
4. Click **Create API Key**
5. Copy your API key

### Step 2: Configure Your API Key
1. Copy `.env.example` to `.env`
2. Open `.env` file
3. Replace `your_groq_api_key_here` with your actual API key:
```
GROQ_API_KEY=gsk_your_actual_api_key_here
```

### Step 3: Install Dependencies
Open Command Prompt in this folder and run:
```bash
npm install
```

### Step 4: Start the Server
```bash
npm start
```

You should see:
```
🚀 Server running at http://localhost:3000
📂 Serving files from: [your folder path]
🤖 OpenAI API configured and ready!
```

### Step 5: Open Your App
Open your browser and go to:
```
http://localhost:3000
```

That's it! Your chatbot now uses **Groq AI (Llama 3.3 70B)** and can answer ANY question! 🎉

**Why Groq?**
- ⚡ **Lightning Fast** - Fastest AI inference in the world
- 🆓 **100% FREE** - Generous free tier
- 🧠 **Powerful** - Llama 3.3 70B model (similar to GPT-4)
- 🚀 **No Credit Card Required**

---

## 🧪 Test It

Try asking the chatbot:
- "what is quantum entanglement?"
- "explain artificial intelligence"
- "how does blockchain work?"
- "tell me about the universe"
- Any question - it will answer intelligently!

---

## 📝 How It Works

### With Groq API (When Server is Running):
1. **Browser** → Sends question to local server
2. **Local Server** (server.js) → Forwards to Groq API
3. **Groq AI (Llama 3.3 70B)** → Generates intelligent response
4. **Local Server** → Sends response back to browser
5. **Chatbot** → Displays answer to user

### Fallback Mode (When Server is Offline):
- If the server isn't running, the chatbot automatically uses its **built-in knowledge base**
- It can still answer questions about the PDF Highlighter app and general topics
- Responses are fast but less dynamic

This dual-mode setup ensures the chatbot ALWAYS works!

---

## 🛑 Stopping the Server

Press `Ctrl + C` in the command prompt window.

---

## ⚙️ Configuration

**Change AI Model:** Edit `server.js` line 45
```javascript
model: 'llama-3.3-70b-versatile', // Available models:
// 'llama-3.3-70b-versatile' - Most powerful (recommended)
// 'llama-3.1-70b-versatile' - Fast and capable
// 'mixtral-8x7b-32768' - Good for longer context
```

**Change Response Length:** Edit `server.js` line 67
```javascript
max_tokens: 300, // Increase for longer responses (up to 8000)
```

---

## 💰 API Costs

**Groq is 100% FREE!** 🎉
- No credit card required
- Generous free tier for personal use
- No hidden costs
- Perfect for this chatbot application

---

## 🔒 Security Note

Your API key is stored in `server.js` which runs locally on your computer. It's not exposed to the internet when running locally.

For production deployment, consider using environment variables instead.

---

## ❓ Troubleshooting

**"npm: command not found"**
- Install Node.js from: https://nodejs.org

**"Server not running or unavailable"**
- Make sure you ran `npm start` first
- Check that port 3000 is not already in use

**"OpenAI API Error"**
- Verify your API key in `server.js` is correct
- Check your OpenAI account has credits

---

## 🎯 Features

✅ Full GPT-4o intelligence
✅ Answers ANY question
✅ Knows about your PDF Highlighter Pro app
✅ Formatted responses with bullet points
✅ Fast and efficient
✅ Falls back to smart responses if server unavailable

---

**Enjoy your super-intelligent chatbot!** 🚀
