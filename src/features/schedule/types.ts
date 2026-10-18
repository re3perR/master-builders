import type { ScheduleTask } from "@/features/overview/db-types";

type ScheduleCrew = {
  id: string;
  name: string;
  archived: boolean;
};

export type ScheduleData = {
  date: string;
  crews: ScheduleCrew[];
  tasks: ScheduleTask[];
};

export type CrewDay = {
  crew: ScheduleCrew;
  tasks: ScheduleTask[];
};

export function groupByCrew(data: ScheduleData): CrewDay[] {
  const groups = new Map<string, CrewDay>(data.crews.map((crew) => [crew.id, { crew, tasks: [] }]));
  for (const task of data.tasks) {
    let group = groups.get(task.crew_id);
    if (!group) {
      group = {
        crew: { id: task.crew_id, name: task.crew_name ?? "Бригада недоступна", archived: false },
        tasks: [],
      };
      groups.set(task.crew_id, group);
    }
    group.tasks.push(task);
  }
  return [...groups.values()];
}
