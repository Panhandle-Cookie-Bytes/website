import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  GripVertical,
  ImagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { QUIZ_CATEGORIES, QUIZ_DIFFICULTIES } from "../content/quizTaxonomy";
import { createQuiz, getQuizEditor, updateQuiz, type QuizChanges } from "../services/quizService";
import { getQuizMediaUrls, uploadQuizImage } from "../services/quizMediaService";
import { canCreateQuizzes, listMyTeams } from "../services/teamService";
import type {
  Program,
  QuizQuestionInput,
  QuizQuestionType,
  QuizStatus,
  QuizVisibility,
} from "../types/database";

const programs: Program[] = ["FLL", "FTC", "FRC", "General FIRST"];
const questionTypes: { value: QuizQuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True or false" },
  { value: "multiple_select", label: "Select all that apply" },
  { value: "image_multiple_choice", label: "Image-based multiple choice" },
];
const defaultQuestionTimeOptions = [0, 15, 30, 45, 60, 90, 120, 180, 300, 600];
const questionTimeOptions = [5, 10, 15, 20, 30, 45, 60, 90, 120, 300, 600];

function makeQuestion(): QuizQuestionInput {
  return {
    question_type: "multiple_choice",
    prompt: "",
    options: ["", ""],
    correct_index: 0,
    correct_indices: [0],
    explanation: "",
    image_path: null,
    image_url: null,
    point_value: 1,
    time_limit_seconds: null,
  };
}

function makeInitialForm(): QuizChanges {
  return {
    title: "",
    description: "",
    program: "FTC",
    category: QUIZ_CATEGORIES[0],
    difficulty: "Intermediate",
    visibility: "private",
    status: "draft",
    allow_question_preview: false,
    team_id: null,
    tags: [],
    cover_image_path: null,
    default_question_time_seconds: 30,
    randomize_questions: false,
    randomize_answers: false,
    show_explanations: true,
    allow_multiple_attempts: true,
    show_correct_answers: true,
    allow_public_duplication: false,
    allow_team_editing: false,
    questions: [makeQuestion()],
  };
}

function snapshotForm(form: QuizChanges): string {
  return JSON.stringify({
    ...form,
    questions: form.questions.map(({ image_url: _imageUrl, ...question }) => question),
  });
}

function isSingleAnswerType(type: QuizQuestionType): boolean {
  return type !== "multiple_select";
}

export function QuizEditorPage() {
  const { quizId } = useParams();
  const isEditing = Boolean(quizId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<QuizChanges>(makeInitialForm);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [teams, setTeams] = useState<Awaited<ReturnType<typeof listMyTeams>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [createAllowed, setCreateAllowed] = useState<boolean | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);
  const draftQuizId = useRef(crypto.randomUUID());
  const activeQuizId = quizId ?? draftQuizId.current;
  const currentSnapshot = snapshotForm(form);
  const hasUnsavedChanges = Boolean(savedSnapshot) && currentSnapshot !== savedSnapshot;

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (!user) {
      setCreateAllowed(false);
      setError("Sign in before creating or editing a quiz.");
      setLoading(false);
      return () => { active = false; };
    }

    void Promise.all([
      listMyTeams(user.id),
      quizId ? getQuizEditor(quizId) : canCreateQuizzes(),
    ]).then(async ([myTeams, editorOrPermission]) => {
      if (!active) return;
      setTeams(myTeams);
      if (typeof editorOrPermission === "boolean") {
        setCreateAllowed(editorOrPermission);
        setSavedSnapshot(snapshotForm(makeInitialForm()));
        return;
      }

      const editor = editorOrPermission;
      const loadedForm: QuizChanges = {
        ...makeInitialForm(),
        title: editor.quiz.title,
        description: editor.quiz.description,
        program: editor.quiz.program,
        category: editor.quiz.category,
        difficulty: editor.quiz.difficulty,
        visibility: editor.quiz.visibility,
        status: editor.quiz.status,
        allow_question_preview: editor.quiz.allow_question_preview,
        team_id: editor.quiz.team_id,
        tags: editor.quiz.tags,
        cover_image_path: editor.quiz.cover_image_path,
        default_question_time_seconds: editor.quiz.default_question_time_seconds,
        randomize_questions: editor.quiz.randomize_questions,
        randomize_answers: editor.quiz.randomize_answers,
        show_explanations: editor.quiz.show_explanations,
        allow_multiple_attempts: editor.quiz.allow_multiple_attempts,
        show_correct_answers: editor.quiz.show_correct_answers,
        allow_public_duplication: editor.quiz.allow_public_duplication,
        allow_team_editing: editor.quiz.allow_team_editing,
        questions: editor.questions.length ? editor.questions : [makeQuestion()],
      };
      setForm(loadedForm);
      setCreateAllowed(true);
      const urls = await getQuizMediaUrls([loadedForm.cover_image_path]);
      if (!active) return;
      setCoverImageUrl(loadedForm.cover_image_path ? urls.get(loadedForm.cover_image_path) ?? null : null);
      setSavedSnapshot(snapshotForm(loadedForm));
    }).catch((loadError: unknown) => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load the quiz editor.");
      setCreateAllowed(false);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [quizId, user?.id]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  function updateForm<K extends keyof QuizChanges>(key: K, value: QuizChanges[K]) {
    setForm((existing) => ({ ...existing, [key]: value }));
  }

  function updateQuestion(index: number, changes: Partial<QuizQuestionInput>) {
    setForm((existing) => ({
      ...existing,
      questions: existing.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...changes } : question),
    }));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    const question = form.questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.map((option, index) => index === optionIndex ? value : option),
    });
  }

  function setCorrectChoice(questionIndex: number, optionIndex: number, selected: boolean) {
    const question = form.questions[questionIndex];
    const nextIndices = question.question_type === "multiple_select"
      ? selected
        ? [...new Set([...question.correct_indices, optionIndex])].sort((a, b) => a - b)
        : question.correct_indices.filter((index) => index !== optionIndex)
      : [optionIndex];
    updateQuestion(questionIndex, {
      correct_indices: nextIndices,
      correct_index: nextIndices[0] ?? 0,
    });
  }

  function changeQuestionType(index: number, questionType: QuizQuestionType) {
    const question = form.questions[index];
    const options = questionType === "true_false"
      ? ["True", "False"]
      : question.question_type === "true_false"
        ? ["", ""]
        : question.options;
    const correctIndices = questionType === "multiple_select"
      ? question.correct_indices
      : [question.correct_indices[0] ?? 0];
    updateQuestion(index, {
      question_type: questionType,
      options,
      correct_indices: correctIndices,
      correct_index: correctIndices[0] ?? 0,
    });
  }

  function moveQuestion(index: number, target: number) {
    setForm((existing) => {
      if (target < 0 || target >= existing.questions.length || target === index) return existing;
      const questions = [...existing.questions];
      const [moved] = questions.splice(index, 1);
      questions.splice(target, 0, moved);
      return { ...existing, questions };
    });
  }

  function handleDrop(event: DragEvent<HTMLElement>, target: number) {
    event.preventDefault();
    if (dragIndex.current !== null) moveQuestion(dragIndex.current, target);
    dragIndex.current = null;
  }

  async function handleUpload(file: File | undefined, questionIndex?: number) {
    if (!file || !user) return;
    setError(null);
    setUploadingMedia(true);
    try {
      const path = await uploadQuizImage(user.id, activeQuizId, file);
      const urls = await getQuizMediaUrls([path]);
      const url = urls.get(path);
      if (!url) throw new Error("The uploaded image could not be opened.");
      if (questionIndex === undefined) {
        setForm((existing) => ({ ...existing, cover_image_path: path }));
        setCoverImageUrl(url);
      } else {
        updateQuestion(questionIndex, { image_path: path, image_url: url });
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload this image.");
    } finally {
      setUploadingMedia(false);
    }
  }

  function handleCancel() {
    if (hasUnsavedChanges && !window.confirm("Discard your unsaved quiz changes?")) return;
    navigate("/quizzes");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!user) {
      setError("Sign in before saving a quiz.");
      return;
    }
    if (!form.title.trim() || !form.category.trim()) {
      setError("Add a quiz title and category before saving.");
      return;
    }
    if (form.visibility === "team" && !form.team_id) {
      setError("Choose a team before making this quiz team-only.");
      return;
    }
    if (form.tags.length > 10 || form.tags.some((tag) => tag.length > 30)) {
      setError("Use up to 10 tags, each no longer than 30 characters.");
      return;
    }
    if (form.questions.length < 1 || form.questions.length > 50) {
      setError("A quiz must have between 1 and 50 questions.");
      return;
    }
    const cleanedQuestions = form.questions.map((question) => {
      const correctIndices = [...new Set(question.correct_indices)].sort((a, b) => a - b);
      return {
        ...question,
        prompt: question.prompt.trim(),
        options: question.options.map((option) => option.trim()),
        correct_index: correctIndices[0] ?? 0,
        correct_indices: correctIndices,
        explanation: question.explanation.trim(),
      };
    });
    const invalidQuestionIndex = cleanedQuestions.findIndex((question) =>
      !question.prompt
      || question.prompt.length > 500
      || question.options.length < 2
      || question.options.length > 6
      || question.options.some((option) => !option || option.length > 200)
      || question.correct_indices.length < 1
      || (isSingleAnswerType(question.question_type) && question.correct_indices.length !== 1)
      || question.correct_indices.some((index) => index < 0 || index >= question.options.length)
      || (question.question_type === "true_false"
        && (question.options[0] !== "True" || question.options[1] !== "False"))
      || (question.question_type === "image_multiple_choice" && !question.image_path)
      || question.point_value < 1
      || question.point_value > 100
      || (question.time_limit_seconds !== null
        && (question.time_limit_seconds < 5 || question.time_limit_seconds > 600))
      || question.explanation.length > 1000);
    if (invalidQuestionIndex !== -1) {
      setError(`Please complete question ${invalidQuestionIndex + 1}; check its choices, correct answer, points, and image.`);
      return;
    }

    const changes: QuizChanges = { ...form, questions: cleanedQuestions };
    setBusy(true);
    try {
      const savedQuizId = isEditing
        ? (await updateQuiz(activeQuizId, changes), activeQuizId)
        : await createQuiz(changes, activeQuizId);
      setSavedSnapshot(snapshotForm(changes));
      navigate(`/quizzes/${savedQuizId}`, { replace: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your quiz.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="page-status" role="status">Loading quiz editor…</div>;
  if (!isEditing && createAllowed === false) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz workshop</span>
        <h1>Quiz creation isn’t enabled.</h1>
        {error
          ? <p role="alert">{error}</p>
          : <p>Ask a team owner or administrator to enable quiz creation in team settings.</p>}
        <Link className="button button-primary" to="/quizzes">Back to quizzes</Link>
      </section>
    );
  }
  if (isEditing && error && createAllowed === false) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz workshop</span>
        <h1>This quiz can’t be edited.</h1>
        <p role="alert">{error}</p>
        <Link className="button button-primary" to="/quizzes">Back to quizzes</Link>
      </section>
    );
  }

  return (
    <section className="account-page quiz-editor-page">
      <button className="back-link quiz-editor-cancel" type="button" onClick={handleCancel}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to quizzes
      </button>
      <header className="page-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz workshop</span>
        <h1>{isEditing ? "Edit your quiz" : "Create a quiz"}</h1>
        <p>Build a polished quiz, preview it as a learner, and save your work as a draft or publish it.</p>
      </header>
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      <form className="quiz-editor-form" onSubmit={(event) => void handleSubmit(event)}>
        <section className="panel account-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Quiz details</span><h2>Set the context</h2></div>
          </div>
          <div className="form-stack">
            <label className="field">
              <span>Quiz title</span>
              <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} maxLength={120} required />
            </label>
            <label className="field">
              <span>Description <small>optional · 1,000 characters max</small></span>
              <textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} maxLength={1000} rows={3} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>FIRST program</span>
                <select value={form.program} onChange={(event) => updateForm("program", event.target.value as Program)}>
                  {programs.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Category</span>
                <select value={form.category} onChange={(event) => updateForm("category", event.target.value)} required>
                  {QUIZ_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Difficulty</span>
                <select value={form.difficulty} onChange={(event) => updateForm("difficulty", event.target.value as QuizChanges["difficulty"])}>
                  {QUIZ_DIFFICULTIES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Visibility</span>
                <select value={form.visibility} onChange={(event) => {
                  const visibility = event.target.value as QuizVisibility;
                  setForm((existing) => ({
                    ...existing,
                    visibility,
                    allow_public_duplication: visibility === "public" ? existing.allow_public_duplication : false,
                  }));
                }}>
                  <option value="private">Private — only you can access it</option>
                  <option value="team">Team — members of your selected team</option>
                  <option value="public">Public — anyone can discover and play</option>
                </select>
              </label>
              <label className="field">
                <span>Associated team <small>optional</small></span>
                <select value={form.team_id ?? ""} onChange={(event) => {
                  const teamId = event.target.value || null;
                  setForm((existing) => ({
                    ...existing,
                    team_id: teamId,
                    allow_team_editing: teamId ? existing.allow_team_editing : false,
                  }));
                }}>
                  <option value="">No associated team</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.team_number}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Quiz status</span>
                <select value={form.status} onChange={(event) => updateForm("status", event.target.value as QuizStatus)}>
                  <option value="draft">Draft — not available to learners</option>
                  <option value="published">Published — ready for practice</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Tags <small>comma-separated · up to 10</small></span>
              <input
                value={form.tags.join(", ")}
                onChange={(event) => updateForm("tags", [...new Set(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 11))}
                placeholder="e.g. Rover Ruckus, autonomous, strategy"
                maxLength={320}
              />
            </label>
            <div className="quiz-media-field">
              <span className="field-title">Cover image <small>optional · JPG, PNG, or WebP up to 5 MB</small></span>
              <label className="button button-secondary button-small">
                <ImagePlus size={15} aria-hidden="true" /> {uploadingMedia ? "Uploading…" : "Choose cover image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingMedia}
                  onChange={(event) => {
                    void handleUpload(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {coverImageUrl && (
                <div className="quiz-media-preview">
                  <img src={coverImageUrl} alt="Quiz cover preview" />
                  <button className="text-button" type="button" onClick={() => {
                    updateForm("cover_image_path", null);
                    setCoverImageUrl(null);
                  }}>Remove cover</button>
                </div>
              )}
            </div>
            <label className="quiz-draft-toggle">
              <input
                type="checkbox"
                checked={form.allow_question_preview}
                onChange={(event) => updateForm("allow_question_preview", event.target.checked)}
              />
              Allow a preview of the first five questions on the public quiz page
            </label>
          </div>
        </section>

        <section className="panel account-panel quiz-settings-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Quiz settings</span><h2>Choose how it plays</h2></div>
          </div>
          <div className="form-row">
            <label className="field">
              <span>Default question time</span>
              <select
                value={form.default_question_time_seconds}
                onChange={(event) => updateForm("default_question_time_seconds", Number(event.target.value))}
              >
                {defaultQuestionTimeOptions.map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds === 0 ? "No time limit" : `${seconds} seconds`}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="quiz-settings-grid">
            {([
              ["randomize_questions", "Randomize question order"],
              ["randomize_answers", "Randomize answer order"],
              ["show_explanations", "Show explanations after answering"],
              ["allow_multiple_attempts", "Allow multiple attempts"],
              ["show_correct_answers", "Show correct answers after completion"],
              ["allow_public_duplication", "Allow public duplication"],
              ["allow_team_editing", "Allow team coaches and administrators to edit"],
            ] as const).map(([field, label]) => (
              <label className="quiz-draft-toggle" key={field}>
                <input
                  type="checkbox"
                  checked={form[field]}
                  disabled={(field === "allow_public_duplication" && form.visibility !== "public")
                    || (field === "allow_team_editing" && !form.team_id)}
                  onChange={(event) => updateForm(field, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section className="quiz-question-editor">
          <div className="quiz-section-heading">
            <div><span className="eyebrow">Build your questions</span><h2>Questions</h2></div>
            <span className="team-count">{form.questions.length} / 50</span>
          </div>
          {form.questions.map((question, questionIndex) => (
            <article
              className="panel account-panel question-editor-card"
              key={questionIndex}
              draggable
              onDragStart={() => { dragIndex.current = questionIndex; }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, questionIndex)}
              onDragEnd={() => { dragIndex.current = null; }}
            >
              <div className="question-editor-heading">
                <span className="question-number"><GripVertical size={14} aria-hidden="true" /> Question {questionIndex + 1}</span>
                <div className="question-order-actions">
                  <button
                    className="icon-button quiz-icon-button"
                    type="button"
                    aria-label={`Move question ${questionIndex + 1} up`}
                    onClick={() => moveQuestion(questionIndex, questionIndex - 1)}
                    disabled={questionIndex === 0}
                  ><ArrowUp size={15} aria-hidden="true" /></button>
                  <button
                    className="icon-button quiz-icon-button"
                    type="button"
                    aria-label={`Move question ${questionIndex + 1} down`}
                    onClick={() => moveQuestion(questionIndex, questionIndex + 1)}
                    disabled={questionIndex === form.questions.length - 1}
                  ><ArrowDown size={15} aria-hidden="true" /></button>
                  <button
                    className="icon-button quiz-icon-button"
                    type="button"
                    aria-label={`Duplicate question ${questionIndex + 1}`}
                    onClick={() => setForm((existing) => ({
                      ...existing,
                      questions: [
                        ...existing.questions.slice(0, questionIndex + 1),
                        {
                          ...question,
                          options: [...question.options],
                          correct_indices: [...question.correct_indices],
                        },
                        ...existing.questions.slice(questionIndex + 1),
                      ],
                    }))}
                    disabled={form.questions.length >= 50}
                  ><Copy size={14} aria-hidden="true" /></button>
                  <button
                    className="icon-button quiz-delete-button"
                    type="button"
                    aria-label={`Remove question ${questionIndex + 1}`}
                    onClick={() => setForm((existing) => ({
                      ...existing,
                      questions: existing.questions.filter((_, index) => index !== questionIndex),
                    }))}
                    disabled={form.questions.length === 1}
                  ><Trash2 size={15} aria-hidden="true" /></button>
                </div>
              </div>
              <label className="field">
                <span>Question type</span>
                <select
                  value={question.question_type}
                  onChange={(event) => changeQuestionType(questionIndex, event.target.value as QuizQuestionType)}
                >
                  {questionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Question</span>
                <textarea
                  value={question.prompt}
                  onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })}
                  maxLength={500}
                  rows={2}
                  placeholder="Write a question your learners can answer."
                  required
                />
              </label>
              {(question.question_type === "image_multiple_choice" || question.image_path) && (
                <div className="quiz-media-field">
                  <span className="field-title">Question image <small>optional except for image-based questions</small></span>
                  <label className="button button-secondary button-small">
                    <ImagePlus size={15} aria-hidden="true" /> {uploadingMedia ? "Uploading…" : "Choose question image"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingMedia}
                      onChange={(event) => {
                        void handleUpload(event.currentTarget.files?.[0], questionIndex);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {question.image_url && (
                    <div className="quiz-media-preview">
                      <img src={question.image_url} alt={`Question ${questionIndex + 1} image preview`} />
                      <button className="text-button" type="button" onClick={() => updateQuestion(questionIndex, {
                        image_path: null,
                        image_url: null,
                      })}>Remove image</button>
                    </div>
                  )}
                </div>
              )}
              <fieldset className="answer-choice-editor">
                <legend>
                  Answer choices
                  <small>
                    {question.question_type === "multiple_select"
                      ? "Check every correct answer."
                      : "Choose the radio button beside the correct answer."}
                  </small>
                </legend>
                {question.options.map((option, optionIndex) => (
                  <div
                    className={`answer-option-editor${question.correct_indices.includes(optionIndex) ? " is-correct" : ""}`}
                    key={optionIndex}
                  >
                    <input
                      type={question.question_type === "multiple_select" ? "checkbox" : "radio"}
                      name={`correct-${questionIndex}`}
                      aria-label={`Mark choice ${optionIndex + 1} as correct`}
                      checked={question.correct_indices.includes(optionIndex)}
                      onChange={(event) => setCorrectChoice(questionIndex, optionIndex, event.target.checked)}
                    />
                    <label className="sr-only" htmlFor={`answer-${questionIndex}-${optionIndex}`}>Answer choice {optionIndex + 1}</label>
                    <input
                      id={`answer-${questionIndex}-${optionIndex}`}
                      value={option}
                      onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                      maxLength={200}
                      placeholder={`Answer choice ${optionIndex + 1}`}
                      readOnly={question.question_type === "true_false"}
                      required
                    />
                    <span>{question.correct_indices.includes(optionIndex) ? "Correct" : ""}</span>
                    {question.options.length > 2 && question.question_type !== "true_false" && (
                      <button
                        className="text-button option-remove"
                        type="button"
                        aria-label={`Remove answer choice ${optionIndex + 1}`}
                        onClick={() => {
                          const nextOptions = question.options.filter((_, index) => index !== optionIndex);
                          const nextIndices = question.correct_indices
                            .filter((index) => index !== optionIndex)
                            .map((index) => index > optionIndex ? index - 1 : index);
                          updateQuestion(questionIndex, {
                            options: nextOptions,
                            correct_indices: nextIndices,
                            correct_index: nextIndices[0] ?? 0,
                          });
                        }}
                      >Remove</button>
                    )}
                  </div>
                ))}
              </fieldset>
              {question.question_type !== "true_false" && (
                <button
                  className="text-button add-option-button"
                  type="button"
                  onClick={() => updateQuestion(questionIndex, { options: [...question.options, ""] })}
                  disabled={question.options.length >= 6}
                ><Plus size={14} aria-hidden="true" /> Add answer choice</button>
              )}
              <div className="form-row">
                <label className="field">
                  <span>Point value</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={question.point_value}
                    onChange={(event) => updateQuestion(questionIndex, { point_value: Number(event.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>Time limit <small>optional · uses quiz default if unset</small></span>
                  <select
                    value={question.time_limit_seconds ?? ""}
                    onChange={(event) => updateQuestion(questionIndex, {
                      time_limit_seconds: event.target.value ? Number(event.target.value) : null,
                    })}
                  >
                    <option value="">Use quiz default</option>
                    {questionTimeOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                  </select>
                </label>
              </div>
              <label className="field question-explanation-field">
                <span>Explanation <small>optional · shown after submission if enabled</small></span>
                <textarea
                  value={question.explanation}
                  onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })}
                  maxLength={1000}
                  rows={2}
                  placeholder="Explain why this answer is correct."
                />
              </label>
              <details className="quiz-question-preview-editor">
                <summary><Eye size={14} aria-hidden="true" /> Preview for learners</summary>
                {question.image_url && <img src={question.image_url} alt="" />}
                <h3>{question.prompt || "Your question will appear here."}</h3>
                <ul>{question.options.map((option, index) => <li key={index}>{option || `Answer choice ${index + 1}`}</li>)}</ul>
              </details>
            </article>
          ))}
          <button
            className="button button-secondary add-question-button"
            type="button"
            onClick={() => setForm((existing) => ({ ...existing, questions: [...existing.questions, makeQuestion()] }))}
            disabled={form.questions.length >= 50}
          ><Plus size={16} aria-hidden="true" /> Add a question</button>
        </section>

        <div className="quiz-editor-actions">
          <button className="button button-secondary" type="button" onClick={handleCancel}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={busy || uploadingMedia}>
            {busy ? "Saving quiz…" : form.status === "published" ? "Save and publish" : "Save draft"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
