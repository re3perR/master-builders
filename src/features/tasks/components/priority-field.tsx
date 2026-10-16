import type { TaskPriority } from "@/lib/database.types";
import { cn } from "@/lib/cn";
import { priorityLabels } from "@/lib/labels";

const priorities: TaskPriority[] = ["low", "normal", "high"];

type PriorityFieldProps = {
  name: string;
  value: string;
  onChange: (value: TaskPriority) => void;
};

export function PriorityField({ name, value, onChange }: PriorityFieldProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Приоритет</legend>
      <div className="inline-flex flex-wrap gap-2">
        {priorities.map((priority) => (
          <label
            key={priority}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-[15px] sm:px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus sm:min-h-10",
              value === priority ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-canvas",
            )}
          >
            <input
              type="radio"
              id={`${name}-${priority}`}
              name={name}
              value={priority}
              checked={value === priority}
              onChange={() => onChange(priority)}
              className="sr-only"
            />
            {priorityLabels[priority]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
