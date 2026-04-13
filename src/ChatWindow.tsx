import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { Send, Loader2, X, ImagePlus, Trash2, Minus } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './CodeBlock';

export default function ChatWindow() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: string, content: any }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
      const storedStream = await store.get<{ value: boolean }>("enableStream");
      const enableStreamState = storedStream !== null && storedStream !== undefined ? storedStream.value : true;
      const sysPromptVal = storedSys?.value || "";
      
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

      if (!enableStreamState) {
        try {
          const response = await invoke<string>("ask_ai", {
            endpoint: endpointValue,
            apiKey: apiKeyValue,
            model: modelValue,
            messages: newMessages,
            enableThinking: enableThinkingState
          });
    
          let finalResponse = response;

          if (!enableThinkingState) {
            finalResponse = finalResponse.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
          } else {
            finalResponse = finalResponse.replace(/<think[^>]*>([\s\S]*?)<\/think>/gi, (_match: string, p1: string) => {
                return `🤔 **Quá trình suy nghĩ:**\n${p1.trim().split('\n').map((line: string) => `> ${line}`).join('\n')}\n\n---\n\n`;
            });
          }
    
          setChatHistory([...newMessages, { role: "assistant", content: finalResponse }]);
        } catch (err: any) {
          setError(err.toString());
        } finally {
          setLoading(false);
        }
      } else {
        setIsStreaming(true);
        setStreamingContent("");
        setStreamingReasoning("");
        
        let curContent = "";
        let curReasoning = "";

        const unlistenChunk = await listen<{ content: string; reasoning: string }>("ai-stream-chunk", (event) => {
            const { content, reasoning } = event.payload;
            if (content) curContent += content;
            if (reasoning) curReasoning += reasoning;
            setStreamingContent(curContent);
            setStreamingReasoning(curReasoning);
        });

        const unlistenDone = await listen("ai-stream-done", () => {
            unlistenChunk();
            unlistenDone();
            setIsStreaming(false);

            let finalResponse = curContent;
            if (enableThinkingState && curReasoning) {
                const formattedReasoning = `🤔 **Quá trình suy nghĩ:**\n${curReasoning.trim().split('\n').map((line: string) => `> ${line}`).join('\n')}\n\n---\n\n`;
                finalResponse = formattedReasoning + finalResponse;
            }
            
            setChatHistory(prev => [...prev, { role: "assistant", content: finalResponse }]);
            setStreamingContent("");
            setStreamingReasoning("");
            setLoading(false);
        });

        try {
            await invoke("ask_ai_stream", {
                endpoint: endpointValue,
                apiKey: apiKeyValue,
                model: modelValue,
                messages: newMessages,
                enableThinking: enableThinkingState
            });
        } catch(err: any) {
            unlistenChunk();
            unlistenDone();
            setIsStreaming(false);
            setError(err.toString());
            setLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.toString());
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => invoke("minimize_to_tray", { label: "chat" }).catch(console.error)}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-all cursor-pointer"
              title="Thu nhỏ"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => invoke("hide_prompt").catch(console.error)}
              className="p-1 text-zinc-400 hover:text-white hover:bg-red-500/80 rounded-lg transition-all cursor-pointer"
              title="Đóng"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
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
            <textarea
              ref={inputRef}
              autoFocus
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Nhập tin nhắn... (Ctrl+V để dán ảnh)"
              rows={1}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all resize-none overflow-y-auto"
              style={{ maxHeight: '120px' }}
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
            onClick={() => invoke("minimize_to_tray", { label: "chat" }).catch(console.error)}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-all cursor-pointer"
            title="Thu nhỏ"
          >
            <Minus className="w-3.5 h-3.5" />
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
            <div className={`p-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white max-w-[85%]' : 'bg-zinc-800 text-zinc-300 max-w-[95%]'} prose prose-sm prose-invert leading-relaxed break-words shrink-0`}>
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
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {msg.content || ""}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {(isStreaming || (loading && !isStreaming)) && (
          <div className="flex items-center justify-start">
            <div className={`p-3 rounded-2xl max-w-[95%] bg-zinc-800 text-zinc-300 prose prose-sm prose-invert leading-relaxed break-words shrink-0`}>
              {isStreaming ? (
                <>
                  {streamingReasoning && (
                     <div className="mb-4 text-zinc-400 italic border-l-2 border-blue-500/50 pl-3 pr-2">
                       <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1">
                         <Loader2 className="w-3 h-3 animate-spin" />
                         Đang suy nghĩ...
                       </div>
                       <div className="whitespace-pre-wrap text-xs">{streamingReasoning}</div>
                     </div>
                  )}
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {streamingContent || (streamingReasoning ? "" : "...")}
                  </ReactMarkdown>
                </>
              ) : (
                <div className="flex items-center gap-2 text-zinc-400 p-1 float-animation w-auto">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Đang suy nghĩ...</span>
                </div>
              )}
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
          <textarea
            ref={inputRef}
            autoFocus
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Nhập tin nhắn... (Ctrl+V để dán ảnh)"
            rows={1}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all resize-none overflow-y-auto"
            style={{ maxHeight: '120px' }}
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
