import {
  SelectGroup,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";

export const NO_ASSIGNEE = "none";

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
        <SelectGroup>
          <SelectLabel>Equipe do projeto</SelectLabel>
          {team.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </SelectGroup>
      ) : null}
      {others.length ? (
        <SelectGroup>
          <SelectLabel>Outros (entram na equipe)</SelectLabel>
          {others.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </SelectGroup>
      ) : null}
    </>
  );
}
