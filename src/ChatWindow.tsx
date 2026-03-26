import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { Send, Loader2, X, ImagePlus, Trash2 } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatWindow() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: string, content: any }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  // Handle compact box auto-resize based on attached images
  useEffect(() => {
    if (!expanded) {
      const targetHeight = attachedImages.length > 0 ? 200 : 110;
      invoke("adjust_chat_window_size", { width: 500.0, height: targetHeight }).catch(console.error);
    }
  }, [attachedImages.length, expanded]);

  // Handle Ctrl+V paste image
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            fileToDataUri(file).then(dataUri => {
              setAttachedImages(prev => [...prev, dataUri]);
            });
          }
          return;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Handle Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewImage) {
          setPreviewImage(null);
        } else {
          invoke("hide_prompt").catch(console.error);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      if (file.type.startsWith("image/")) {
        fileToDataUri(file).then(dataUri => {
          setAttachedImages(prev => [...prev, dataUri]);
        });
      }
    });
    e.target.value = "";
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const expandWindow = async () => {
    if (expanded) return;
    const chatWidth = 420;
    const chatHeight = 560;
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const chatX = Math.max(0, Math.round((screenWidth - chatWidth) / 2));
    const chatY = Math.max(0, Math.round((screenHeight - chatHeight) / 2));
    
    try {
      await invoke("resize_chat_window", {
        x: chatX,
        y: chatY,
        width: chatWidth,
        height: chatHeight,
      });
      setExpanded(true);
    } catch (err) {
      console.error("Failed to resize:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!prompt.trim() && attachedImages.length === 0) return;

    setLoading(true);
    setError(null);

    // Expand window on first send
    if (!expanded) {
      await expandWindow();
    }

    try {
      const store = await load("settings.json");
      const endpoint = await store.get<{ value: string }>("endpoint");
      const apiKey = await store.get<{ value: string }>("apiKey");
      const model = await store.get<{ value: string }>("model");
      const storedSys = await store.get<{ value: string }>("systemPrompt");
      const storedThink = await store.get<{ value: boolean }>("enableThinking");

      let endpointValue = endpoint?.value || "https://api.openai.com/v1/chat/completions";
      if (!endpointValue.endsWith("/chat/completions")) {
        endpointValue = endpointValue.replace(/\/$/, "") + "/chat/completions";
      }
      const apiKeyValue = apiKey?.value || "";
      const modelValue = model?.value || "gpt-4o";

      const enableThinkingState = storedThink !== null && storedThink !== undefined ? storedThink.value : true;
      let sysPromptVal = storedSys?.value || "";
      
      if (!enableThinkingState) {
        sysPromptVal += "\n\nCRITICAL INSTRUCTION: You MUST answer directly and IMMEDIATELY. DO NOT use <think> tags. DO NOT output any reasoning or thought process. Give the final answer outright.";
      }
      
      const promptContent = prompt.trim() || " ";
      let newMessages = [...chatHistory];

      if (newMessages.length === 0 && sysPromptVal.trim()) {
        newMessages.push({ role: "system", content: sysPromptVal });
      }

      if (attachedImages.length > 0) {
        const contentParts: any[] = [
          { type: "text", text: promptContent }
        ];
        for (const img of attachedImages) {
          contentParts.push({
            type: "image_url",
            image_url: { url: img }
          });
        }
        newMessages.push({ role: "user", content: contentParts });
      } else {
        newMessages.push({ role: "user", content: promptContent });
      }

      setChatHistory(newMessages);
      setPrompt("");
      setAttachedImages([]);

      const response = await invoke<string>("ask_ai", {
        endpoint: endpointValue,
        apiKey: apiKeyValue,
        model: modelValue,
        messages: newMessages
      });

      let finalResponse = response;

      if (!enableThinkingState) {
        finalResponse = finalResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      } else {
        finalResponse = finalResponse.replace(/<think>([\s\S]*?)<\/think>/gi, (_match: string, p1: string) => {
            return `🤔 **Quá trình suy nghĩ:**\n${p1.trim().split('\n').map((line: string) => `> ${line}`).join('\n')}\n\n---\n\n`;
        });
      }

      setChatHistory([...newMessages, { role: "assistant", content: finalResponse }]);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    setChatHistory([]);
    setPrompt("");
    setAttachedImages([]);
    setError(null);
  };

  // ============ COMPACT MODE (just input bar) ============
  if (!expanded) {
    return (
      <div className="fixed inset-0 flex flex-col bg-zinc-900 font-sans overflow-hidden rounded-2xl border border-zinc-700/50">
        {/* Compact Header */}
        <div 
          className="flex items-center justify-between bg-zinc-800/80 px-3 py-1.5 shrink-0 cursor-grab active:cursor-grabbing border-b border-zinc-700/50"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <div className="w-6 h-1 bg-zinc-600/50 rounded-full" />
            <span className="text-xs text-zinc-500 select-none">ScreenAI Chat</span>
          </div>
          <button
            onClick={() => invoke("hide_prompt").catch(console.error)}
            className="p-1 text-zinc-400 hover:text-white hover:bg-red-500/80 rounded-lg transition-all cursor-pointer"
            title="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Attached Images Preview (compact) */}
        {attachedImages.length > 0 && (
          <div className="px-3 py-2 bg-zinc-850 border-b border-zinc-800 flex gap-2 overflow-x-auto custom-scrollbar">
            {attachedImages.map((img, idx) => (
              <div key={idx} className="relative shrink-0 group">
                <img 
                  src={img} 
                  className="h-12 w-auto rounded-lg border border-zinc-700"
                  alt="Attached"
                />
                <button
                  onClick={() => removeAttachedImage(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Compact Input */}
        <form onSubmit={handleSubmit} className="p-2 bg-zinc-900 shrink-0 flex-1 flex items-center">
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Thêm ảnh"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <input
              ref={inputRef}
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Nhập tin nhắn... (Ctrl+V để dán ảnh)"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all"
            />
            <button
              type="submit"
              disabled={loading || (!prompt.trim() && attachedImages.length === 0)}
              className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition-colors shrink-0 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ============ EXPANDED MODE (full chat) ============
  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-900 font-sans overflow-hidden rounded-2xl border border-zinc-700/50">
      {/* Header */}
      <div 
        className="flex items-center justify-between bg-zinc-800/80 px-3 py-2 shrink-0 cursor-grab active:cursor-grabbing border-b border-zinc-700/50"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="w-8 h-1 bg-zinc-600/50 rounded-full" />
          <span className="text-xs text-zinc-500 select-none">ScreenAI Chat</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetChat}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-all cursor-pointer"
            title="Chat mới"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => invoke("hide_prompt").catch(console.error)}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-red-500/80 rounded-lg transition-all cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-zinc-900/50 space-y-4">
        {chatHistory.filter(m => m.role !== 'system').map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-2xl max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'} prose prose-sm prose-invert leading-relaxed overflow-hidden break-words shrink-0`}>
              {msg.role === 'user' ? (
                <div>
                  <div className="whitespace-pre-wrap">
                    {typeof msg.content === 'string' 
                      ? msg.content 
                      : msg.content.find((c:any) => c.type === 'text')?.text}
                  </div>
                  {Array.isArray(msg.content) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.content.filter((c:any) => c.type === 'image_url').map((c:any, imgIdx:number) => (
                        <img
                          key={imgIdx}
                          src={c.image_url?.url}
                          className="rounded-lg max-h-32 w-auto cursor-pointer hover:opacity-80 transition-opacity border border-white/20"
                          onClick={() => setPreviewImage(c.image_url?.url)}
                          alt="Attached"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content || ""}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center justify-start">
            <div className="flex items-center gap-2 text-zinc-400 p-3 rounded-2xl bg-zinc-800 float-animation w-auto">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Đang suy nghĩ...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Attached Images Preview */}
      {attachedImages.length > 0 && (
        <div className="px-3 py-2 bg-zinc-850 border-t border-zinc-800 flex gap-2 overflow-x-auto custom-scrollbar">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative shrink-0 group">
              <img 
                src={img} 
                className="h-16 w-auto rounded-lg border border-zinc-700 cursor-pointer hover:opacity-80"
                onClick={() => setPreviewImage(img)}
                alt="Attached"
              />
              <button
                onClick={() => removeAttachedImage(idx)}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-2 bg-zinc-900 border-t border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors shrink-0 cursor-pointer"
            title="Thêm ảnh"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <input
            ref={inputRef}
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Nhập tin nhắn... (Ctrl+V để dán ảnh)"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all"
          />
          <button
            type="submit"
            disabled={loading || (!prompt.trim() && attachedImages.length === 0)}
            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition-colors shrink-0 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>

      {/* Image Preview Lightbox */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <button 
            className="absolute top-3 right-3 p-2 bg-zinc-800/80 text-white hover:bg-red-500 rounded-full transition-colors z-10 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
          >
            <X className="w-5 h-5" />
          </button>
          <img 
            src={previewImage} 
            className="max-w-[95%] max-h-[90%] rounded-lg shadow-2xl object-contain" 
            onClick={(e) => e.stopPropagation()}
            alt="Preview"
          />
        </div>
      )}
    </div>
  );
}
