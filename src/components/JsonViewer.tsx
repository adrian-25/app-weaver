import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

function colorize(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-400'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-primary'; // key
          match = match.slice(0, -1) + ':';
        } else {
          cls = 'text-emerald-400'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-sky-400'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-muted-foreground'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function JsonViewer({ data, title, collapsed = false }: { data: any; title?: string; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  const jsonStr = JSON.stringify(data, null, 2);

  return (
    <div className="rounded-lg border border-border bg-secondary/50 overflow-hidden">
      {title && (
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 px-4 py-2 text-sm font-heading font-medium hover:bg-secondary/80 transition-colors"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {title}
        </button>
      )}
      {open && (
        <pre
          className="overflow-auto p-4 text-xs font-mono leading-relaxed max-h-96"
          dangerouslySetInnerHTML={{ __html: colorize(jsonStr) }}
        />
      )}
    </div>
  );
}