import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  children: string;
}

export default function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = children;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper relative my-2 rounded-xl border border-zinc-700/50 bg-[#1e1e1e] w-full">
      {/* Sticky header: stays visible while code block is in viewport */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 bg-zinc-800/95 backdrop-blur-sm border-b border-zinc-700/50 rounded-t-xl">
        <span className="text-xs text-zinc-400 font-mono select-none">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-all px-2 py-1 rounded-md hover:bg-zinc-700/50 cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto custom-scrollbar rounded-b-xl">
        <SyntaxHighlighter
          language={language || 'text'}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            fontSize: '0.8125rem',
            lineHeight: '1.6',
          }}
          codeTagProps={{
            style: {
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            }
          }}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// Shared markdown components config for ReactMarkdown
export const markdownComponents = {
  pre({ children }: any) {
    // Unwrap <pre> so CodeBlock handles its own wrapper
    return <>{children}</>;
  },
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    const isBlock = match || codeString.includes('\n');

    if (isBlock) {
      return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
    }
    // Inline code
    return (
      <code
        className="bg-zinc-700/60 text-zinc-200 px-1.5 py-0.5 rounded text-[0.85em] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }
};
