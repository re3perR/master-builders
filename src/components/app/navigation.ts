import type { UserRole } from "@/lib/database.types";

export type NavIcon = "overview" | "tasks" | "schedule" | "sites" | "crews" | "my";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};

const office: NavItem[] = [
  { href: "/overview", label: "Обзор", icon: "overview" },
  { href: "/tasks", label: "Задания", icon: "tasks" },
  { href: "/schedule", label: "Расписание", icon: "schedule" },
  { href: "/sites", label: "Объекты", icon: "sites" },
  { href: "/crews", label: "Бригады", icon: "crews" },
];

const field: NavItem[] = [
  { href: "/my", label: "Мои задания", icon: "my" },
  { href: "/schedule", label: "Расписание", icon: "schedule" },
  { href: "/crews", label: "Бригада", icon: "crews" },
];

export function navigationFor(role: UserRole) {
  return role === "foreman" ? field : office;
}
