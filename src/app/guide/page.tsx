import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { Marked, type Tokens } from "marked";
import { GuideBack } from "./GuideBack";

export const metadata: Metadata = { title: "사용 설명서" };

// 설명서는 저장소의 docs/USER_GUIDE.md 하나만 고치면 된다. 빌드할 때 한 번 읽어 정적 화면으로 만든다.
export const dynamic = "force-static";

const README_URL = "https://github.com/park-gwimong/manito-web#readme";

/** GitHub가 제목에 붙이는 것과 같은 규칙의 앵커. 문서 안의 `#링크`가 그대로 동작하게 한다. */
function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

async function renderGuide(): Promise<string> {
  const source = await readFile(path.join(process.cwd(), "docs", "USER_GUIDE.md"), "utf8");
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(this, { tokens, depth, text }: Tokens.Heading) {
        return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      // 표는 휴대폰에서 옆으로 밀어 볼 수 있게 감싼다.
      table(this, token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: "th" | "td") => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((c) => cell(c, "th")).join("")}</tr>`;
        const body = token.rows.map((row) => `<tr>${row.map((c) => cell(c, "td")).join("")}</tr>`).join("");
        return `<div class="guide-table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>\n`;
      },
      link(this, { href, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        // 저장소 안의 다른 문서는 앱에 없으므로 GitHub로 보낸다.
        if (href.includes("README.md")) return `<a href="${README_URL}" rel="noreferrer">${inner}</a>`;
        return `<a href="${href}">${inner}</a>`;
      },
    },
  });
  return marked.parse(source, { async: false });
}

export default async function GuidePage() {
  const html = await renderGuide();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <GuideBack />
      {/* 우리 저장소의 문서를 빌드할 때 변환한 것이라 사용자 입력이 섞이지 않는다. */}
      <article className="guide" dangerouslySetInnerHTML={{ __html: html }} />
      <GuideBack />
    </main>
  );
}
