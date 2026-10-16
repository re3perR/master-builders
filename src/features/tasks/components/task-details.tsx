import { Card, CardBody } from "@/components/ui/card";
import type { TaskCard } from "../types";

export function TaskDetails({ card }: { card: TaskCard }) {
  return (
    <Card>
      <CardBody>
        <p className="whitespace-pre-line">{card.description}</p>
      </CardBody>
    </Card>
  );
}
