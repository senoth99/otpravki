"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  QUALITY_GUIDE_EXAMPLES,
  QUALITY_GUIDE_SECTIONS,
  QUALITY_GUIDE_SOURCE,
  QUALITY_GUIDE_VIDEO_SRC,
} from "@/lib/quality-guide";

export function QualityGuidePanel() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-dvh w-full flex-col bg-gray-50">
      <header className="safe-top shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Инструкция по качеству</h1>
            <p className="text-xs text-gray-500">Три рубежа · контроль на всём пути товара</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <a
                href="/otpravki"
                className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 active:bg-gray-50"
              >
                К отправкам
              </a>
            ) : (
              <a
                href="/otpravki"
                className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 active:bg-gray-50"
              >
                Ко входу
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="w-full flex-1 space-y-6 px-4 py-5 pb-10 sm:px-6">
        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-xl font-bold tracking-tight text-gray-900">
              Три рубежа качества
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Контроль на всём пути товара — от осмотра до отправки клиенту.
            </p>
          </div>
          <div className="bg-gray-950">
            <video
              className="aspect-video w-full bg-black"
              controls
              playsInline
              preload="metadata"
              src={QUALITY_GUIDE_VIDEO_SRC}
            >
              Ваш браузер не поддерживает видео.
            </video>
          </div>
          <p className="px-5 py-3 text-xs text-gray-500">
            Видео-памятка для смены. Смотри со звуком при необходимости.
          </p>
        </section>

        {QUALITY_GUIDE_SECTIONS.map((section, index) => (
          <section
            key={section.id}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-sm font-bold text-white">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-gray-900">{section.title}</h3>
                {section.lead ? (
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{section.lead}</p>
                ) : null}
                {section.bullets ? (
                  <ul className="mt-3 space-y-2">
                    {section.bullets.map((item) => (
                      <li
                        key={item}
                        className="rounded-2xl bg-gray-50 px-3.5 py-2.5 text-sm leading-snug text-gray-700"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {section.steps ? (
                  <ol className="mt-3 space-y-2">
                    {section.steps.map((step, stepIndex) => (
                      <li
                        key={step}
                        className="flex gap-3 rounded-2xl bg-gray-50 px-3.5 py-2.5 text-sm leading-snug text-gray-700"
                      >
                        <span className="font-semibold text-gray-400">{stepIndex + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {section.note ? (
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950">
                    {section.note}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ))}

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900">Примеры брака</h3>
          <p className="mt-1 text-sm text-gray-500">
            Типовые случаи из регламента — на что смотреть глазами.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {QUALITY_GUIDE_EXAMPLES.map((example) => (
              <div
                key={example.title}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-3.5 py-3"
              >
                <p className="text-sm font-semibold text-gray-900">{example.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{example.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-gray-400">
          Источник:{" "}
          <a
            href={QUALITY_GUIDE_SOURCE}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            регламент в Notion
          </a>
        </p>
      </main>
    </div>
  );
}
