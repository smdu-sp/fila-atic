import {
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const NO_ASSIGNEE = "none";

// Group titles are headings, not options: small caps, a divider above each
// group and the names indented under them, so nobody tries to click them.
const headingClass =
  "px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const memberClass = "ps-4";

// The project team first, then everyone else. Picking someone from the
// second group adds them to the team.
function groupAssignees(
  assignees: Array<{ id: string; name: string }>,
  teamIds: string[],
) {
  return {
    team: assignees.filter((person) => teamIds.includes(person.id)),
    others: assignees.filter((person) => !teamIds.includes(person.id)),
  };
}

// Options for an assignee <Select>.
export function AssigneeItems({
  assignees,
  teamIds,
}: {
  assignees: Array<{ id: string; name: string }>;
  teamIds: string[];
}) {
  const { team, others } = groupAssignees(assignees, teamIds);

  return (
    <>
      <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
      {team.length ? (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className={headingClass}>
              Equipe do projeto
            </SelectLabel>
            {team.map((person) => (
              <SelectItem
                key={person.id}
                value={person.id}
                className={memberClass}
              >
                {person.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </>
      ) : null}
      {others.length ? (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className={headingClass}>
              Outros desenvolvedores
              <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">
                Entram na equipe ao receber a tarefa
              </span>
            </SelectLabel>
            {others.map((person) => (
              <SelectItem
                key={person.id}
                value={person.id}
                className={memberClass}
              >
                {person.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </>
      ) : null}
    </>
  );
}

// Same options, as plain buttons: for quick pickers inside a Popover, where
// there is no Radix Select around to give SelectItem its context.
export function AssigneeButtons({
  assignees,
  teamIds,
  value,
  onSelect,
}: {
  assignees: Array<{ id: string; name: string }>;
  teamIds: string[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const { team, others } = groupAssignees(assignees, teamIds);
  const buttonClass = (id: string) =>
    cn(
      "flex w-full items-center rounded-md px-2 py-1 text-start text-sm hover:bg-accent hover:text-accent-foreground",
      memberClass,
      value === id && "bg-accent text-accent-foreground",
    );

  return (
    <div className="grid gap-1">
      <button
        type="button"
        className={cn(
          "flex w-full items-center rounded-md px-2 py-1 text-start text-sm hover:bg-accent hover:text-accent-foreground",
          value === NO_ASSIGNEE && "bg-accent text-accent-foreground",
        )}
        onClick={() => onSelect(NO_ASSIGNEE)}
      >
        Sem responsável
      </button>
      {team.length ? (
        <>
          <div className={headingClass}>Equipe do projeto</div>
          {team.map((person) => (
            <button
              key={person.id}
              type="button"
              className={buttonClass(person.id)}
              onClick={() => onSelect(person.id)}
            >
              {person.name}
            </button>
          ))}
        </>
      ) : null}
      {others.length ? (
        <>
          <div className={headingClass}>Outros desenvolvedores</div>
          {others.map((person) => (
            <button
              key={person.id}
              type="button"
              className={buttonClass(person.id)}
              onClick={() => onSelect(person.id)}
            >
              {person.name}
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}
