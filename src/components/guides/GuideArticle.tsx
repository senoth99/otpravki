import { GuideLockToggle } from "@/components/guides/GuideLockToggle";
import { GuideQrButton } from "@/components/guides/GuideQrButton";
import type { GuideBlock, GuidePage } from "@/lib/guides";

function VideoBlockView({
  block,
}: {
  block: Extract<GuideBlock, { type: "video" }>;
}) {
  const aspect = block.aspect ?? "9:16";
  const frameClass =
    aspect === "16:9"
      ? "aspect-video w-full max-w-xl"
      : aspect === "auto"
        ? "w-full max-w-md"
        : "aspect-[9/16] w-full max-w-[220px] sm:max-w-[320px]";

  const sources =
    block.sources && block.sources.length > 0
      ? block.sources
      : [{ src: block.src, type: "video/mp4" }];

  return (
    <figure className="flex flex-col items-center gap-2.5">
      <div
        className={`overflow-hidden rounded-[1.25rem] border border-gray-200 bg-black shadow-md sm:rounded-[1.5rem] ${frameClass}`}
      >
        <video
          className="h-full w-full object-cover object-center"
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
        >
          {sources.map((source) => (
            <source key={source.src} src={source.src} type={source.type} />
          ))}
          Ваш браузер не поддерживает видео.
        </video>
      </div>
      {block.caption ? (
        <figcaption className="px-1 text-center text-xs leading-snug text-gray-500">
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function BlockView({ block }: { block: GuideBlock }) {
  if (block.type === "heading") {
    return (
      <h3 className="break-words text-[15px] font-bold leading-snug text-gray-900 sm:text-base">
        {block.text}
      </h3>
    );
  }

  if (block.type === "lead") {
    return (
      <p className="break-words text-[15px] leading-relaxed text-gray-600 sm:text-sm">
        {block.text}
      </p>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p className="break-words text-[15px] leading-relaxed text-gray-700 sm:text-sm">
        {block.text}
      </p>
    );
  }

  if (block.type === "note") {
    return (
      <p className="break-words rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[15px] font-medium leading-snug text-amber-950 sm:px-3.5 sm:text-sm">
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
            className="break-words rounded-2xl bg-gray-50 px-3 py-2.5 text-[15px] leading-snug text-gray-700 sm:px-3.5 sm:text-sm"
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "video") {
    return <VideoBlockView block={block} />;
  }

  return (
    <ol className="space-y-2">
      {block.items.map((step, index) => (
        <li
          key={step}
          className="flex gap-2.5 rounded-2xl bg-gray-50 px-3 py-2.5 text-[15px] leading-snug text-gray-700 sm:gap-3 sm:px-3.5 sm:text-sm"
        >
          <span className="shrink-0 font-semibold text-gray-400">{index + 1}.</span>
          <span className="min-w-0 break-words">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function GuideArticle({ guide }: { guide: GuidePage }) {
  const empty = guide.blocks.length === 0;

  return (
    <article className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-6">
      <header className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="min-w-0">
          <h1 className="break-words text-lg font-bold leading-snug tracking-tight text-gray-900 sm:text-xl">
            {guide.title}
          </h1>
          {guide.subtitle ? (
            <p className="mt-1.5 break-words text-sm leading-snug text-gray-500">{guide.subtitle}</p>
          ) : null}
          <p className="mt-1 break-all font-mono text-[11px] text-gray-400 sm:truncate sm:text-xs">
            /gaidy/{guide.slug}
          </p>
        </div>

        <div className="mt-3 flex min-w-0 items-stretch gap-2">
          <GuideLockToggle slug={guide.slug} />
          <GuideQrButton slug={guide.slug} title={guide.title} />
        </div>
      </header>

      {empty ? (
        <section className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-500 shadow-sm sm:rounded-3xl sm:p-5">
          Тема создана. Контент заполним отдельно — напиши, что сюда положить.
        </section>
      ) : (
        <section className="space-y-3.5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:space-y-4 sm:rounded-3xl sm:p-5">
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
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
          Слева введи название и нажми +. Появится отдельная страница.
        </p>
      </div>
    </div>
  );
}
