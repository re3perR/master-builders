"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useClientKey } from "@/hooks/use-client-key";
import type { Site } from "@/lib/database.types";
import type { AppError } from "@/lib/errors";
import { formatDate } from "@/lib/time";
import { archiveSite, deleteSite, restoreSite } from "../actions";
import { plural } from "../plural";
import { ConfirmDialog } from "./confirm-dialog";

type SiteManageProps = {
  site: Pick<Site, "id" | "name" | "archived_at">;
  activeCount: number;
  totalCount: number;
  onDone: (message: string) => void;
};

export function SiteManage({ site, activeCount, totalCount, onDone }: SiteManageProps) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const archiveKey = useClientKey();
  const restoreKey = useClientKey();
  const deleteKey = useClientKey();

  async function archive(): Promise<AppError | null> {
    const result = await archiveSite({ siteId: site.id, clientKey: archiveKey.current() });
    router.refresh();
    if (!result.ok) return result.error;
    archiveKey.reset();
    onDone("Объект перенесён в архив. Он больше не предлагается для новых заданий.");
    return null;
  }

  async function restore(): Promise<AppError | null> {
    const result = await restoreSite({ siteId: site.id, clientKey: restoreKey.current() });
    router.refresh();
    if (!result.ok) return result.error;
    restoreKey.reset();
    onDone("Объект восстановлен и снова доступен для новых заданий.");
    return null;
  }

  async function remove(): Promise<AppError | null> {
    const result = await deleteSite({ siteId: site.id, clientKey: deleteKey.current() });
    if (!result.ok) {
      router.refresh();
      return result.error;
    }
    deleteKey.reset();
    startNavigation(() => router.replace("/sites"));
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Архив и удаление</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-5 text-[15px]">
        {site.archived_at ? (
          <section className="flex flex-col items-start gap-3">
            <p>
              Объект в архиве с {formatDate(site.archived_at)}. Его нельзя выбрать для новых заданий, связанные задания
              и история сохранены.
            </p>
            <ConfirmDialog
              trigger={
                <Button variant="secondary">
                  <ArchiveRestore aria-hidden className="size-4" />
                  Восстановить
                </Button>
              }
              title="Восстановить объект?"
              description={`«${site.name}» снова появится в выборе при создании заданий.`}
              confirmLabel="Восстановить"
              pendingLabel="Восстанавливаем…"
              onConfirm={restore}
            />
          </section>
        ) : activeCount > 0 ? (
          <section className="flex flex-col items-start gap-3">
            <p id="site-archive-blocked">
              Архивировать нельзя: на объекте{" "}
              {plural(activeCount, "активное задание", "активных задания", "активных заданий")}, включая ожидающие
              проверки. Архив станет доступен, когда все задания будут завершены или отменены.
            </p>
            <Button variant="secondary" disabled aria-describedby="site-archive-blocked">
              <Archive aria-hidden className="size-4" />
              Архивировать
            </Button>
          </section>
        ) : (
          <section className="flex flex-col items-start gap-3">
            <p>
              Архивный объект не предлагается для новых заданий. Связанные задания и история сохранятся, объект можно
              будет восстановить.
            </p>
            <ConfirmDialog
              trigger={
                <Button variant="secondary">
                  <Archive aria-hidden className="size-4" />
                  Архивировать
                </Button>
              }
              title="Архивировать объект?"
              description={`«${site.name}» пропадёт из выбора при создании заданий. Задания и история объекта сохранятся.`}
              confirmLabel="Архивировать"
              pendingLabel="Архивируем…"
              onConfirm={archive}
            />
          </section>
        )}

        <section className="flex flex-col items-start gap-3 border-t border-line pt-4">
          {totalCount > 0 ? (
            <p className="text-ink-muted">
              Удалить нельзя: объект использовался в {plural(totalCount, "задании", "заданиях", "заданиях")}.
              {site.archived_at ? null : " Чтобы убрать его из выбора, архивируйте объект."}
            </p>
          ) : (
            <>
              <p>Объект ещё не использовался в заданиях, поэтому его можно удалить полностью.</p>
              <ConfirmDialog
                trigger={
                  <Button variant="secondary" className="text-danger">
                    <Trash2 aria-hidden className="size-4" />
                    Удалить объект
                  </Button>
                }
                title="Удалить объект?"
                description={`«${site.name}» будет удалён без возможности восстановления.`}
                confirmLabel="Удалить"
                pendingLabel="Удаляем…"
                tone="danger"
                onConfirm={remove}
              />
            </>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
