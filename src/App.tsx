import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { Settings, Key, Link2, Monitor, Cpu, CheckCircle, MessageSquare } from "lucide-react";

export default function App() {
  const [endpoint, setEndpoint] = useState("https://api.openai.com/v1/chat/completions");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [shortcutText, setShortcutText] = useState("Ctrl+Shift+KeyO");
  const [chatShortcutText, setChatShortcutText] = useState("Ctrl+Shift+KeyI");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableStream, setEnableStream] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  const handleShortcutKeyDown = (setter: (val: string) => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const keys: string[] = [];
    
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    if (e.metaKey) keys.push("Super");
    
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
    
    keys.push(e.code);
    setter(keys.join("+"));
  };

  const formatShortcut = (s: string) => s.replace(/Key([A-Z])/g, '$1').replace(/Digit([0-9])/g, '$1');

  useEffect(() => {
    async function loadSettings() {
      const store = await load("settings.json");
      const storedEndpoint = await store.get<{ value: string }>("endpoint");
      if (storedEndpoint?.value) setEndpoint(storedEndpoint.value);

      const storedKey = await store.get<{ value: string }>("apiKey");
      if (storedKey?.value) setApiKey(storedKey.value);

      const storedModel = await store.get<{ value: string }>("model");
      if (storedModel?.value) setModel(storedModel.value);

      const storedShortcut = await store.get<{ value: string }>("shortcutText");
      if (storedShortcut?.value) setShortcutText(storedShortcut.value);

      const storedChatShortcut = await store.get<{ value: string }>("chatShortcutText");
      if (storedChatShortcut?.value) setChatShortcutText(storedChatShortcut.value);

      const storedSys = await store.get<{ value: string }>("systemPrompt");
      if (storedSys?.value) setSystemPrompt(storedSys.value);

      const storedUser = await store.get<{ value: string }>("userPrompt");
      if (storedUser?.value) setUserPrompt(storedUser.value);

      const storedThink = await store.get<{ value: boolean }>("enableThinking");
      if (storedThink !== null && storedThink !== undefined) setEnableThinking(storedThink.value);

      const storedStream = await store.get<{ value: boolean }>("enableStream");
      if (storedStream !== null && storedStream !== undefined) setEnableStream(storedStream.value);
    }
    loadSettings();
  }, []);

  const saveSettings = async () => {
    const store = await load("settings.json");
    await store.set("endpoint", { value: endpoint });
    await store.set("apiKey", { value: apiKey });
    await store.set("model", { value: model });
    await store.set("shortcutText", { value: shortcutText });
    await store.set("chatShortcutText", { value: chatShortcutText });
    await store.set("systemPrompt", { value: systemPrompt });
    await store.set("userPrompt", { value: userPrompt });
    await store.set("enableThinking", { value: enableThinking });
    await store.set("enableStream", { value: enableStream });
    await store.save();

    try {
      await invoke("register_shortcuts", { 
        captureShortcut: shortcutText,
        chatShortcut: chatShortcutText 
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (e: any) {
      console.error(e);
      alert("Lỗi khi đăng ký phím tắt: " + e);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden shadow-black/50">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border-b border-zinc-800 p-6 flex items-center gap-4">
          <div className="bg-blue-600/20 p-3 rounded-2xl flex items-center justify-center">
            <Monitor className="text-blue-400 w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">AI On Screen</h1>
            <p className="text-zinc-400 text-sm mt-1">Cài đặt kết nối AI và phím tắt</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Link2 className="w-4 h-4 text-zinc-500" />
              API Endpoint
            </label>
            <input 
              type="text" 
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm"
              placeholder="https://api.openai.com/v1/chat/completions"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Key className="w-4 h-4 text-zinc-500" />
              API Key
            </label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm"
              placeholder="sk-..."
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Cpu className="w-4 h-4 text-zinc-500" />
              Model Text/Vision
            </label>
            <input 
              type="text" 
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm"
              placeholder="gpt-4o"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Settings className="w-4 h-4 text-zinc-500" />
                Phím tắt chụp
              </label>
              <input 
                type="text" 
                value={formatShortcut(shortcutText)}
                readOnly
                onKeyDown={handleShortcutKeyDown(setShortcutText)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm cursor-pointer"
                placeholder="Ấn tổ hợp phím..."
              />
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <MessageSquare className="w-4 h-4 text-zinc-500" />
                Phím tắt chat
              </label>
              <input 
                type="text" 
                value={formatShortcut(chatShortcutText)}
                readOnly
                onKeyDown={handleShortcutKeyDown(setChatShortcutText)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm cursor-pointer"
                placeholder="Ấn tổ hợp phím..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-800/50">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                System Prompt (Định hướng)
              </label>
              <textarea 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans text-sm h-28 resize-none custom-scrollbar"
                placeholder="Mặc định: Bạn là trợ lý AI hữu ích..."
              />
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                User Prompt Template (Bổ sung)
              </label>
              <textarea 
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans text-sm h-28 resize-none custom-scrollbar"
                placeholder="Ví dụ: Phân tích ảnh này. Dùng biến {prompt}"
              />
            </div>

            <div className="col-span-1 md:col-span-2 flex flex-col gap-3 pt-2">
              <label className="flex items-center gap-3 text-sm font-medium text-zinc-300 cursor-pointer hover:text-white transition-colors">
                <input 
                  type="checkbox" 
                  checked={enableThinking}
                  onChange={(e) => setEnableThinking(e.target.checked)}
                  className="w-4 h-4 cursor-pointer accent-blue-500"
                />
                Cho phép AI tư duy ngầm (Thinking) - Bỏ tích để ép AI trả lời ngay lập tức
              </label>

              <label className="flex items-center gap-3 text-sm font-medium text-zinc-300 cursor-pointer hover:text-white transition-colors">
                <input 
                  type="checkbox" 
                  checked={enableStream}
                  onChange={(e) => setEnableStream(e.target.checked)}
                  className="w-4 h-4 cursor-pointer accent-blue-500"
                />
                Respond Streaming (Chữ hiện ra dần dần thay vì đợi chờ)
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-end">
          <button 
            onClick={saveSettings}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/20 active:scale-95 duration-200"
          >
            {isSaved ? <CheckCircle className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
            {isSaved ? "Đã lưu" : "Lưu cài đặt"}
          </button>
        </div>
      </div>
    </div>
  );
}
