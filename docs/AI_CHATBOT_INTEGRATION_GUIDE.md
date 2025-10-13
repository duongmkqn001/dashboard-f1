# AI Chatbot Integration Guide

## Overview

The AI chatbot feature has been successfully implemented in both the main dashboard (`dashboard-v2.html`) and the test page (`test-manual-schedule-notification.html`). The chatbot appears as a floating chat icon in the bottom-left corner and provides an interactive chat interface similar to customer support chatbots on sales pages.

## Current Implementation

### Features Implemented ✅

1. **Chat Icon**: Fixed position bottom-left with gradient background and hover effects
2. **Chat Container**: Modern chat interface with header, messages area, and input field
3. **Message System**: Support for both user and bot messages with proper styling
4. **Typing Indicator**: Animated dots to show when the bot is "thinking"
5. **Responsive Design**: Mobile-friendly layout that adapts to screen size
6. **Mock AI Responses**: Intelligent keyword-based responses for common dashboard questions

### Current Functionality

The chatbot currently provides helpful responses about:
- Ticket management and workflow
- Template usage and customization
- Dashboard navigation and features
- Filtering and search options
- Notification system
- Theme customization
- API integration guidance

## API Integration Options

### 1. Hugging Face Inference API (Recommended for Quick Setup)

**Pros**: Easy to implement, no server setup required, many pre-trained models
**Cons**: Rate limits, requires API key, limited customization

```javascript
async function callAIAPI(message) {
    const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer YOUR_HF_TOKEN',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputs: message,
            parameters: {
                max_length: 100,
                temperature: 0.7,
                return_full_text: false
            }
        })
    });
    
    const result = await response.json();
    return result[0]?.generated_text || "I'm sorry, I couldn't process that request.";
}
```

**Setup Steps**:
1. Create account at https://huggingface.co/
2. Generate API token in settings
3. Replace `YOUR_HF_TOKEN` with your actual token
4. Choose appropriate model (DialoGPT, GPT-2, BERT, etc.)

### 2. Google Colab + ngrok (Recommended for Custom Models)

**Pros**: Full control, custom training, free GPU usage
**Cons**: Requires Python knowledge, temporary URLs, setup complexity

**Colab Setup**:
```python
# Install dependencies
!pip install transformers torch flask flask-cors pyngrok

# Import libraries
from transformers import AutoTokenizer, AutoModelForCausalLM
from flask import Flask, request, jsonify
from flask_cors import CORS
from pyngrok import ngrok
import torch

# Load model
tokenizer = AutoTokenizer.from_pretrained("microsoft/DialoGPT-medium")
model = AutoModelForCausalLM.from_pretrained("microsoft/DialoGPT-medium")

# Create Flask app
app = Flask(__name__)
CORS(app)

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    message = data.get('message', '')
    
    # Encode input
    inputs = tokenizer.encode(message + tokenizer.eos_token, return_tensors='pt')
    
    # Generate response
    with torch.no_grad():
        outputs = model.generate(inputs, max_length=100, temperature=0.7, pad_token_id=tokenizer.eos_token_id)
    
    # Decode response
    response = tokenizer.decode(outputs[:, inputs.shape[-1]:][0], skip_special_tokens=True)
    
    return jsonify({'response': response})

# Start ngrok tunnel
public_url = ngrok.connect(5000)
print(f"Public URL: {public_url}")

# Run Flask app
app.run(port=5000)
```

**Frontend Integration**:
```javascript
async function callAIAPI(message) {
    const response = await fetch('YOUR_NGROK_URL/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: message })
    });
    
    const result = await response.json();
    return result.response || "I'm sorry, I couldn't process that request.";
}
```

### 3. OpenAI API (Recommended for Production)

**Pros**: High-quality responses, reliable service, extensive documentation
**Cons**: Paid service, API costs

```javascript
async function callAIAPI(message) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer YOUR_OPENAI_API_KEY',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant for a ticket management dashboard. Help users with questions about tickets, templates, and system features.'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        })
    });
    
    const result = await response.json();
    return result.choices[0]?.message?.content || "I'm sorry, I couldn't process that request.";
}
```

## Implementation Steps

### Step 1: Choose Your API Provider
- **Quick Start**: Use Hugging Face Inference API
- **Custom Training**: Use Google Colab + ngrok
- **Production**: Use OpenAI API

### Step 2: Replace the Mock Function
In both `js/dashboard-v2.js` and `test-manual-schedule-notification.html`, replace the `callAIAPI` function with your chosen implementation.

### Step 3: Add Error Handling
```javascript
async function callAIAPI(message) {
    try {
        // Your API call here
        const response = await fetch(/* your API endpoint */);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result.response || "I received your message but couldn't generate a response.";
        
    } catch (error) {
        console.error('AI API Error:', error);
        return "I'm currently experiencing technical difficulties. Please try again later.";
    }
}
```

### Step 4: Add Rate Limiting (Optional)
```javascript
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2 seconds

async function sendMessage() {
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_COOLDOWN) {
        addMessageToChat('Please wait a moment before sending another message.', 'bot');
        return;
    }
    lastRequestTime = now;
    
    // Rest of your sendMessage function...
}
```

## Customization Options

### 1. Modify Chat Appearance
Edit the CSS in `css/dashboard-v2.css` to change colors, sizes, or positioning.

### 2. Add Context Awareness
Modify the system prompt to include information about the current user or ticket context:

```javascript
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
const systemPrompt = `You are a helpful assistant for ${currentUser.name} in a ticket management dashboard...`;
```

### 3. Add Chat History
Store conversation history in localStorage or send it with each API request for better context.

### 4. Add Quick Actions
Add predefined buttons for common questions:

```html
<div class="quick-actions">
    <button onclick="sendQuickMessage('How do I start a ticket?')">Start Ticket</button>
    <button onclick="sendQuickMessage('How do I use templates?')">Templates</button>
    <button onclick="sendQuickMessage('How do I change themes?')">Themes</button>
</div>
```

## Testing

1. **Test the Chat Interface**: Click the chat icon and verify the interface opens/closes properly
2. **Test Message Sending**: Send messages and verify they appear correctly
3. **Test API Integration**: Replace the mock function and test with your chosen API
4. **Test Error Handling**: Simulate network errors and verify graceful degradation
5. **Test Mobile Responsiveness**: Verify the chat works on mobile devices

## Security Considerations

1. **API Key Security**: Never expose API keys in frontend code. Use environment variables or proxy through your backend.
2. **Rate Limiting**: Implement rate limiting to prevent abuse
3. **Input Sanitization**: Sanitize user inputs before sending to AI APIs
4. **Content Filtering**: Consider implementing content filtering for inappropriate messages

## Next Steps

1. Choose your preferred AI API provider
2. Set up API credentials securely
3. Replace the mock `callAIAPI` function
4. Test thoroughly with real API responses
5. Deploy and monitor usage
6. Gather user feedback for improvements

The chatbot is now ready for integration with your chosen AI service!
