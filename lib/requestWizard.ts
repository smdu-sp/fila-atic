import {
  parseMultiValue,
  type ConfigurableRequestStep,
  type ProjectRequestFieldConfig,
} from "@/lib/requestForm";

// The request form as a 4-step wizard (3 for a logged-in requester, who
// skips "identity" — the system already knows who they are). Pure, so the
// step list, which fields show on each step and the guest-identity checks
// can be tested without rendering anything. app/projetos/_components/
// create-project-form.tsx only wires this up to react-hook-form and JSX.

export type WizardStepId = "intro" | "identity" | "basics" | "details";

// "intro" (an explanation, no fields) and "identity" (the guest's own
// name/e-mail/department, public form only) are fixed; "basics" and
// "details" show whatever the coordination put on step 3 and step 4.
export function wizardSteps(guest: boolean): WizardStepId[] {
  return guest ? ["intro", "identity", "basics", "details"] : ["intro", "basics", "details"];
}

// The active fields of one step, in their configured order. Priority is
// never shown to the requester (coordination sets it during triage).
export function fieldsForStep(
  fields: ProjectRequestFieldConfig[],
  step: ConfigurableRequestStep,
): ProjectRequestFieldConfig[] {
  return fields
    .filter((field) => field.isActive && field.key !== "priority" && field.step === step)
    .sort((a, b) => a.order - b.order);
}

export function isEmptyCustomValue(field: ProjectRequestFieldConfig, value: string | undefined): boolean {
  return field.fieldType === "MULTI_SELECT" ? parseMultiValue(value).length === 0 : !value?.trim();
}

// Custom, required fields of `fields` that `valueOf` says are still empty.
// System fields are left out: their "required" is enforced by the zod
// schema (min length on title/description/justification), not here.
export function missingRequiredFields(
  fields: ProjectRequestFieldConfig[],
  valueOf: (fieldId: string) => string | undefined,
): ProjectRequestFieldConfig[] {
  return fields.filter(
    (field) => !field.isSystem && field.required && isEmptyCustomValue(field, valueOf(field.id)),
  );
}

export type GuestIdentity = { name: string; email: string; department: string };
export type GuestIdentityErrors = Partial<Record<keyof GuestIdentity, string>>;

// Whether the guest's own name/e-mail/department look real enough to go on;
// not tied to react-hook-form so it is testable on its own. Matching and
// message text kept exactly as the public form always had them.
export function validateGuestIdentity(
  input: GuestIdentity,
  allowedDomains: string[],
): GuestIdentityErrors {
  const errors: GuestIdentityErrors = {};
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const department = input.department.trim();

  if (name.length < 3) errors.name = "Informe seu nome";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Informe um e-mail valido";
  } else if (allowedDomains.length && !allowedDomains.includes(email.split("@")[1])) {
    errors.email = `Use seu e-mail institucional (${allowedDomains.map((domain) => `@${domain}`).join(", ")})`;
  }

  if (department.length < 2) errors.department = "Informe seu setor";

  return errors;
}
