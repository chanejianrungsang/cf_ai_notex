# Notex - AI-Powered Study Notes

> **Cloudflare Workers AI Fast Track Submission**: A modern note-taking application with AI-powered chat assistance, built entirely on Cloudflare's edge platform.

**Smart note-taking with persistent AI conversations, image uploads, and real-time markdown rendering.**

## Features

**AI Study Assistant (Bob)**
- Persistent chat conversations per note using Durable Objects
- Context aware responses based on note content
- Generate summaries with Workflows
- Create study questions automatically
- Powered by Llama 3.3 70B Instruct FP8 Fast

**Rich Note Editor**
- Real-time markdown preview with math support (KaTeX)
- Syntax highlighting for code blocks
- Image uploads with R2 storage and CDN caching

**Cloudflare Edge Stack**
- Workers AI for LLM inference
- Durable Objects for stateful chat sessions
- Workflows for multi-step AI operations
- D1 Database for note storage
- R2 Bucket for image storage

## Project Structure

- `frontend/` – React (Vite) single-page application
- `backend/` – Cloudflare Workers with TypeScript
  - `src/chatSession.ts` – Durable Object for persistent chat
  - `src/workflows/` – Multi-step AI workflows
  - `src/index.ts` – Main worker with API routes
  - `migrations/` – D1 database schema

## Quick Start

### Prerequisites

- **Node.js 18+** (for frontend and backend)
- **Cloudflare Account** (free tier works)
- **Wrangler CLI** (Cloudflare Workers CLI)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/chanejianrungsang/notex.git
   cd notex
   ```

2. **Set up the backend**
   ```bash
   cd backend
   npm install
   
   # Configure your Cloudflare account
   npx wrangler login
   
   # Create D1 database
   npx wrangler d1 create notex_db
   # Copy the database_id from output and update wrangler.jsonc
   
   # Create R2 bucket
   npx wrangler r2 bucket create notex-images
   
   # Run migrations
   npx wrangler d1 migrations apply notex_db
   
   # Deploy to Cloudflare
   npm run deploy
   ```

3. **Set up the frontend**
   ```bash
   cd ../frontend
   npm install
   
   # Create .env file with your backend URL
   echo "VITE_BACKEND_URL=https://backend.YOUR_SUBDOMAIN.workers.dev" > .env
   ```

### Running the Application

**Development Mode:**
```bash
# Terminal 1: Frontend
cd frontend
npm run dev
# Opens at http://localhost:5173

# Terminal 2: Backend (optional local testing)
cd backend
npm run dev
```

**Production:**
Backend is already deployed to Cloudflare Workers. 

**Deploy Frontend to Vercel:**
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Configure build settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variable:
   - `VITE_BACKEND_URL` = `https://backend.YOUR_SUBDOMAIN.workers.dev`
5. Deploy!

The app will automatically load a sample "Algorithm Complexity Notes" on first visit.

Alternatively, deploy to:
- Cloudflare Pages
- Netlify
- Any static hosting service

## Tech Stack

**Frontend:**
- React 19 - UI library
- Vite 7 - Build tool and dev server
- ReactMarkdown - Markdown rendering
- KaTeX - Math equation rendering
- Highlight.js - Code syntax highlighting
- Lucide React - Icon library
- jsPDF + html2canvas - PDF export

**Backend:**
- Cloudflare Workers - Serverless edge compute
- TypeScript - Type-safe development
- Workers AI - LLM inference (@cf/meta/llama-3.3-70b-instruct-fp8-fast)
- Durable Objects - Stateful chat sessions (new_sqlite_classes for free tier)
- Workflows - Multi-step AI operations (SummaryWorkflow, QuestionsWorkflow)
- D1 Database - SQL database for notes
- R2 Bucket - Object storage for images

## Architecture

### Durable Objects (Chat Memory)
Each note has its own isolated chat session that persists across page refreshes:
- Stores up to 50 messages per note
- Automatic cleanup after 24 hours of inactivity
- Handles `/init`, `/message`, `/store`, `/history`, `/clear` operations

### Workflows (Coordination)
Multi-step AI operations that break complex tasks into smaller steps:

**SummaryWorkflow:**
1. Extract 3-5 main topics
2. Generate 2-3 paragraph summary
3. Extract 5-7 key points

**QuestionsWorkflow:**
1. Analyze content difficulty level
2. Generate 7-10 mixed-type questions
3. Categorize by type and difficulty with emojis

### API Routes
```
POST   /api/notes                    - Create new note
GET    /api/notes                    - List all notes
GET    /api/notes/:id                - Get note by ID
PUT    /api/notes/:id                - Update note
DELETE /api/notes/:id                - Delete note

POST   /api/chat                     - Send message to AI (via Durable Object)
GET    /api/chat/history?noteId=X    - Get chat history
POST   /api/chat/clear?noteId=X      - Clear chat history
POST   /api/chat/store               - Store message without AI response

POST   /api/notes/:id/summary        - Generate summary (Workflow)
POST   /api/notes/:id/questions      - Generate study questions (Workflow)

POST   /api/upload                   - Upload image to R2
GET    /api/images/:filename         - Retrieve image from R2
```

## Known Limitations

- Free tier Durable Objects require `new_sqlite_classes` migration
- R2 image URLs are public (no authentication layer)
- Chat history limited to 50 messages per note
- Workflows are synchronous (may take 10-30 seconds)

## Development Notes

**Backend Deployment:**
```bash
cd backend
npm run deploy
# Deploys to: https://backend.YOUR_SUBDOMAIN.workers.dev
```

**Frontend Environment:**
Update `frontend/.env` with your deployed backend URL:
```
VITE_BACKEND_URL=https://backend.chanejianrungsang.workers.dev
```

**Database Migrations:**
```bash
cd backend
npx wrangler d1 migrations create notex_db "migration_name"
npx wrangler d1 migrations apply notex_db
```
