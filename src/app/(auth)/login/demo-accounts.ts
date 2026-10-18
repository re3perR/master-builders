export type DemoAccount = {
  email: string;
  name: string;
  role: string;
};

export const demoAccounts: DemoAccount[] = [
  { email: "dispatcher.north@demo.local", name: "Ольга Смирнова", role: "Диспетчер, «Север»" },
  { email: "manager.north@demo.local", name: "Андрей Ковалёв", role: "Руководитель, «Север»" },
  { email: "foreman.petrov@demo.local", name: "Игорь Петров", role: "Бригада монтажа №1" },
  { email: "foreman.lebedev@demo.local", name: "Сергей Лебедев", role: "Бригада отделки №2" },
  { email: "dispatcher.south@demo.local", name: "Марина Егорова", role: "Диспетчер, «Юг»" },
  { email: "manager.south@demo.local", name: "Виктор Орлов", role: "Руководитель, «Юг»" },
  { email: "foreman.gusev@demo.local", name: "Павел Гусев", role: "Ремонтная бригада №3" },
];

export function demoLoginEnabled() {
  return process.env.DEMO_ACCOUNTS === "enabled" && Boolean(process.env.DEMO_PASSWORD);
}
