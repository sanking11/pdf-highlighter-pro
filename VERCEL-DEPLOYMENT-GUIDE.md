# 🚀 Vercel Deployment Guide for Aurora AI Chatbot

This guide will help you deploy your AI chatbot to Vercel so it works on your live GitHub Pages site.

## 📋 What You'll Need

- ✅ GitHub account
- ✅ Vercel account (free - sign up at https://vercel.com)
- ✅ Your Groq API key (already in `.env` file)

---

## 🔐 Step 1: Secure Your API Key

**IMPORTANT:** Your API key is now protected!

✅ **What we did:**
- Created `.env` file with your API key (NOT committed to GitHub)
- Updated `server.js` to use environment variables
- Added `.env` to `.gitignore` to prevent accidental commits
- Created `.env.example` as a template for others

⚠️ **Before pushing to GitHub, verify:**
```bash
git status
```
Make sure `.env` is NOT in the list of files to be committed!

---

## 🌐 Step 2: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Easiest)

1. **Sign up/Login to Vercel**
   - Go to https://vercel.com
   - Click "Sign Up" or "Login"
   - Choose "Continue with GitHub"

2. **Import Your Project**
   - Click "Add New..." → "Project"
   - Select your GitHub repository
   - Click "Import"

3. **Configure Project**
   - **Framework Preset:** Other
   - **Root Directory:** `./` (or your project folder)
   - **Build Command:** Leave empty
   - **Output Directory:** Leave empty

4. **Add Environment Variable (CRITICAL!)**
   - Click "Environment Variables"
   - Add variable:
     - **Name:** `GROQ_API_KEY`
     - **Value:** `your_groq_api_key_here` (Get free key from https://console.groq.com)
   - Click "Add"

5. **Deploy**
   - Click "Deploy"
   - Wait 1-2 minutes for deployment
   - Copy your Vercel URL (e.g., `https://your-project.vercel.app`)

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (run from project directory)
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? pdf-highlighter-pro (or your choice)
# - Directory? ./
# - Override settings? No

# Add environment variable
vercel env add GROQ_API_KEY
# Paste your API key when prompted (Get free key from https://console.groq.com)

# Deploy to production
vercel --prod
```

---

## 🔗 Step 3: Update Your Frontend

After deploying to Vercel, you'll get a URL like:
`https://your-project.vercel.app`

**Update the API endpoint in `app.js`:**

Find this line (around line 3412):
```javascript
const response = await fetch('http://localhost:3000/api/chat', {
```

Change it to:
```javascript
const response = await fetch('https://your-project.vercel.app/api/chat', {
```

**OR** make it dynamic:
```javascript
// Auto-detect if running locally or on production
const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/chat'
    : 'https://your-project.vercel.app/api/chat';

const response = await fetch(API_URL, {
```

---

## 🧪 Step 4: Test Your Deployment

1. **Test the API endpoint directly:**
   - Open: `https://your-project.vercel.app/api/chat`
   - You should NOT see an error page

2. **Test the chatbot:**
   - Open your GitHub Pages site
   - Click the Aurora AI chatbot
   - Ask: "What is OCR?"
   - You should get a detailed response!

---

## 📁 Files Needed for Deployment

### Files to commit to GitHub:
```
✅ index.html
✅ css/styles.css
✅ js/app.js
✅ assets/
✅ server.js (updated with env variables)
✅ package.json
✅ package-lock.json
✅ vercel.json
✅ .env.example
✅ .gitignore (updated)
✅ VERCEL-DEPLOYMENT-GUIDE.md
```

### Files to NEVER commit (already in .gitignore):
```
❌ .env (contains your secret API key!)
❌ node_modules/ (too large, installed automatically)
```

---

## 🎯 Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│  GitHub Pages (Static Frontend)                 │
│  https://your-username.github.io/project        │
│                                                  │
│  ✅ index.html                                   │
│  ✅ css/styles.css                              │
│  ✅ js/app.js                                   │
│  ✅ assets/                                     │
└─────────────────┬───────────────────────────────┘
                  │
                  │ Fetches AI responses via HTTPS
                  ▼
┌─────────────────────────────────────────────────┐
│  Vercel (Backend Server)                        │
│  https://your-project.vercel.app                │
│                                                  │
│  ✅ server.js (Node.js Express server)          │
│  ✅ API Endpoint: /api/chat                     │
│  ✅ Environment Variable: GROQ_API_KEY          │
└─────────────────┬───────────────────────────────┘
                  │
                  │ Calls Groq API with your key
                  ▼
┌─────────────────────────────────────────────────┐
│  Groq API (AI Service)                          │
│  https://api.groq.com                           │
│                                                  │
│  🤖 Model: Llama 3.3-70b-versatile              │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Issue: "GROQ_API_KEY not found"
**Solution:** Add the environment variable in Vercel dashboard:
1. Go to your project in Vercel
2. Settings → Environment Variables
3. Add `GROQ_API_KEY` with your API key
4. Redeploy the project

### Issue: CORS errors
**Solution:** Vercel automatically handles CORS. If you still see errors:
- Check the API URL in `app.js` is correct
- Ensure `server.js` has `app.use(cors())`

### Issue: 404 on /api/chat
**Solution:** Check `vercel.json` routes are correct:
```json
{
  "routes": [
    {
      "src": "/api/chat",
      "dest": "server.js"
    }
  ]
}
```

### Issue: Chatbot works locally but not on GitHub Pages
**Solution:** You forgot to update the API URL in `app.js`:
- Change from `http://localhost:3000/api/chat`
- To `https://your-project.vercel.app/api/chat`

---

## 💰 Pricing

**Vercel Free Tier:**
- ✅ Unlimited deployments
- ✅ 100 GB bandwidth/month
- ✅ Serverless functions
- ✅ Automatic HTTPS
- ✅ Perfect for this project!

**Groq Free Tier:**
- ✅ Free API access
- ✅ Fast inference
- ✅ No credit card required

---

## 📚 Additional Resources

- **Vercel Documentation:** https://vercel.com/docs
- **Groq API Docs:** https://console.groq.com/docs
- **GitHub Pages:** https://pages.github.com

---

## ✅ Deployment Checklist

- [ ] Created `.env` file with API key
- [ ] Verified `.env` is in `.gitignore`
- [ ] Installed `dotenv` package
- [ ] Updated `server.js` to use environment variables
- [ ] Created Vercel account
- [ ] Deployed project to Vercel
- [ ] Added `GROQ_API_KEY` environment variable in Vercel
- [ ] Updated API URL in `app.js`
- [ ] Pushed changes to GitHub
- [ ] Tested chatbot on live site

---

**🎉 Congratulations!** Your Aurora AI chatbot is now live and secure!

For questions or issues, check the Vercel deployment logs:
https://vercel.com/your-username/your-project/deployments
