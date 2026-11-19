import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { createQuiz, getQuizEditor, updateQuiz, type QuizChanges } from "../services/quizService";
import { canCreateQuizzes } from "../services/teamService";
import type { Program, QuizQuestionInput, QuizStatus, TeamVisibility } from "../types/database";

const programs: Program[] = ["FLL", "FTC", "FRC", "General FIRST"];

function makeQuestion(): QuizQuestionInput {
  return { prompt: "", options: ["", ""], correct_index: 0, explanation: "" };
}

export function QuizEditorPage() {
  const { quizId } = useParams();
  const isEditing = Boolean(quizId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [program, setProgram] = useState<Program>("FTC");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<TeamVisibility>("private");
  const [status, setStatus] = useState<QuizStatus>("draft");
  const [questions, setQuestions] = useState<QuizQuestionInput[]>([makeQuestion()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createAllowed, setCreateAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (!quizId) {
      void canCreateQuizzes().then((allowed) => {
        if (active) setCreateAllowed(allowed);
      }).catch((loadError: unknown) => {
        if (active) {
          setCreateAllowed(false);
          setError(loadError instanceof Error ? loadError.message : "Could not check quiz-creation permission.");
        }
      }).finally(() => {
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }

    void getQuizEditor(quizId).then((editor) => {
      if (!active) return;
      if (editor.quiz.created_by !== user?.id) {
        setError("Only the quiz creator can edit this quiz.");
        return;
      }
      setTitle(editor.quiz.title);
      setDescription(editor.quiz.description);
      setProgram(editor.quiz.program);
      setCategory(editor.quiz.category);
      setVisibility(editor.quiz.visibility);
      setStatus(editor.quiz.status);
      setQuestions(editor.questions.length ? editor.questions : [makeQuestion()]);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this quiz.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [quizId, user?.id]);

  function updateQuestion(index: number, changes: Partial<QuizQuestionInput>) {
    setQuestions((existing) => existing.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...changes } : question));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    const question = questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.map((option, index) => index === optionIndex ? value : option),
    });
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((existing) => {
      const target = index + direction;
      if (target < 0 || target >= existing.length) return existing;
      const reordered = [...existing];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!title.trim() || !category.trim()) {
      setError("Add a quiz title and category before saving.");
      return;
    }
    if (questions.length < 1 || questions.length > 50) {
      setError("A quiz must have between 1 and 50 questions.");
      return;
    }
    const cleanedQuestions = questions.map((question) => ({
      prompt: question.prompt.trim(),
      options: question.options.map((option) => option.trim()),
      correct_index: question.correct_index,
      explanation: question.explanation.trim(),
    }));
    const invalidQuestionIndex = cleanedQuestions.findIndex((question) =>
      !question.prompt
      || question.prompt.length > 500
      || question.options.length < 2
      || question.options.length > 6
      || question.options.some((option) => !option || option.length > 200)
      || question.correct_index < 0
      || question.correct_index >= question.options.length
      || question.explanation.length > 1000);
    if (invalidQuestionIndex !== -1) {
      setError(`Please complete question ${invalidQuestionIndex + 1}; every question needs 2–6 answer options and one correct answer.`);
      return;
    }

    const changes: QuizChanges = {
      title: title.trim(),
      description: description.trim(),
      program,
      category: category.trim(),
      visibility,
      status,
      questions: cleanedQuestions,
    };

    setBusy(true);
    try {
      const savedQuizId = quizId
        ? (await updateQuiz(quizId, changes), quizId)
        : await createQuiz(changes);
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

  return (
    <section className="account-page quiz-editor-page">
      <Link className="back-link" to="/quizzes"><ArrowLeft size={14} aria-hidden="true" /> Back to quizzes</Link>
      <header className="page-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz workshop</span>
        <h1>{isEditing ? "Edit your quiz" : "Create a quiz"}</h1>
        <p>Write clear multiple-choice questions and mark the answer key for automatic scoring.</p>
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
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
            </label>
            <label className="field">
              <span>Description <small>optional · 1,000 characters max</small></span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>FIRST program</span>
                <select value={program} onChange={(event) => setProgram(event.target.value as Program)}>
                  {programs.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Category</span>
                <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} placeholder="Game rules, robot design…" required />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Who can find this quiz?</span>
                <select value={visibility} onChange={(event) => setVisibility(event.target.value as TeamVisibility)}>
                  <option value="private">Private — only you and assigned teams</option>
                  <option value="public">Public — signed-in users can discover it</option>
                </select>
              </label>
              <label className="field">
                <span>Quiz status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as QuizStatus)}>
                  <option value="draft">Draft — not available to learners</option>
                  <option value="published">Published — ready for practice</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="quiz-question-editor">
          <div className="quiz-section-heading">
            <div><span className="eyebrow">Build your questions</span><h2>Multiple-choice questions</h2></div>
            <span className="team-count">{questions.length} / 50</span>
          </div>
          {questions.map((question, questionIndex) => (
            <article className="panel account-panel question-editor-card" key={questionIndex}>
              <div className="question-editor-heading">
                <span className="question-number">Question {questionIndex + 1}</span>
                <div className="question-order-actions">
                  <button
                    className="icon-button quiz-icon-button"
                    type="button"
                    aria-label={`Move question ${questionIndex + 1} up`}
                    onClick={() => moveQuestion(questionIndex, -1)}
                    disabled={questionIndex === 0}
                  ><ArrowUp size={15} aria-hidden="true" /></button>
                  <button
                    className="icon-button quiz-icon-button"
                    type="button"
                    aria-label={`Move question ${questionIndex + 1} down`}
                    onClick={() => moveQuestion(questionIndex, 1)}
                    disabled={questionIndex === questions.length - 1}
                  ><ArrowDown size={15} aria-hidden="true" /></button>
                  <button
                    className="icon-button quiz-delete-button"
                    type="button"
                    aria-label={`Remove question ${questionIndex + 1}`}
                    onClick={() => setQuestions((existing) => existing.filter((_, index) => index !== questionIndex))}
                    disabled={questions.length === 1}
                  ><Trash2 size={15} aria-hidden="true" /></button>
                </div>
              </div>
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
              <fieldset className="answer-choice-editor">
                <legend>Answer choices <small>Select the radio button beside the correct answer.</small></legend>
                {question.options.map((option, optionIndex) => (
                  <div className={`answer-option-editor${question.correct_index === optionIndex ? " is-correct" : ""}`} key={optionIndex}>
                    <input
                      type="radio"
                      name={`correct-${questionIndex}`}
                      aria-label={`Mark choice ${optionIndex + 1} as correct`}
                      checked={question.correct_index === optionIndex}
                      onChange={() => updateQuestion(questionIndex, { correct_index: optionIndex })}
                    />
                    <label className="sr-only" htmlFor={`answer-${questionIndex}-${optionIndex}`}>Answer choice {optionIndex + 1}</label>
                    <input
                      id={`answer-${questionIndex}-${optionIndex}`}
                      value={option}
                      onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                      maxLength={200}
                      placeholder={`Answer choice ${optionIndex + 1}`}
                      required
                    />
                    <span>{question.correct_index === optionIndex ? "Correct" : ""}</span>
                    {question.options.length > 2 && (
                      <button
                        className="text-button option-remove"
                        type="button"
                        aria-label={`Remove answer choice ${optionIndex + 1}`}
                        onClick={() => {
                          const nextOptions = question.options.filter((_, index) => index !== optionIndex);
                          const nextCorrect = question.correct_index === optionIndex
                            ? 0
                            : question.correct_index > optionIndex ? question.correct_index - 1 : question.correct_index;
                          updateQuestion(questionIndex, { options: nextOptions, correct_index: nextCorrect });
                        }}
                      >Remove</button>
                    )}
                  </div>
                ))}
              </fieldset>
              <button
                className="text-button add-option-button"
                type="button"
                onClick={() => updateQuestion(questionIndex, { options: [...question.options, ""] })}
                disabled={question.options.length >= 6}
              ><Plus size={14} aria-hidden="true" /> Add answer choice</button>
              <label className="field question-explanation-field">
                <span>Explanation <small>optional · shown after submission</small></span>
                <textarea
                  value={question.explanation}
                  onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })}
                  maxLength={1000}
                  rows={2}
                  placeholder="Explain why this answer is correct."
                />
              </label>
            </article>
          ))}
          <button
            className="button button-secondary add-question-button"
            type="button"
            onClick={() => setQuestions((existing) => [...existing, makeQuestion()])}
            disabled={questions.length >= 50}
          ><Plus size={16} aria-hidden="true" /> Add a question</button>
        </section>

        <div className="quiz-editor-actions">
          <Link className="button button-secondary" to="/quizzes">Cancel</Link>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? "Saving quiz…" : status === "published" ? "Save and publish" : "Save draft"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
