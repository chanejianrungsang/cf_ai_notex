import { useState, useEffect, useRef } from "react";
import { Pencil, Trash2, Bold, Italic, Heading1, Heading2, List, ListOrdered, Code, Upload, Link, MessageCircle, Sparkles, FileText, HelpCircle } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

// Chat message type
function App() {
  // Notes state
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");

  // Rename state
  const [renamingNoteId, setRenamingNoteId] = useState(null);
  const [renameInput, setRenameInput] = useState("");

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Editor ref for toolbar actions
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // PDF preview state
  const [pdfUrl, setPdfUrl] = useState(null);
  const [showPdf, setShowPdf] = useState(false);
  
  // Chat panel state
  const [showChat, setShowChat] = useState(false);
  
  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState(null);
  const [symbolCategory, setSymbolCategory] = useState('greek');
  const [tableHover, setTableHover] = useState({ rows: 0, cols: 0 });
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  // Generate PDF from preview
  const generatePdf = async () => {
    if (!previewRef.current) return;
    
    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;
    
    const element = previewRef.current;
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    
    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
    setShowPdf(true);
  };

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large. Please choose an image smaller than 5MB.');
      return;
    }
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }
    
    setUploadingImage(true);
    
    try {
      // Create FormData for upload
      const formData = new FormData();
      formData.append('image', file);
      
      // Upload to backend API
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      const data = await response.json();
      const imageUrl = `${API_URL}${data.url}`;
      
      // Prompt for alt text
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      const altText = prompt(`Insert image: ${file.name}\n\nEnter description (optional):`, fileName) || fileName;
      
      if (altText !== null) {
        insertAtCursor(`![${altText}](${imageUrl})\n`, '');
      }
    } catch (error) {
      console.error('Image upload error:', error);
      alert(`Failed to upload image: ${error.message}`);
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Generate table markdown
  const generateTable = (rows, cols) => {
    const header = '| ' + Array(cols).fill('Header').map((h, i) => `${h} ${i + 1}`).join(' | ') + ' |\n';
    const separator = '|' + Array(cols).fill('---').join('|') + '|\n';
    const bodyRows = Array(rows - 1).fill(null).map((_, i) => 
      '| ' + Array(cols).fill('Cell').map((c, j) => `${c} ${i + 1}-${j + 1}`).join(' | ') + ' |'
    ).join('\n');
    return header + separator + bodyRows + '\n';
  };

  // Toolbar insert helpers
  const insertAtCursor = (before, after = "") => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = noteText.substring(start, end);
    const newText = noteText.substring(0, start) + before + selectedText + after + noteText.substring(end);
    
    setNoteText(newText);
    saveNote({ content: newText });
    
    // Set cursor position after insert
    setTimeout(() => {
      textarea.focus();
      const newPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
    
    setOpenDropdown(null);
  };
  
  // Symbol categories
  const symbols = {
    greek: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω', 'Γ', 'Δ', 'Θ', 'Λ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω'],
    arrows: ['→', '←', '↑', '↓', '↔', '⇒', '⇐', '⇔', '↗', '↘', '↙', '↖'],
    operators: ['+', '−', '×', '÷', '±', '∓', '⋅', '∗', '∘', '√', '∛', '∜'],
    relations: ['=', '≠', '≈', '≡', '≤', '≥', '<', '>', '∈', '∉', '⊂', '⊃', '⊆', '⊇', '∩', '∪']
  };

  // Load notes on mount
  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notes`);
      const data = await res.json();
      const list = data.notes || [];
      setNotes(list);

      // Auto-select first note or create sample note if empty
      if (list.length > 0 && !selectedNoteId) {
        selectNote(list[0].id, list[0].title);
      } else if (list.length === 0) {
        // Create sample note on first visit
        await createSampleNote();
      }
    } catch (err) {
      console.error("Failed to load notes", err);
    }
  };

  const createSampleNote = async () => {
    const sampleContent = `# Algorithm Complexity Notes

Understanding the efficiency of algorithms is essential for analyzing how they scale.

## Big O Notation
Big O describes an **upper bound** on the runtime of an algorithm.

Examples:
- $O(1)$: Constant time
- $O(\\log n)$: Binary search
- $O(n)$: Linear scan
- $O(n \\log n)$: Merge sort
- $O(n^2)$: Nested loops

## Example: Summation
Consider the loop:

\`\`\`python
s = 0
for i in range(n):
    s += i
\`\`\`
This runs **n** times:

$$
T(n) = O(n)
$$`;

    try {
      const res = await fetch(`${API_URL}/api/notes`, {
        method: "POST",
      });
      const data = await res.json();
      const note = data.note;

      // Update the note with sample content
      await fetch(`${API_URL}/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Algorithm Complexity Notes",
          content: sampleContent,
        }),
      });

      // Refresh notes list
      await fetchNotes();
    } catch (err) {
      console.error("Failed to create sample note", err);
    }
  };

  const selectNote = async (id, titleHint) => {
    try {
      const res = await fetch(`${API_URL}/api/notes/${id}`);
      const data = await res.json();
      const note = data.note;

      setSelectedNoteId(id);
      setNoteTitle(note.title ?? titleHint ?? "Untitled");
      setNoteText(note.content ?? "");
      
      // Load chat history from Durable Object
      try {
        const chatRes = await fetch(`${API_URL}/api/chat/history?noteId=${id}`);
        console.log('Chat history response:', chatRes.status, chatRes.ok);
        if (chatRes.ok) {
          const chatData = await chatRes.json();
          console.log('Chat history data:', chatData);
          // Filter out system messages and only show user/assistant messages
          const userMessages = chatData.messages?.filter(m => m.role !== 'system') || [];
          console.log('Filtered messages:', userMessages);
          setMessages(userMessages);
        } else {
          console.log('No chat history or error');
          setMessages([]); // No history yet
        }
      } catch (err) {
        console.error("Failed to load chat history", err);
        setMessages([]); // reset AI chat on error
      }
    } catch (err) {
      console.error("Failed to load note", err);
    }
  };

  const handleNewNote = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notes`, {
        method: "POST",
      });
      const data = await res.json();
      const note = data.note;

      setNotes((prev) => [
        {
          id: note.id,
          title: note.title,
          updated_at: note.updated_at,
        },
        ...prev,
      ]);

      // Select new note
      setSelectedNoteId(note.id);
      setNoteTitle(note.title);
      setNoteText(note.content);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create note", err);
    }
  };

  const saveNote = async (fields) => {
    if (!selectedNoteId) return;
    try {
      const res = await fetch(`${API_URL}/api/notes/${selectedNoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });

      const data = await res.json();
      const updated = data.note;

      // Update sidebar list metadata
      setNotes((prev) =>
        prev.map((n) =>
          n.id === updated.id
            ? {
                id: updated.id,
                title: updated.title,
                updated_at: updated.updated_at,
              }
            : n
        )
      );
    } catch (err) {
      console.error("Failed to save note", err);
    }
  };

  const deleteNote = async (id) => {
    try {
      await fetch(`${API_URL}/api/notes/${id}`, {
        method: "DELETE",
      });

      setNotes((prev) => prev.filter((n) => n.id !== id));

      if (selectedNoteId === id) {
        setSelectedNoteId(null);
        setNoteText("");
      }
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  const renameNote = async (id, newTitle) => {
    try {
      await fetch(`${API_URL}/api/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, title: newTitle } : n
        )
      );

      if (selectedNoteId === id) setNoteTitle(newTitle);
    } catch (err) {
      console.error("renameNote error", err);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const newUserMsg = { role: "user", content: trimmed };
    const newHistory = [...messages, newUserMsg];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          noteId: selectedNoteId,
          noteContext: noteText.slice(0, 4000),
        }),
      });

      const data = await res.json();
      const reply = data.reply || "Empty response.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError("Could not reach backend.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!selectedNoteId || isLoading) return;
    
    const confirmed = window.confirm("Clear chat history with Bob for this note?");
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_URL}/api/chat/clear?noteId=${selectedNoteId}`, {
        method: "POST",
      });

      if (res.ok) {
        setMessages([]);
      } else {
        setError("Failed to clear chat.");
      }
    } catch (err) {
      setError("Could not reach backend.");
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedNoteId || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/notes/${selectedNoteId}/summary`, {
        method: "POST",
      });

      const data = await res.json();
      
      if (data.success) {
        const summaryContent = data.markdown || data.summary;
        
        // Add workflow result to chat as assistant message
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: summaryContent,
        }]);
        
        // Save to Durable Object
        await fetch(`${API_URL}/api/chat/store`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: selectedNoteId,
            role: "assistant",
            content: summaryContent,
          }),
        });
      } else {
        setError(data.error || "Failed to generate summary");
      }
    } catch (err) {
      setError("Could not generate summary.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!selectedNoteId || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/notes/${selectedNoteId}/questions`, {
        method: "POST",
      });

      const data = await res.json();
      
      if (data.success) {
        const questionsContent = data.markdown;
        
        // Add workflow result to chat as assistant message
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: questionsContent,
          },
        ]);
        
        // Save to Durable Object
        await fetch(`${API_URL}/api/chat/store`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: selectedNoteId,
            role: "assistant",
            content: questionsContent,
          }),
        });
      } else {
        setError(data.error || "Failed to generate questions");
      }
    } catch (err) {
      setError("Could not generate questions.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes dot1 {
            0%, 100% { opacity: 0; }
            33% { opacity: 1; }
          }
          @keyframes dot2 {
            0%, 33%, 100% { opacity: 0; }
            66% { opacity: 1; }
          }
          @keyframes dot3 {
            0%, 66% { opacity: 0; }
            100% { opacity: 1; }
          }
          .thinking-dots {
            display: inline-block;
          }
          .thinking-dots .dot1 { animation: dot1 1.5s infinite; }
          .thinking-dots .dot2 { animation: dot2 1.5s infinite; }
          .thinking-dots .dot3 { animation: dot3 1.5s infinite; }
        `}
      </style>
      <div style={rootStyle}>
        {/* Sidebar */}
        <aside style={leftSidebarStyle}>
        <div style={sidebarHeaderStyle}>Notex</div>
        <button style={primaryButtonStyle} onClick={handleNewNote}>
          New note
        </button>

        <div style={notesListContainerStyle}>
          {notes.map((note) => {
            const isSelected = note.id === selectedNoteId;
            return (
              <div
                key={note.id}
                onClick={() => {
                  selectNote(note.id, note.title);
                  setRenamingNoteId(null);
                }}
                style={{
                  ...noteListItemStyle,
                  backgroundColor: isSelected ? "#1d4ed8" : "transparent",
                  color: isSelected ? "white" : "#e5e7eb",
                }}
              >
                {/* Title or rename input */}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  {renamingNoteId === note.id ? (
                    <input
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onBlur={() => {
                        renameNote(note.id, renameInput || "Untitled");
                        setRenamingNoteId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renameNote(note.id, renameInput || "Untitled");
                          setRenamingNoteId(null);
                        }
                      }}
                      autoFocus
                      style={{
                        width: "80%",
                        padding: "2px 4px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "0.85rem",
                      }}
                    />
                  ) : (
                    <span>{note.title}</span>
                  )}
                </div>

                {/* Icons */}
                <div style={{ display: "flex", gap: "6px", marginLeft: "8px" }}>
                  <Pencil
                    size={16}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingNoteId(note.id);
                      setRenameInput(note.title);
                    }}
                    style={{ cursor: "pointer", opacity: 0.7 }}
                  />
                  <Trash2
                    size={16}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNote(note.id);
                    }}
                    style={{ cursor: "pointer", opacity: 0.7 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Center Editor */}
      <main style={editorStyle}>
        {selectedNoteId ? (
          <>
            {/* Toolbar */}
            <div style={toolbarStyle}>
              {/* Style Dropdown */}
              <div style={{ position: 'relative' }}>
                <button style={toolbarButtonStyle} onClick={() => setOpenDropdown(openDropdown === 'style' ? null : 'style')}>
                  Style ▾
                </button>
                {openDropdown === 'style' && (
                  <div style={dropdownStyle}>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('# ', '')}>Heading 1</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('## ', '')}>Heading 2</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('### ', '')}>Heading 3</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('#### ', '')}>Heading 4</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('> ', '')}>Quote</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('---\n', '')}>Horizontal Rule</button>
                  </div>
                )}
              </div>

              {/* Bold */}
              <button style={toolbarButtonStyle} onClick={() => insertAtCursor('**', '**')} title="Bold">
                <Bold size={16} />
              </button>
              
              {/* Italic */}
              <button style={toolbarButtonStyle} onClick={() => insertAtCursor('*', '*')} title="Italic">
                <Italic size={16} />
              </button>

              {/* Insert Math Dropdown */}
              <div style={{ position: 'relative' }}>
                <button style={toolbarButtonStyle} onClick={() => setOpenDropdown(openDropdown === 'math' ? null : 'math')}>
                  Math ▾
                </button>
                {openDropdown === 'math' && (
                  <div style={dropdownStyle}>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('$', '$')}>Inline Math ($...$)</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('$$\n', '\n$$')}>Block Math ($$...$$)</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('$\\frac{', '}{}$')}>Fraction</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('$\\sum_{', '}^{}$')}>Sum</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('$\\int_{', '}^{}$')}>Integral</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('$\\lim_{', '}$')}>Limit</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('$\\sqrt{', '}$')}>Square Root</button>
                  </div>
                )}
              </div>

              {/* Insert Symbol Dropdown */}
              <div style={{ position: 'relative' }}>
                <button style={toolbarButtonStyle} onClick={() => setOpenDropdown(openDropdown === 'symbol' ? null : 'symbol')}>
                  Symbol ▾
                </button>
                {openDropdown === 'symbol' && (
                  <div style={{...dropdownStyle, width: '320px'}}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                      <button style={{...toolbarButtonStyle, padding: '0.25rem 0.5rem', fontSize: '0.75rem'}} onClick={() => setSymbolCategory('greek')}>Greek</button>
                      <button style={{...toolbarButtonStyle, padding: '0.25rem 0.5rem', fontSize: '0.75rem'}} onClick={() => setSymbolCategory('arrows')}>Arrows</button>
                      <button style={{...toolbarButtonStyle, padding: '0.25rem 0.5rem', fontSize: '0.75rem'}} onClick={() => setSymbolCategory('operators')}>Operators</button>
                      <button style={{...toolbarButtonStyle, padding: '0.25rem 0.5rem', fontSize: '0.75rem'}} onClick={() => setSymbolCategory('relations')}>Relations</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.25rem' }}>
                      {symbols[symbolCategory].map((sym) => (
                        <button key={sym} style={{...dropdownItemStyle, padding: '0.5rem', textAlign: 'center'}} onClick={() => insertAtCursor(sym, '')}>
                          {sym}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Insert Link */}
              <button style={toolbarButtonStyle} onClick={() => insertAtCursor('[', '](url)')} title="Insert Link">
                Link
              </button>

              {/* Insert Citation */}
              <div style={{ position: 'relative' }}>
                <button style={toolbarButtonStyle} onClick={() => setOpenDropdown(openDropdown === 'citation' ? null : 'citation')}>
                  Citation ▾
                </button>
                {openDropdown === 'citation' && (
                  <div style={dropdownStyle}>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('[^1]', '')}>Footnote Reference</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('\n[^1]: ', '')}>Footnote Definition</button>
                    <button style={dropdownItemStyle} onClick={() => insertAtCursor('> ', '\n> — Author')}>Blockquote Citation</button>
                  </div>
                )}
              </div>

              {/* Insert Figure/Image */}
              <div style={{ position: 'relative' }}>
                <button style={toolbarButtonStyle} onClick={() => setOpenDropdown(openDropdown === 'figure' ? null : 'figure')}>
                  Figure ▾
                </button>
                {openDropdown === 'figure' && (
                  <div style={dropdownStyle}>
                    <button 
                      style={{...dropdownItemStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: uploadingImage ? 0.5 : 1}} 
                      onClick={() => {
                        if (!uploadingImage) {
                          fileInputRef.current?.click();
                          setOpenDropdown(null);
                        }
                      }}
                      disabled={uploadingImage}
                    >
                      <Upload size={16} /> {uploadingImage ? 'Uploading...' : 'Upload from Computer'}
                    </button>
                    <button style={{...dropdownItemStyle, display: 'flex', alignItems: 'center', gap: '0.5rem'}} onClick={() => {
                      const url = prompt('Enter direct image URL:\n\nMust end with .jpg, .png, .gif, .webp, .svg\nExample: https://example.com/image.png');
                      if (url) {
                        // Validate URL
                        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
                        if (!imageExtensions.test(url) && !url.startsWith('data:image/')) {
                          alert('Invalid image URL. Please use a direct link to an image file.\n\nValid examples:\n• https://example.com/photo.jpg\n• https://i.imgur.com/abc123.png');
                          return;
                        }
                        const alt = prompt('Enter image description (optional):') || 'image';
                        insertAtCursor(`![${alt}](${url})`, '');
                      }
                    }}>
                      <Link size={16} /> Insert from URL
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
              </div>

              {/* Insert Table */}
              <div style={{ position: 'relative' }}>
                <button style={toolbarButtonStyle} onClick={() => setOpenDropdown(openDropdown === 'table' ? null : 'table')}>
                  Table ▾
                </button>
                {openDropdown === 'table' && (
                  <div style={{...dropdownStyle, padding: '1rem'}}>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                      {tableHover.rows} × {tableHover.cols} Table
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(8, 24px)',
                        gap: '4px',
                      }}
                      onMouseLeave={() => setTableHover({ rows: 0, cols: 0 })}
                    >
                      {Array(8).fill(null).map((_, row) =>
                        Array(8).fill(null).map((_, col) => (
                          <div
                            key={`${row}-${col}`}
                            style={{
                              width: '24px',
                              height: '24px',
                              border: '1px solid #cbd5e1',
                              backgroundColor: (row < tableHover.rows && col < tableHover.cols) ? '#3b82f6' : 'white',
                              cursor: 'pointer',
                              transition: 'background-color 0.1s',
                            }}
                            onMouseEnter={() => setTableHover({ rows: row + 1, cols: col + 1 })}
                            onClick={() => {
                              insertAtCursor(generateTable(row + 1, col + 1), '');
                              setTableHover({ rows: 0, cols: 0 });
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1 }} />
              
              {/* Chat Toggle */}
              <button
                style={{...toolbarButtonStyle, backgroundColor: showChat ? '#2563eb' : 'white', color: showChat ? 'white' : '#475569', position: 'relative'}}
                onClick={() => setShowChat(!showChat)}
                title="Toggle AI Chat"
              >
                <MessageCircle size={16} />
                <Sparkles size={10} style={{ position: 'absolute', top: '4px', right: '4px' }} />
              </button>
              
              {/* PDF Toggle */}
              <button 
                style={{...toolbarButtonStyle, backgroundColor: showPdf ? '#2563eb' : 'white', color: showPdf ? 'white' : '#475569'}} 
                onClick={() => {
                  if (!showPdf) {
                    generatePdf();
                  } else {
                    setShowPdf(false);
                  }
                }} 
                title="Toggle PDF Preview"
              >
                {showPdf ? 'Show HTML' : 'Show PDF'}
              </button>
            </div>

            {/* Split Editor and Preview */}
            <div style={splitContainerStyle}>
              {/* Markdown Editor */}
              <div style={editorPanelStyle}>
                <div style={panelLabelStyle}>Markdown Editor</div>
                <textarea
                  ref={editorRef}
                  style={editorTextareaStyle}
                  placeholder="Write your notes here…"
                  value={noteText}
                  onChange={(e) => {
                    setNoteText(e.target.value);
                    saveNote({ content: e.target.value });
                  }}
                />
              </div>

              {/* Rendered Preview */}
              <div style={previewPanelStyle}>
                <div style={panelLabelStyle}>{showPdf ? 'PDF Preview' : 'Preview'}</div>
                {showPdf && pdfUrl ? (
                  <iframe
                    src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                    style={{
                      flex: 1,
                      width: '100%',
                      border: 'none',
                      backgroundColor: '#525252',
                    }}
                    title="PDF Preview"
                  />
                ) : (
                  <div ref={previewRef} style={previewContentStyle}>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex, rehypeHighlight]}
                      components={{
                        img: ({node, ...props}) => (
                          <img
                            {...props}
                            style={{
                              maxWidth: '100%',
                              height: 'auto',
                              borderRadius: '8px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                              display: 'block',
                              margin: '1rem 0',
                            }}
                            onError={(e) => {
                              e.target.alt = `❌ Failed to load: ${props.alt || 'image'}`;
                              e.target.style.border = '2px dashed #ef4444';
                              e.target.style.padding = '1rem';
                              e.target.style.color = '#ef4444';
                            }}
                          />
                        ),
                      }}
                    >
                      {noteText || '*No content yet*'}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={{ color: "#475569", padding: "1rem" }}>
            Select or create a note to begin.
          </div>
        )}
      </main>

      {/* Right AI Panel */}
      {showChat && (
        <section style={aiPanelStyle}>
          <div style={aiHeaderStyle}>Ask me anything!</div>

        {/* Workflow preset buttons */}
        <div style={workflowButtonsStyle}>
          <button
            style={workflowButtonStyle}
            onClick={handleGenerateSummary}
            disabled={isLoading || !selectedNoteId}
            title="Generate a summary of this note"
          >
            <FileText size={16} style={{ marginRight: '0.5rem' }} />
            Generate Summary
          </button>
          <button
            style={workflowButtonStyle}
            onClick={handleGenerateQuestions}
            disabled={isLoading || !selectedNoteId}
            title="Create study questions from this note"
          >
            <HelpCircle size={16} style={{ marginRight: '0.5rem' }} />
            Create Study Questions
          </button>
        </div>

        <div style={chatBoxStyle}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                marginBottom: "0.75rem",
                textAlign: m.role === "user" ? "right" : "left",
              }}
            >
              {m.role === "assistant" && (
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", marginBottom: "0.25rem", marginLeft: "0.25rem" }}>
                  Bob
                </div>
              )}
              <div
                style={{
                  display: "inline-block",
                  maxWidth: "85%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.75rem",
                  backgroundColor:
                    m.role === "user" ? "#2563eb" : "#f1f5f9",
                  color: m.role === "user" ? "white" : "#0f172a",
                  textAlign: "left",
                  wordWrap: "break-word",
                }}
              >
                {m.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  >
                    {m.content}
                  </ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div style={{ textAlign: "left", marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", marginBottom: "0.25rem", marginLeft: "0.25rem" }}>
                Bob
              </div>
              <div
                style={{
                  display: "inline-block",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.75rem",
                  backgroundColor: "#f1f5f9",
                  color: "#64748b",
                  fontStyle: "italic",
                }}
              >
                Bob is thinking<span className="thinking-dots"><span className="dot1">.</span><span className="dot2">.</span><span className="dot3">.</span></span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ color: "red", fontSize: "0.8rem" }}>{error}</div>
        )}

        <form onSubmit={handleSend} style={chatFormStyle}>
          <input
            type="text"
            value={input}
            placeholder="Ask Bob about this note…"
            onChange={(e) => setInput(e.target.value)}
            style={chatInputStyle}
          />
          <button 
            type="button"
            onClick={handleClearChat} 
            style={clearChatButtonStyle} 
            disabled={isLoading || messages.length === 0}
          >
            Clear Chat
          </button>
          <button style={sendButtonStyle} disabled={isLoading}>
            {isLoading ? "…" : "Send"}
          </button>
        </form>
        </section>
      )}
    </div>
    </>
  );
}


const rootStyle = {
  display: "flex",
  width: "100vw",
  height: "100vh",
  backgroundColor: "#e5e7eb",
  fontFamily: "system-ui, sans-serif",
  overflow: "hidden",
  position: "fixed",
  top: 0,
  left: 0,
};

const leftSidebarStyle = {
  width: "250px",
  minWidth: "250px",
  backgroundColor: "#0f172a",
  color: "white",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  overflowY: "auto",
};

const sidebarHeaderStyle = {
  fontSize: "1.25rem",
  fontWeight: 700,
};

const notesListContainerStyle = {
  marginTop: "0.5rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  overflowY: "auto",
  flex: 1,
};

const noteListItemStyle = {
  padding: "0.5rem 0.6rem",
  borderRadius: "0.45rem",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const primaryButtonStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.5rem",
  border: "none",
  backgroundColor: "#22c55e",
  color: "#022c22",
  fontWeight: 600,
  cursor: "pointer",
};

const editorStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  backgroundColor: "#f8fafc",
};

const editorTextareaStyle = {
  width: "100%",
  flex: 1,
  resize: "none",
  padding: "1rem",
  fontFamily: "'Fira Code', 'Consolas', monospace",
  border: "none",
  backgroundColor: "white",
  fontSize: "0.9rem",
  overflow: "auto",
  boxSizing: "border-box",
  outline: "none",
  lineHeight: "1.6",
};

const aiPanelStyle = {
  width: "350px",
  minWidth: "350px",
  padding: "1rem",
  backgroundColor: "white",
  borderLeft: "1px solid #cbd5e1",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  maxHeight: "100vh",
};

const aiHeaderStyle = {
  fontSize: "1rem",
  fontWeight: 700,
  marginBottom: "0.5rem",
};

const chatBoxStyle = {
  flex: 1,
  overflowY: "auto",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  padding: "0.75rem",
  borderRadius: "0.75rem",
  marginBottom: "0.5rem",
  minHeight: 0,
};

const chatFormStyle = {
  display: "flex",
  gap: "0.5rem",
};

const chatInputStyle = {
  flex: 1,
  padding: "0.5rem",
  borderRadius: "0.5rem",
  border: "1px solid #cbd5e1",
};

const sendButtonStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.5rem",
  backgroundColor: "#2563eb",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const clearChatButtonStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.5rem",
  backgroundColor: "#64748b",
  color: "white",
  border: "none",
  cursor: "pointer",
  marginRight: "0.5rem",
};

const workflowButtonsStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  marginBottom: "0.75rem",
  paddingBottom: "0.75rem",
  borderBottom: "1px solid #e2e8f0",
};

const workflowButtonStyle = {
  padding: "0.6rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid #cbd5e1",
  backgroundColor: "white",
  color: "#1e293b",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "left",
  transition: "all 0.2s",
  display: "flex",
  alignItems: "center",
};

const toolbarStyle = {
  display: "flex",
  gap: "0.5rem",
  padding: "0.75rem 1rem",
  backgroundColor: "white",
  borderBottom: "1px solid #e2e8f0",
  flexWrap: "wrap",
};

const toolbarButtonStyle = {
  padding: "0.5rem 0.75rem",
  border: "1px solid #cbd5e1",
  borderRadius: "0.375rem",
  backgroundColor: "white",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.875rem",
  fontWeight: 500,
  transition: "all 0.2s",
  color: "#475569",
  whiteSpace: "nowrap",
};

const dropdownStyle = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: "0.25rem",
  backgroundColor: "white",
  border: "1px solid #cbd5e1",
  borderRadius: "0.375rem",
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
  zIndex: 1000,
  minWidth: "200px",
  maxHeight: "400px",
  overflowY: "auto",
  padding: "0.5rem",
};

const dropdownItemStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "none",
  backgroundColor: "transparent",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "0.875rem",
  borderRadius: "0.25rem",
  color: "#1e293b",
  transition: "background-color 0.15s",
};

const splitContainerStyle = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
};

const editorPanelStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  borderRight: "1px solid #e2e8f0",
  overflow: "hidden",
};

const previewPanelStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  backgroundColor: "white",
};

const panelLabelStyle = {
  padding: "0.5rem 1rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#64748b",
  backgroundColor: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const previewContentStyle = {
  flex: 1,
  padding: "1.5rem",
  overflow: "auto",
  fontFamily: "system-ui, sans-serif",
  lineHeight: "1.7",
  fontSize: "0.95rem",
  color: "#1e293b",
  boxSizing: "border-box",
  minHeight: 0,
};

export default App;