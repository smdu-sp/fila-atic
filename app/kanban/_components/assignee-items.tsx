import {
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";

export const NO_ASSIGNEE = "none";

// Group titles are headings, not options: small caps, a divider above each
// group and the names indented under them, so nobody tries to click them.
const headingClass =
  "px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const memberClass = "ps-4";

// Options for an assignee <Select>: the project team first, then everyone
// else. Picking someone from the second group adds them to the team.
export function AssigneeItems({
  assignees,
  teamIds,
}: {
  assignees: Array<{ id: string; name: string }>;
  teamIds: string[];
}) {
  const team = assignees.filter((person) => teamIds.includes(person.id));
  const others = assignees.filter((person) => !teamIds.includes(person.id));

  return (
    <>
      <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
      {team.length ? (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className={headingClass}>Equipe do projeto</SelectLabel>
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
