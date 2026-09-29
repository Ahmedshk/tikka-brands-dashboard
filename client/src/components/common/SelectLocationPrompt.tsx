/**
 * Shared "no location selected" prompt.
 *
 * Rendered instead of a page's main content when the user has cleared the
 * location selection. Centralised so every dashboard page says the same thing
 * and only has to decide *where* to branch, not what to write.
 */
export interface SelectLocationPromptProps {
  /** Page-specific noun, e.g. "KPIs", "Sales & Labor data", "review cycles". */
  subject?: string;
}

export function SelectLocationPrompt({ subject }: Readonly<SelectLocationPromptProps>) {
  return (
    <p className="text-sm text-secondary">
      Select a location from the navbar to view {subject ?? 'data'}.
    </p>
  );
}
