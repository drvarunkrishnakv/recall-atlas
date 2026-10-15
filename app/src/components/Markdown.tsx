import { isValidElement, lazy, Suspense, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router";
import { termsToLinks } from "../lib/content-parse";
import { Term } from "./Term";
import { Chart } from "./Chart";

const Mermaid = lazy(() => import("./Mermaid"));

const urlTransform = (url: string) => (url.startsWith("card:") ? url : defaultUrlTransform(url));

function codeOf(children: ReactNode): { lang: string; text: string } | null {
  if (!isValidElement(children)) return null;
  const props = (children as ReactElement<{ className?: string; children?: ReactNode }>).props;
  const lang = /language-(\w+)/.exec(props.className ?? "")?.[1] ?? "";
  return { lang, text: String(props.children ?? "").replace(/\n$/, "") };
}

const components: Components = {
  a({ href = "", children }) {
    if (href.startsWith("card:")) return <Term cardId={href.slice(5)}>{children}</Term>;
    if (/^https?:/.test(href))
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    return <Link to={href}>{children}</Link>;
  },
  table({ children }) {
    return (
      <div className="tablewrap">
        <table>{children}</table>
      </div>
    );
  },
  pre({ children }) {
    const code = codeOf(children);
    if (code?.lang === "chart") return <Chart source={code.text} />;
    if (code?.lang === "mermaid")
      return (
        <Suspense fallback={<div className="mermaid-box">Loading diagram…</div>}>
          <Mermaid code={code.text} />
        </Suspense>
      );
    return <pre>{children}</pre>;
  },
};

export function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
      {termsToLinks(source)}
    </ReactMarkdown>
  );
}
