import type { FormEvent } from "react";
import type { Program, Team, TeamChanges, TeamVisibility } from "../types/database";

const programs: Program[] = ["FLL", "FTC", "FRC", "General FIRST"];

interface TeamFormProps {
  initialTeam?: Team | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: (changes: TeamChanges) => Promise<void>;
}

export function TeamForm({ initialTeam, busy, submitLabel, onSubmit }: TeamFormProps) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await onSubmit({
      name: String(formData.get("name") ?? "").trim(),
      team_number: String(formData.get("team_number") ?? "").trim().toUpperCase(),
      program: String(formData.get("program") ?? "FTC") as Program,
      description: String(formData.get("description") ?? "").trim(),
      visibility: String(formData.get("visibility") ?? "private") as TeamVisibility,
      allow_student_quiz_creation: formData.get("allow_student_quiz_creation") === "on",
    });
  }

  return (
    <form className="form-stack team-form" onSubmit={(event) => void handleSubmit(event)}>
      <label className="field">
        <span>Team name</span>
        <input name="name" defaultValue={initialTeam?.name ?? ""} maxLength={100} required />
      </label>
      <div className="form-row">
        <label className="field">
          <span>Team number</span>
          <input
            name="team_number"
            defaultValue={initialTeam?.team_number ?? ""}
            maxLength={24}
            pattern="[A-Za-z0-9-]{1,24}"
            title="Use 1–24 letters, numbers, or hyphens."
            required
          />
        </label>
        <label className="field">
          <span>FIRST program</span>
          <select name="program" defaultValue={initialTeam?.program ?? "FTC"}>
            {programs.map((program) => <option key={program} value={program}>{program}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>About the team <small>optional · 500 characters max</small></span>
        <textarea name="description" defaultValue={initialTeam?.description ?? ""} maxLength={500} rows={4} />
      </label>
      <label className="field">
        <span>Team visibility</span>
        <select name="visibility" defaultValue={initialTeam?.visibility ?? "private"}>
          <option value="private">Private — only team members can see it</option>
          <option value="public">Public — signed-in users can discover the team</option>
        </select>
      </label>
      <label className="quiz-draft-toggle team-student-create-toggle">
        <input
          name="allow_student_quiz_creation"
          type="checkbox"
          defaultChecked={initialTeam?.allow_student_quiz_creation ?? false}
        />
        Allow students in this team to create quizzes
      </label>
      <p className="field-hint">This setting only controls student accounts. Owners, administrators, and coaches can always create quizzes.</p>
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : submitLabel} <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
