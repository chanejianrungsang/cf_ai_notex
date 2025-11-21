/**
 * ChatSession Durable Object
 * Provides persistent, stateful chat sessions per note
 */

interface Env {
  AI: any;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export class ChatSession {
  private state: DurableObjectState;
  private env: Env;
  private sessionData: {
    noteId: string;
    noteContext: string;
    lastActivity: number;
  } | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    // Set up alarm for session cleanup (24 hours of inactivity)
    this.state.blockConcurrencyWhile(async () => {
      this.sessionData = await this.state.storage.get<any>('sessionData');
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/init' && request.method === 'POST') {
        return await this.handleInit(request);
      } else if (path === '/message' && request.method === 'POST') {
        return await this.handleMessage(request);
      } else if (path === '/store' && request.method === 'POST') {
        return await this.handleStoreMessage(request);
      } else if (path === '/history' && request.method === 'GET') {
        return await this.handleGetHistory();
      } else if (path === '/clear' && request.method === 'POST') {
        return await this.handleClear();
      }

      return new Response('Not found', { status: 404 });
    } catch (error: any) {
      console.error('ChatSession error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Initialize or update session with note context
   */
  private async handleInit(request: Request): Promise<Response> {
    const { noteId, noteContext } = await request.json();

    this.sessionData = {
      noteId,
      noteContext: noteContext || '',
      lastActivity: Date.now(),
    };

    await this.state.storage.put('sessionData', this.sessionData);
    
    // Set alarm for cleanup (24 hours from now)
    const alarmTime = Date.now() + 24 * 60 * 60 * 1000;
    await this.state.storage.setAlarm(alarmTime);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle new chat message and get AI response
   */
  private async handleMessage(request: Request): Promise<Response> {
    const { message, noteContext } = await request.json();

    if (!this.sessionData) {
      return new Response(JSON.stringify({ error: 'Session not initialized' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update note context if provided
    if (noteContext !== undefined) {
      this.sessionData.noteContext = noteContext;
      this.sessionData.lastActivity = Date.now();
      await this.state.storage.put('sessionData', this.sessionData);
    }

    // Get chat history from storage
    const messages = await this.getMessages();

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    messages.push(userMessage);

    // Build context for AI
    const systemPrompt = `You are Bob, a helpful AI study assistant. You help students understand their notes by answering questions, explaining concepts, and providing study guidance.

Current note context:
${this.sessionData.noteContext.slice(0, 4000)}

Be concise, clear, and educational in your responses.`;

    // Prepare messages for AI (limit history to last 10 messages for context)
    const recentMessages = messages.slice(-10);
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map(m => ({
        role: m.role,
        content: m.content.slice(0, 2000),
      })),
    ];

    // Call Workers AI
    try {
      const aiResponse = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: aiMessages,
        max_tokens: 1024,
        temperature: 0.7,
      });

      const reply = aiResponse.response || 'Sorry, I could not generate a response.';

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      messages.push(assistantMessage);

      // Save updated messages (keep last 50 messages)
      const messagesToKeep = messages.slice(-50);
      await this.state.storage.put('messages', messagesToKeep);

      // Update last activity
      this.sessionData.lastActivity = Date.now();
      await this.state.storage.put('sessionData', this.sessionData);

      return new Response(JSON.stringify({
        reply,
        history: messagesToKeep,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('AI error:', error);
      return new Response(JSON.stringify({ error: 'AI request failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Store a message without AI interaction (for workflow results)
   */
  private async handleStoreMessage(request: Request): Promise<Response> {
    const { role, content } = await request.json();

    if (!role || !content) {
      return new Response(JSON.stringify({ error: 'Missing role or content' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get chat history from storage
    const messages = await this.getMessages();

    // Add message
    const newMessage: ChatMessage = {
      role: role as 'user' | 'assistant',
      content,
      timestamp: Date.now(),
    };
    messages.push(newMessage);

    // Save updated messages (keep last 50 messages)
    const messagesToKeep = messages.slice(-50);
    await this.state.storage.put('messages', messagesToKeep);

    // Update last activity if session exists
    if (this.sessionData) {
      this.sessionData.lastActivity = Date.now();
      await this.state.storage.put('sessionData', this.sessionData);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get chat history
   */
  private async handleGetHistory(): Promise<Response> {
    const messages = await this.getMessages();
    return new Response(JSON.stringify({ messages }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Clear chat history
   */
  private async handleClear(): Promise<Response> {
    await this.state.storage.delete('messages');
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get messages from storage
   */
  private async getMessages(): Promise<ChatMessage[]> {
    const messages = await this.state.storage.get<ChatMessage[]>('messages');
    return messages || [];
  }

  /**
   * Alarm handler for session cleanup
   */
  async alarm(): Promise<void> {
    // Check if session is still active
    if (this.sessionData) {
      const inactiveDuration = Date.now() - this.sessionData.lastActivity;
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (inactiveDuration >= twentyFourHours) {
        // Clear old messages to save storage
        await this.state.storage.delete('messages');
        console.log('Cleaned up inactive chat session');
      } else {
        // Session still active, set another alarm
        const nextAlarmTime = this.sessionData.lastActivity + twentyFourHours;
        await this.state.storage.setAlarm(nextAlarmTime);
      }
    }
  }
}
