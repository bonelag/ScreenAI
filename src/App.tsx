import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { Settings, Key, Link2, Monitor, Cpu, CheckCircle } from "lucide-react";

export default function App() {
  const [endpoint, setEndpoint] = useState("https://api.openai.com/v1/chat/completions");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [shortcutText, setShortcutText] = useState("CommandOrControl+Shift+0");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Load existing settings
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
    }
    loadSettings();
  }, []);

  const saveSettings = async () => {
    const store = await load("settings.json");
    await store.set("endpoint", { value: endpoint });
    await store.set("apiKey", { value: apiKey });
    await store.set("model", { value: model });
    await store.set("shortcutText", { value: shortcutText });
    await store.save();

    // Call rust command to re-register shortcut if changed
    try {
      await invoke("register_shortcut", { shortcut: shortcutText });
    } catch (e) {
      console.error(e);
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
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

          <div className="grid grid-cols-2 gap-6">
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
            
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Settings className="w-4 h-4 text-zinc-500" />
                Phím tắt chụp (Global)
              </label>
              <input 
                type="text" 
                value={shortcutText}
                onChange={(e) => setShortcutText(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm"
                placeholder="CommandOrControl+Shift+0"
              />
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
