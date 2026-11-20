import type { QuizDifficulty } from "../types/database";

export const QUIZ_CATEGORIES = [
  "Game Rules",
  "Robot Missions",
  "Engineering",
  "Programming",
  "CAD",
  "Electronics",
  "Mechanical Design",
  "Safety",
  "Scouting",
  "Team Knowledge",
  "Teammate Trivia",
  "General Robotics",
] as const;

export const QUIZ_DIFFICULTIES: QuizDifficulty[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Expert",
];
