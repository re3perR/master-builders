"use client";

import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { refreshPhotoLinks } from "./actions";
import type { ReportPhoto } from "./queries";

type PhotoGalleryProps = {
  taskId: string;
  reportId: string;
  label: string;
  photos: ReportPhoto[];
};

export function PhotoGallery({ taskId, reportId, label, photos }: PhotoGalleryProps) {
  const [items, setItems] = useState(photos);
  const [seen, setSeen] = useState(photos);
  const [index, setIndex] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const renewal = useRef({ at: 0, busy: false });
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const opener = useRef(0);

  if (seen !== photos) {
    setSeen(photos);
    setItems(photos);
  }

  const count = items.length;
  const current = index === null ? null : items[index];

  async function renew() {
    if (renewal.current.busy) return;
    if (Date.now() - renewal.current.at < 30_000) {
      setExpired(true);
      return;
    }
    renewal.current = { at: Date.now(), busy: true };
    const result = await refreshPhotoLinks({ taskId, reportId }).catch(() => null);
    renewal.current.busy = false;
    if (result?.ok) {
      setItems((list) => list.map((photo) => ({ ...photo, url: result.data[photo.id] ?? null })));
      setExpired(false);
    } else {
      setExpired(true);
    }
  }

  function show(position: number) {
    opener.current = position;
    setIndex(position);
  }

  function close() {
    setIndex(null);
    const position = opener.current;
    setTimeout(() => thumbs.current[position]?.focus(), 0);
  }

  useEffect(() => {
    if (index === null || count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((value) => (value === null ? value : (value + 1) % count));
      if (event.key === "ArrowLeft") setIndex((value) => (value === null ? value : (value - 1 + count) % count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count]);

  if (!count) return <p className="text-sm text-ink-muted">Фото не приложены.</p>;

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5" aria-label={`${label}: фото`}>
        {items.map((photo, position) => (
          <li key={photo.id}>
            <button
              ref={(node) => {
                thumbs.current[position] = node;
              }}
              type="button"
              onClick={() => show(position)}
              aria-label={`${label}: открыть фото ${position + 1} из ${count}`}
              className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas hover:border-field"
            >
              {photo.url ? (
                <Image
                  fill
                  src={photo.url}
                  alt=""
                  sizes="(min-width: 1024px) 160px, 33vw"
                  className="object-cover"
                  onError={() => void renew()}
                />
              ) : (
                <ImageOff aria-hidden className="size-5 text-ink-muted" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {expired ? (
        <p role="status" className="mt-2 text-sm text-warning">
          Ссылки на фото устарели. Обновите страницу, чтобы открыть их снова.
        </p>
      ) : null}

      <Dialog
        open={index !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {index !== null && current ? (
          <DialogContent title={`${label}: фото ${index + 1} из ${count}`} className="sm:max-w-4xl">
            <div className="flex min-h-[40dvh] items-center justify-center overflow-hidden rounded-lg bg-canvas">
              {current.url ? (
                <Image
                  unoptimized
                  key={current.id}
                  src={current.url}
                  alt={`${label}, фото ${index + 1} из ${count}`}
                  width={current.width ?? 1600}
                  height={current.height ?? 1200}
                  loading="eager"
                  className="h-auto max-h-[70dvh] w-auto max-w-full object-contain"
                  onError={() => void renew()}
                />
              ) : (
                <p className="flex items-center gap-2 p-6 text-ink-muted">
                  <ImageOff aria-hidden className="size-5" />
                  Фото недоступно
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                disabled={count < 2}
                onClick={() => setIndex((index - 1 + count) % count)}
                aria-label="Предыдущее фото"
              >
                <ChevronLeft aria-hidden className="size-4" />
                <span className="hidden sm:inline">Предыдущее</span>
              </Button>
              <span className="tabular text-sm text-ink-muted" aria-live="polite">
                {index + 1} из {count}
              </span>
              <Button
                variant="secondary"
                disabled={count < 2}
                onClick={() => setIndex((index + 1) % count)}
                aria-label="Следующее фото"
              >
                <span className="hidden sm:inline">Следующее</span>
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </div>
            <p className="mt-2 hidden text-sm text-ink-muted pointer-fine:block">
              Стрелки ← и → переключают фото, Esc закрывает просмотр.
            </p>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
