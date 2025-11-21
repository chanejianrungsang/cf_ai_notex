/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { ChatSession } from './chatSession';
import { SummaryWorkflow } from './workflows/summaryWorkflow';
import { QuestionsWorkflow } from './workflows/questionsWorkflow';

export { ChatSession };

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/") {
      return new Response("Notex backend up", {
        headers: { "content-type": "text/plain" },
      });
    }

    // AI chat - route to Durable Object
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env, ctx);
    }

    // Get chat history
    if (url.pathname === "/api/chat/history" && request.method === "GET") {
      const noteId = url.searchParams.get("noteId");
      if (!noteId) return jsonResponse({ error: "Missing noteId" }, 400);
      return handleChatHistory(env, noteId);
    }

    // Clear chat history
    if (url.pathname === "/api/chat/clear" && request.method === "POST") {
      const noteId = url.searchParams.get("noteId");
      if (!noteId) return jsonResponse({ error: "Missing noteId" }, 400);
      return handleClearChat(env, noteId);
    }

    // Store message in chat (without AI response)
    if (url.pathname === "/api/chat/store" && request.method === "POST") {
      return handleStoreMessage(request, env);
    }

    // Image upload
    if (url.pathname === "/api/upload" && request.method === "POST") {
      return handleImageUpload(request, env);
    }

    // Image retrieval
    if (url.pathname.startsWith("/api/images/")) {
      const filename = decodeURIComponent(url.pathname.replace("/api/images/", ""));
      if (!filename) return jsonResponse({ error: "Missing filename" }, 400);
      if (request.method === "GET") {
        return handleImageGet(env, filename);
      }
    }

    // Workflow: Generate summary
    if (url.pathname.startsWith("/api/notes/") && url.pathname.endsWith("/summary") && request.method === "POST") {
      const pathParts = url.pathname.split("/");
      const id = pathParts[3]; // /api/notes/{id}/summary
      if (!id) return jsonResponse({ error: "Missing note id" }, 400);
      return handleGenerateSummary(env, id);
    }

    // Workflow: Generate study questions
    if (url.pathname.startsWith("/api/notes/") && url.pathname.endsWith("/questions") && request.method === "POST") {
      const pathParts = url.pathname.split("/");
      const id = pathParts[3]; // /api/notes/{id}/questions
      if (!id) return jsonResponse({ error: "Missing note id" }, 400);
      return handleGenerateQuestions(env, id);
    }

    // Notes list and creation
    if (url.pathname === "/api/notes") {
      if (request.method === "GET") return listNotes(env);
      if (request.method === "POST") return createNote(env);
    }

    // Notes by id (must come AFTER workflow routes)
    if (url.pathname.startsWith("/api/notes/")) {
      // Skip if it's a workflow route
      if (url.pathname.endsWith("/summary") || url.pathname.endsWith("/questions")) {
        return new Response("Not found", { status: 404 });
      }
      
      const id = decodeURIComponent(url.pathname.replace("/api/notes/", ""));
      if (!id) return jsonResponse({ error: "Missing note id" }, 400);

      if (request.method === "GET") {
        return getNote(env, id);
      }

      if (request.method === "PUT") {
        return updateNote(request, env, id);
      }
	  
	  if (request.method === "DELETE") {
		return deleteNote(env, id);
	}
    }

    return new Response("Not found", { status: 404 });
  },
};

type ChatHistoryItem = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequestBody = {
  message?: string;
  history?: ChatHistoryItem[];
  noteContext?: string;
  noteId?: string;
};

async function handleChat(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const userMessage = body.message?.trim();
    const noteContext = body.noteContext || "";
    const noteId = body.noteId || "default";

    if (!userMessage) {
      return jsonResponse(
        { error: "Missing 'message' in request body" },
        400
      );
    }

    // Get Durable Object stub for this note's chat session
    const id = env.CHAT_SESSIONS.idFromName(noteId);
    const stub = env.CHAT_SESSIONS.get(id);

    // Initialize session with note context
    await stub.fetch("https://do/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, noteContext }),
    });

    // Send message to Durable Object
    const response = await stub.fetch("https://do/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, noteContext }),
    });

    const data = await response.json() as any;

    return jsonResponse(
      { reply: data.reply, history: data.history },
      200
    );
  } catch (err: any) {
    console.error("handleChat error", err);
    return jsonResponse({ error: err.message || "Unknown error" }, 500);
  }
}

async function handleChatHistory(env: any, noteId: string): Promise<Response> {
  try {
    // Get Durable Object stub for this note's chat session
    const id = env.CHAT_SESSIONS.idFromName(noteId);
    const stub = env.CHAT_SESSIONS.get(id);

    // Fetch history from Durable Object
    const response = await stub.fetch("https://do/history", {
      method: "GET",
    });

    const data = await response.json() as any;
    return jsonResponse({ messages: data.messages || [] }, 200);
  } catch (err: any) {
    console.error("handleChatHistory error", err);
    return jsonResponse({ error: err.message || "Unknown error" }, 500);
  }
}

async function handleClearChat(env: any, noteId: string): Promise<Response> {
  try {
    // Get Durable Object stub for this note's chat session
    const id = env.CHAT_SESSIONS.idFromName(noteId);
    const stub = env.CHAT_SESSIONS.get(id);

    // Clear chat history in Durable Object
    const response = await stub.fetch("https://do/clear", {
      method: "POST",
    });

    const data = await response.json() as any;
    return jsonResponse({ success: data.success || false }, 200);
  } catch (err: any) {
    console.error("handleClearChat error", err);
    return jsonResponse({ error: err.message || "Unknown error" }, 500);
  }
}

async function handleStoreMessage(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json() as any;
    const { noteId, role, content } = body;

    if (!noteId || !role || !content) {
      return jsonResponse({ error: "Missing noteId, role, or content" }, 400);
    }

    // Get Durable Object stub for this note's chat session
    const id = env.CHAT_SESSIONS.idFromName(noteId);
    const stub = env.CHAT_SESSIONS.get(id);

    // Store message in Durable Object
    const response = await stub.fetch("https://do/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });

    const data = await response.json() as any;
    return jsonResponse({ success: data.success || false }, 200);
  } catch (err: any) {
    console.error("handleStoreMessage error", err);
    return jsonResponse({ error: err.message || "Unknown error" }, 500);
  }
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

type NoteRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

async function listNotes(env: any): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, updated_at FROM notes ORDER BY updated_at DESC"
    ).all();

    return jsonResponse(
      {
        notes: results ?? [],
      },
      200
    );
  } catch (err) {
    console.error("listNotes error:", err);
    return jsonResponse({ error: "Failed to list notes" }, 500);
  }
}

async function createNote(env: any): Promise<Response> {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = "New note";
    const content = "";

    await env.DB.prepare(
      "INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(id, title, content, now, now)
      .run();

    return jsonResponse(
      {
        note: {
          id,
          title,
          content,
          created_at: now,
          updated_at: now,
        },
      },
      201
    );
  } catch (err) {
    console.error("createNote error:", err);
    return jsonResponse({ error: "Failed to create note" }, 500);
  }
}

async function getNote(env: any, id: string): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?"
    )
      .bind(id)
      .all();

    if (!results || results.length === 0) {
      return jsonResponse({ error: "Note not found" }, 404);
    }

    return jsonResponse({ note: results[0] }, 200);
  } catch (err) {
    console.error("getNote error:", err);
    return jsonResponse({ error: "Failed to get note" }, 500);
  }
}

async function updateNote(request: Request, env: any, id: string): Promise<Response> {
  try {
    const body = (await request.json()) as {
      title?: string;
      content?: string;
    };

    const fields: string[] = [];
    const values: any[] = [];

    if (typeof body.title === "string") {
      fields.push("title = ?");
      values.push(body.title);
    }

    if (typeof body.content === "string") {
      fields.push("content = ?");
      values.push(body.content);
    }

    if (fields.length === 0) {
      return jsonResponse({ error: "No fields to update" }, 400);
    }

    const now = new Date().toISOString();
    fields.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const sql = `UPDATE notes SET ${fields.join(", ")} WHERE id = ?`;

    await env.DB.prepare(sql).bind(...values).run();

    const { results } = await env.DB.prepare(
      "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?"
    )
      .bind(id)
      .all();

    if (!results || results.length === 0) {
      return jsonResponse({ error: "Note not found" }, 404);
    }

    return jsonResponse({ note: results[0] }, 200);
  } catch (err) {
    console.error("updateNote error:", err);
    return jsonResponse({ error: "Failed to update note" }, 500);
  }
}

async function deleteNote(env: any, id: string): Promise<Response> {
  try {
    await env.DB.prepare("DELETE FROM notes WHERE id = ?")
      .bind(id)
      .run();

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error("deleteNote error:", err);
    return jsonResponse({ error: "Failed to delete note" }, 500);
  }
}

async function handleImageUpload(request: Request, env: any): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse({ error: "Expected multipart/form-data" }, 400);
    }

    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return jsonResponse({ error: "No image file provided" }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      return jsonResponse({ error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG" }, 400);
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return jsonResponse({ error: "File too large. Maximum size is 5MB" }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split("-")[0];
    const extension = file.name.split(".").pop() || "jpg";
    const filename = `${timestamp}-${randomId}.${extension}`;

    // Upload to R2
    await env.IMAGES.put(filename, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Return URL for the uploaded image
    const imageUrl = `/api/images/${filename}`;
    return jsonResponse({ url: imageUrl, filename }, 200);
  } catch (err) {
    console.error("Image upload error:", err);
    return jsonResponse({ error: "Failed to upload image" }, 500);
  }
}

async function handleImageGet(env: any, filename: string): Promise<Response> {
  try {
    const object = await env.IMAGES.get(filename);

    if (!object) {
      return new Response("Image not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(object.body, {
      headers,
    });
  } catch (err) {
    console.error("Image retrieval error:", err);
    return new Response("Failed to retrieve image", { status: 500 });
  }
}

async function handleGenerateSummary(env: any, noteId: string): Promise<Response> {
  try {
    // Get note from database
    const note = await env.DB.prepare(
      "SELECT id, title, content FROM notes WHERE id = ?"
    ).bind(noteId).first();

    if (!note) {
      return jsonResponse({ error: "Note not found" }, 404);
    }

    // Run summary workflow
    const workflow = new SummaryWorkflow();
    const result = await workflow.run(env, {
      noteId: note.id,
      noteContent: note.content || '',
      noteTitle: note.title || 'Untitled',
    });

    // Format result as markdown for display - keep it brief, just the summary
    const markdown = result.summary;

    return jsonResponse({
      success: true,
      summary: result.summary,
      keyPoints: result.keyPoints,
      topics: result.topics,
      markdown,
    }, 200);
  } catch (err: any) {
    console.error("Generate summary error:", err);
    return jsonResponse({ error: err.message || "Failed to generate summary" }, 500);
  }
}

async function handleGenerateQuestions(env: any, noteId: string): Promise<Response> {
  try {
    // Get note from database
    const note = await env.DB.prepare(
      "SELECT id, title, content FROM notes WHERE id = ?"
    ).bind(noteId).first();

    if (!note) {
      return jsonResponse({ error: "Note not found" }, 404);
    }

    // Run questions workflow
    const workflow = new QuestionsWorkflow();
    const result = await workflow.run(env, {
      noteId: note.id,
      noteContent: note.content || '',
      noteTitle: note.title || 'Untitled',
    });

    // Format result as markdown for display
    const markdown = `## Study Questions (${result.totalCount} questions)\n\n${result.questions.map((q, i) => {
      const icon = q.type === 'recall' ? '🧠' : q.type === 'comprehension' ? '💡' : '🔧';
      const difficultyLabel = q.difficulty === 'easy' ? '⭐' : q.difficulty === 'medium' ? '⭐⭐' : '⭐⭐⭐';
      return `${i + 1}. ${icon} ${q.question} ${difficultyLabel}`;
    }).join('\n\n')}`;

    return jsonResponse({
      success: true,
      questions: result.questions,
      totalCount: result.totalCount,
      markdown,
    }, 200);
  } catch (err: any) {
    console.error("Generate questions error:", err);
    return jsonResponse({ error: err.message || "Failed to generate questions" }, 500);
  }
}
