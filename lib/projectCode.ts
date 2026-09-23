// Human-facing project code: "ATC-0001", sequential from the project's
// internal `code` column (see the Project model). Never the database id.
export function formatProjectCode(code: number) {
  return `ATC-${String(code).padStart(4, "0")}`;
}
