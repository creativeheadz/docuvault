import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownViewProps {
  source: string
  className?: string
}

export function MarkdownView({ source, className }: MarkdownViewProps) {
  return (
    <div className={cn('md-view', className)}>
      <style>{markdownStyles}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}

const markdownStyles = `
  .md-view {
    color: var(--ink);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.65;
  }
  .md-view > *:first-child { margin-top: 0; }
  .md-view > *:last-child { margin-bottom: 0; }

  .md-view h1, .md-view h2, .md-view h3, .md-view h4, .md-view h5, .md-view h6 {
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink);
    font-weight: 400;
    line-height: 1.2;
    margin: 1.6em 0 0.5em;
    font-variation-settings: "opsz" 144, "SOFT" 70, "wght" 420;
  }
  .md-view h1 { font-size: 2em; border-bottom: 1px solid var(--line); padding-bottom: 0.2em; }
  .md-view h2 { font-size: 1.55em; }
  .md-view h3 { font-size: 1.25em; }
  .md-view h4 { font-size: 1.05em; }
  .md-view h5, .md-view h6 { font-size: 0.95em; color: var(--ink-dim); }

  .md-view p { margin: 0.7em 0; color: var(--ink); }
  .md-view a {
    color: var(--ember);
    text-decoration: underline;
    text-decoration-color: var(--ember-glow);
    text-underline-offset: 3px;
  }
  .md-view a:hover { text-decoration-color: var(--ember); }
  .md-view strong { color: var(--ink); font-weight: 600; }
  .md-view em { color: var(--ink-dim); }

  .md-view ul, .md-view ol { margin: 0.6em 0; padding-left: 1.6em; }
  .md-view li { margin: 0.25em 0; }
  .md-view ul li::marker { color: var(--ember); }
  .md-view ol li::marker { color: var(--ink-faint); font-family: var(--mono); font-size: 0.9em; }
  .md-view li > p { margin: 0.2em 0; }

  .md-view blockquote {
    margin: 0.9em 0;
    padding: 0.4em 1em;
    border-left: 3px solid var(--ember);
    background: var(--ember-wash);
    color: var(--ink-dim);
    font-style: italic;
  }
  .md-view blockquote p { margin: 0.3em 0; }

  .md-view code {
    font-family: var(--mono);
    font-size: 0.88em;
    background: var(--bg-3);
    color: var(--ember);
    padding: 0.12em 0.4em;
    border: 1px solid var(--line);
  }
  .md-view pre {
    margin: 0.9em 0;
    padding: 0.9em 1em;
    background: var(--bg-3);
    border: 1px solid var(--line);
    border-left: 3px solid var(--line-hot);
    overflow-x: auto;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .md-view pre code {
    background: none;
    border: none;
    padding: 0;
    color: var(--ink);
    font-size: inherit;
  }

  .md-view hr {
    border: none;
    border-top: 1px solid var(--line);
    margin: 1.6em 0;
  }

  .md-view table {
    width: 100%;
    margin: 0.9em 0;
    border-collapse: collapse;
    font-family: var(--mono);
    font-size: 12.5px;
  }
  .md-view th, .md-view td {
    padding: 0.5em 0.8em;
    border: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }
  .md-view th {
    background: var(--bg-3);
    color: var(--ember);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
  }
  .md-view tr:nth-child(even) td { background: var(--bg-2); }

  .md-view img {
    max-width: 100%;
    border: 1px solid var(--line);
  }

  .md-view input[type="checkbox"] {
    accent-color: var(--ember);
    margin-right: 0.4em;
  }
`
