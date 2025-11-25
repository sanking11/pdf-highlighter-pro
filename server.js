// Simple Node.js server to proxy AI API requests
// This bypasses CORS restrictions

require('dotenv').config(); // Load environment variables
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Groq API Key from environment variable
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Validate API key exists
if (!GROQ_API_KEY) {
    console.error('❌ ERROR: GROQ_API_KEY not found in environment variables!');
    console.error('💡 Create a .env file with: GROQ_API_KEY=your_api_key');
    process.exit(1);
}

// API endpoint to proxy AI requests
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        console.log('📨 Received message:', message);

        // Use Groq API with Llama 3.1
        try {
            console.log('🤖 Calling Groq API (Llama 3.1)...');

            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile', // Latest Llama 3.3 model
                    messages: [
                        {
                            role: 'system',
                            content: `You are a helpful AI assistant for PDF Highlighter Pro, a web app that highlights text in PDFs.

**App Features:**
- Smart Highlighting: Add words/phrases to highlight across PDFs
- Exact Match: Match complete words only
- Case Sensitive: Match exact uppercase/lowercase
- OCR Support: Scan images and charts for text using AI
- Batch Processing: Process multiple PDFs or ZIP files
- Export/Import Rules: Save highlight rules as JSON
- Download Results: Get highlighted PDFs in a ZIP

Answer questions concisely and friendly. Keep responses under 200 words. Use bullet points (•) for clarity. If asked about the app, reference its features. For general questions, provide accurate, helpful answers.`
                        },
                        {
                            role: 'user',
                            content: message
                        }
                    ],
                    max_tokens: 300,
                    temperature: 0.7,
                    top_p: 0.9
                })
            });

            if (!groqResponse.ok) {
                const errorData = await groqResponse.json();
                console.error('❌ Groq API Error:', errorData);
                return res.json({ response: null });
            }

            const groqData = await groqResponse.json();

            if (groqData && groqData.choices && groqData.choices[0] && groqData.choices[0].message) {
                const aiResponse = groqData.choices[0].message.content;
                console.log('✅ Groq AI Response received!');
                console.log('📝 Response:', aiResponse.substring(0, 100) + '...');
                return res.json({ response: aiResponse });
            }

        } catch (error) {
            console.error('❌ Groq API Error:', error.message);
        }

        // Fallback if API fails
        console.log('⚠️ AI API unavailable, client will use fallback');
        res.json({ response: null });

    } catch (error) {
        console.error('❌ Server Error:', error);
        res.json({ response: null });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📂 Serving files from: ${__dirname}`);
    console.log(`🤖 OpenAI API configured and ready!`);
});
