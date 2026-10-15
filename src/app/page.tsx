import { CalendarClock, Camera, ClipboardCheck, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/app/brand";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";

const points = [
  {
    Icon: ClipboardCheck,
    title: "Задание в одной карточке",
    text: "Объект, бригада, сроки, статус и следующее действие.",
  },
  {
    Icon: CalendarClock,
    title: "Расписание без накладок",
    text: "Пересечения работ одной бригады видны до сохранения.",
  },
  { Icon: Camera, title: "Фотоотчёт и приёмка", text: "Версии отчётов, замечания при возврате и решение диспетчера." },
  { Icon: MessagesSquare, title: "Обсуждение по делу", text: "Переписка внутри задания вместо разрозненных чатов." },
];

export default async function HomePage() {
  const viewer = await getViewer();
  if (viewer) redirect("/overview");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-nav text-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <BrandMark />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-white/10"
          >
            Войти
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-16">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Управление выездными бригадами: от назначения до принятого результата
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">
          Master Builders помогает строительным, ремонтным и монтажным компаниям планировать работы, получать фотоотчёты
          с объектов и принимать результат без звонков и потерянных сообщений.
        </p>
        <Link href="/login" className={buttonVariants({ className: "mt-8" })}>
          Войти в систему
        </Link>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {points.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-ink-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-ink-muted">Master Builders · пилотная версия</div>
      </footer>
    </div>
  );
}
