import { GuideLockToggle } from "@/components/guides/GuideLockToggle";
import { GuideQrButton } from "@/components/guides/GuideQrButton";
import type { GuideBlock, GuidePage } from "@/lib/guides";

function BlockView({ block }: { block: GuideBlock }) {
  if (block.type === "heading") {
    return <h3 className="text-base font-bold text-gray-900">{block.text}</h3>;
  }

  if (block.type === "lead") {
    return <p className="text-sm leading-relaxed text-gray-600">{block.text}</p>;
  }

  if (block.type === "paragraph") {
    return <p className="text-sm leading-relaxed text-gray-700">{block.text}</p>;
  }

  if (block.type === "note") {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950">
        {block.text}
      </p>
    );
  }

  if (block.type === "bullets") {
    return (
      <ul className="space-y-2">
        {block.items.map((item) => (
          <li
            key={item}
            className="rounded-2xl bg-gray-50 px-3.5 py-2.5 text-sm leading-snug text-gray-700"
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ol className="space-y-2">
      {block.items.map((step, index) => (
        <li
          key={step}
          className="flex gap-3 rounded-2xl bg-gray-50 px-3.5 py-2.5 text-sm leading-snug text-gray-700"
        >
          <span className="font-semibold text-gray-400">{index + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function GuideArticle({ guide }: { guide: GuidePage }) {
  const empty = guide.blocks.length === 0;

  return (
    <article className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6 sm:px-6">
      <header className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">{guide.title}</h1>
            {guide.subtitle ? (
              <p className="mt-1 text-sm text-gray-500">{guide.subtitle}</p>
            ) : null}
            <p className="mt-1 truncate font-mono text-xs text-gray-400">/gaidy/{guide.slug}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GuideLockToggle slug={guide.slug} />
            <GuideQrButton slug={guide.slug} title={guide.title} />
          </div>
        </div>
      </header>

      {empty ? (
        <section className="rounded-3xl border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
          Тема создана. Контент заполним отдельно — напиши, что сюда положить.
        </section>
      ) : (
        <section className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          {guide.blocks.map((block, index) => (
            <BlockView key={`${block.type}-${index}`} block={block} />
          ))}
        </section>
      )}
    </article>
  );
}

export function GuidesEmptyState() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-base font-semibold text-gray-900">Выбери тему слева</p>
        <p className="mt-1.5 text-sm text-gray-500">
          Слева введи название и нажми +. Появится отдельная страница.
        </p>
      </div>
    </div>
  );
}
