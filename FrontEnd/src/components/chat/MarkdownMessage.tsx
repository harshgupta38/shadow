import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

function compactMarkdown(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    // Common LLM pattern: ordered marker on its own line ("1."), then content.
    .replace(/(^|\n)(\d+\.)\s*\n+(?=\S)/g, "$1$2 ")
    // Trim excessive blank blocks while keeping paragraph separation.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const compact = compactMarkdown(content);

  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {compact}
      </ReactMarkdown>
    </div>
  );
}
