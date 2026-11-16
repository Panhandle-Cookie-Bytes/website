export interface CreatorProfile {
  name: string;
  role: string;
  bio: string;
  link?: string;
}

const creators: CreatorProfile[] = [];

export const aboutContent = {
  introduction:
    "Robotics Quizzes is a place for robotics teams to practice what they learn, share knowledge, and feel more prepared for competition.",
  mission:
    "We want learning to be a practical part of building robots: approachable for every student, useful to mentors, and shaped around the questions teams actually face.",
  values: [
    {
      title: "Learn by doing",
      description: "Short practice quizzes help turn rules and concepts into knowledge you can use.",
    },
    {
      title: "Build together",
      description: "Coaches can organize a team space and share practice with the people they mentor.",
    },
    {
      title: "Made for robotics",
      description: "The platform is designed for the curious builders and volunteers who make robotics possible.",
    },
  ],
  creators,
};
