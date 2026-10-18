const hour = 3_600_000;

type Interval = { planned_start: string; planned_end: string; number: number };

type Placed<T> = { task: T; lane: number; start: number; end: number };

export function placeInLanes<T extends Interval>(tasks: T[], dayStart: number, dayEnd: number) {
  const lanes: number[] = [];
  const placed: Placed<T>[] = [...tasks]
    .sort((a, b) => Date.parse(a.planned_start) - Date.parse(b.planned_start) || a.number - b.number)
    .map((task) => {
      const start = Math.max(Date.parse(task.planned_start), dayStart);
      const end = Math.min(Date.parse(task.planned_end), dayEnd);
      let lane = lanes.findIndex((busyUntil) => busyUntil <= start);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = end;
      return { task, lane, start, end };
    });
  return { placed, lanes: Math.max(lanes.length, 1) };
}

export function hourWindow(items: Placed<Interval>[], dayStart: number, dayEnd: number) {
  const total = Math.round((dayEnd - dayStart) / hour);
  const hours = (moment: number) => (moment - dayStart) / hour;
  let from = 7;
  let to = 20;
  for (const { task, start, end } of items) {
    if (Date.parse(task.planned_start) >= dayStart) from = Math.min(from, Math.floor(hours(start)));
    if (Date.parse(task.planned_end) <= dayEnd) to = Math.max(to, Math.ceil(hours(end)));
  }
  for (const { task, start, end } of items) {
    if (Date.parse(task.planned_start) < dayStart && hours(end) <= from) from = 0;
    if (Date.parse(task.planned_end) > dayEnd && hours(start) >= to) to = total;
  }
  const step = to - from > 12 ? 2 : 1;
  from = Math.floor(from / step) * step;
  to = Math.min(total, Math.ceil(to / step) * step);
  const ticks: number[] = [];
  for (let value = from; value <= to; value += step) ticks.push(value);
  return { start: dayStart + from * hour, end: dayStart + to * hour, ticks };
}

export function hourLabel(value: number) {
  return `${String(value).padStart(2, "0")}:00`;
}
