import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { Send, Loader2, X, Maximize, Minus } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './CodeBlock';

export default function Prompt() {
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCropped, setHasCropped] = useState(false);
  
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: string, content: any }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");

  const [chatOnlyMode, setChatOnlyMode] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [chatPos, setChatPos] = useState<{ x: number, y: number } | null>(null);
  const [isDraggingChat, setIsDraggingChat] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  useEffect(() => {
    if (isDraggingChat) {
      const handleMove = (e: MouseEvent) => {
        setChatPos({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      };
      const handleUp = () => setIsDraggingChat(false);
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
    }
  }, [isDraggingChat, dragOffset]);

  useEffect(() => {
    async function init() {
      try {
        const base64Img = await invoke<string>("get_last_screenshot");
        setFullImage(base64Img);
      } catch (err) {
        console.error("Failed to get screenshot:", err);
      }
    }
    init();

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (hasCropped || chatHistory.length > 0 || loading || chatOnlyMode) return;
    setStartX(e.clientX);
    setStartY(e.clientY);
    setCurrentX(e.clientX);
    setCurrentY(e.clientY);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || hasCropped) return;
    setCurrentX(e.clientX);
    setCurrentY(e.clientY);
  };

  const handleMouseUp = () => {
    if (!isDragging || hasCropped) return;
    setIsDragging(false);
    
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    if (width > 20 && height > 20) {
      cropImage();
      setHasCropped(true);
    } else {
      setHasCropped(false);
    }
  };

  const cropImage = () => {
    if (!canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    canvas.width = width;
    canvas.height = height;

    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    ctx.drawImage(imgRef.current, 
      (x / winWidth) * imgRef.current.naturalWidth, 
      (y / winHeight) * imgRef.current.naturalHeight, 
      (width / winWidth) * imgRef.current.naturalWidth, 
      (height / winHeight) * imgRef.current.naturalHeight, 
      0, 0, width, height);

    setCroppedImage(canvas.toDataURL("image/jpeg", 0.9));
  };

  const transitionToChatOnly = async () => {
    const chatWidth = 420;
    const chatHeight = 560;
    // Center the chat window on screen
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const chatX = Math.max(0, Math.round((screenWidth - chatWidth) / 2));
    const chatY = Math.max(0, Math.round((screenHeight - chatHeight) / 2));
    
    try {
      await invoke("resize_prompt_window", {
        x: chatX,
        y: chatY,
        width: chatWidth,
        height: chatHeight,
      });
      setChatOnlyMode(true);
    } catch (err) {
      console.error("Failed to resize window:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((chatHistory.length === 0 && !croppedImage && !fullImage) || loading || (chatHistory.length > 0 && !prompt.trim())) return;

    setLoading(true);
    setError(null);

    try {
      const store = await load("settings.json");
      const endpoint = await store.get<{ value: string }>("endpoint");
      const apiKey = await store.get<{ value: string }>("apiKey");
      const model = await store.get<{ value: string }>("model");
      const storedSys = await store.get<{ value: string }>("systemPrompt");
      const storedUser = await store.get<{ value: string }>("userPrompt");
      const storedThink = await store.get<{ value: boolean }>("enableThinking");

      const imgData = croppedImage || fullImage;

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
      
      const userPromptTpl = storedUser?.value || "{prompt}";
      
      const promptContent = prompt.trim() || " ";
      let newMessages = [...chatHistory];

      if (newMessages.length === 0) {
        if (sysPromptVal.trim()) {
          newMessages.push({ role: "system", content: sysPromptVal });
        }
        const finalPrompt = userPromptTpl.includes("{prompt}") 
                            ? userPromptTpl.replace("{prompt}", promptContent) 
                            : `${userPromptTpl}\n\n${promptContent}`;
        newMessages.push({
          role: "user",
          content: [
            { type: "text", text: finalPrompt },
            { type: "image_url", image_url: { url: imgData } }
          ]
        });
      } else {
        if (promptContent.trim()) {
          newMessages.push({ role: "user", content: promptContent });
        }
      }

      setChatHistory(newMessages);
      setPrompt("");

      // Transition to chat-only mode on first send
      if (!chatOnlyMode) {
        await transitionToChatOnly();
      }

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

  const resetSelection = () => {
    setHasCropped(false);
    setCroppedImage(null);
    setChatHistory([]);
    setChatPos(null);
    setPrompt("");
    setChatOnlyMode(false);
    // Re-enter fullscreen for new selection
    invoke("hide_prompt").catch(console.error);
  };
  
  if (!fullImage) return null;

  const rectX = Math.min(startX, currentX);
  const rectY = Math.min(startY, currentY);
  const rectW = Math.abs(currentX - startX);
  const rectH = Math.abs(currentY - startY);

  const defaultChatX = Math.min((rectW > 0 ? rectX + rectW : 0) + 20, window.innerWidth - 420);
  const defaultChatY = Math.max(20, Math.min(rectH > 0 ? rectY : 0, window.innerHeight - 400));
  const currentChatX = chatPos ? chatPos.x : defaultChatX;
  const currentChatY = chatPos ? chatPos.y : defaultChatY;

  // ============ CHAT-ONLY MODE ============
  if (chatOnlyMode) {
    return (
      <div className="fixed inset-0 flex flex-col bg-zinc-900 font-sans overflow-hidden rounded-2xl border border-zinc-700/50">
        {/* Header with drag handle and close button */}
        <div 
          className="flex items-center justify-between bg-zinc-800/80 px-3 py-2 shrink-0 cursor-grab active:cursor-grabbing border-b border-zinc-700/50"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 bg-zinc-600/50 rounded-full" />
            <span className="text-xs text-zinc-500 select-none">ScreenAI Chat</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => invoke("minimize_to_tray", { label: "prompt" }).catch(console.error)}
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
                    <div className="whitespace-pre-wrap">{typeof msg.content === 'string' ? msg.content : msg.content.find((c:any) => c.type === 'text')?.text}</div>
                    {/* Show cropped image thumbnail in first user message */}
                    {Array.isArray(msg.content) && msg.content.find((c:any) => c.type === 'image_url') && (
                      <img
                        src={msg.content.find((c:any) => c.type === 'image_url')?.image_url?.url}
                        className="mt-2 rounded-lg max-h-40 w-auto cursor-pointer hover:opacity-80 transition-opacity border border-white/20"
                        onClick={() => setPreviewImage(msg.content.find((c:any) => c.type === 'image_url')?.image_url?.url)}
                        alt="Screenshot"
                      />
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

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-2 bg-zinc-900 border-t border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetSelection}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors shrink-0"
              title="Chụp mới"
            >
              <Maximize className="w-4 h-4" />
            </button>
            <textarea
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
              placeholder="Hỏi tiếp..."
              rows={1}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all resize-none overflow-y-auto"
              style={{ maxHeight: '120px' }}
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
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

  // ============ FULLSCREEN SELECTION MODE ============
  return (
    <div className="fixed inset-0 select-none overflow-hidden font-sans" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Background Image */}
      <img ref={imgRef} src={fullImage} className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
      
      {/* Dark overlay when cropping */}
      {(!hasCropped && chatHistory.length === 0) && (
        <div className="absolute inset-0 bg-black/40 cursor-crosshair" />
      )}
      {hasCropped && chatHistory.length === 0 && (
        <div className="absolute inset-0 bg-black/70 transition-colors duration-300" />
      )}

      {/* Selection Box */}
      {(isDragging || hasCropped) && rectW > 0 && rectH > 0 && (
        <div 
          className="absolute border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] overflow-hidden" 
          style={{
            left: rectX, top: rectY, width: rectW, height: rectH,
            boxShadow: hasCropped ? 'none' : '0 0 0 9999px rgba(0,0,0,0.5)'
          }}
        >
          {!hasCropped && (
             <img src={fullImage} 
                  className="absolute max-w-none pointer-events-none" 
                  style={{ width: window.innerWidth, height: window.innerHeight, left: -rectX, top: -rectY }} 
             />
          )}
          {hasCropped && croppedImage && (
             <img src={croppedImage} className="w-full h-full object-fill pointer-events-none" />
          )}
        </div>
      )}

      {/* Hidden Canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Instructions */}
      {!hasCropped && chatHistory.length === 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full backdrop-blur text-sm pointer-events-none animate-pulse">
          Kéo thả để chọn vùng màn hình. (Esc để thoát)
        </div>
      )}

      {/* Close button */}
      <button 
        onClick={() => invoke("hide_prompt").catch(console.error)}
        className="absolute top-4 right-4 bg-black/50 hover:bg-red-500 text-white p-2 rounded-full transition-colors z-50 cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Chat UI when cropped (pre-send, still fullscreen) */}
      {hasCropped && (
        <div 
          className="absolute z-50 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col w-[400px] overflow-hidden"
          style={{
             left: currentChatX,
             top: currentChatY,
             maxHeight: window.innerHeight - 40,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Drag Handle + Close */}
          <div 
             className="h-8 bg-zinc-800/50 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing hover:bg-zinc-800 transition-colors shrink-0"
             onMouseDown={(e) => {
               e.stopPropagation();
               setIsDraggingChat(true);
               const rect = e.currentTarget.parentElement!.getBoundingClientRect();
               setDragOffset({
                 x: e.clientX - rect.left,
                 y: e.clientY - rect.top
               });
             }}
          >
             <div className="w-12 h-1.5 bg-zinc-600/50 rounded-full" />
             <div className="flex items-center gap-1">
               <button
                 onClick={() => invoke("minimize_to_tray", { label: "prompt" }).catch(console.error)}
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

          {/* Result Area */}
          {(chatHistory.length > 0 || loading || error) && (
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-zinc-900/50 min-h-[100px] max-h-[400px] space-y-4">
              {chatHistory.filter(m => m.role !== 'system').map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`p-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white max-w-[85%]' : 'bg-zinc-800 text-zinc-300 max-w-[95%]'} prose prose-sm prose-invert leading-relaxed break-words shrink-0`}>
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{typeof msg.content === 'string' ? msg.content : msg.content.find((c:any) => c.type === 'text')?.text}</div>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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
          )}

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-2 bg-zinc-900 border-t border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetSelection}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors shrink-0"
                title="Chọn lại"
              >
                <Maximize className="w-4 h-4" />
              </button>
              <textarea
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
                placeholder="Hỏi về vùng này..."
                rows={1}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all resize-none overflow-y-auto"
                style={{ maxHeight: '120px' }}
              />
              <button
                type="submit"
                disabled={loading || (chatHistory.length === 0 ? (!croppedImage && !fullImage) : !prompt.trim())}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition-colors shrink-0 cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </div>
      )}

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
