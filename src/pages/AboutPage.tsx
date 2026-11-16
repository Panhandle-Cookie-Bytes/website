import { ArrowRight, BookOpen, HeartHandshake, Lightbulb } from "lucide-react";
import { Link } from "react-router-dom";
import { aboutContent } from "../content/about";

const valueIcons = [Lightbulb, HeartHandshake, BookOpen];

export function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <span className="eyebrow"><span className="eyebrow-mark" /> About Robotics Quizzes</span>
          <h1>Better prepared teams start with <span>better questions.</span></h1>
          <p>{aboutContent.introduction}</p>
        </div>
        <img className="about-hero-logo" src="/robotics-quizzes-logo.jpg" alt="Robotics Quizzes logo" />
      </section>

      <section className="about-mission panel">
        <span className="eyebrow">Why we’re building this</span>
        <h2>Our mission</h2>
        <p>{aboutContent.mission}</p>
      </section>

      <section className="about-values-section">
        <header className="page-heading">
          <span className="eyebrow"><span className="eyebrow-mark" /> What guides us</span>
          <h2>Learning for the whole team.</h2>
        </header>
        <div className="feature-grid">
          {aboutContent.values.map((value, index) => {
            const Icon = valueIcons[index];
            return (
              <article className="feature-card about-value-card" key={value.title}>
                <span className="feature-number">0{index + 1}</span>
                <span className="feature-icon"><Icon size={20} aria-hidden="true" /></span>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="about-creators-section">
        <header className="page-heading">
          <span className="eyebrow"><span className="eyebrow-mark" /> The people behind it</span>
          <h2>Meet the team.</h2>
          <p>Robotics Quizzes is made by people who care about helping robotics teams learn and grow.</p>
        </header>
        {aboutContent.creators.length ? (
          <div className="creator-grid">
            {aboutContent.creators.map((creator) => (
              <article className="panel creator-card" key={creator.name}>
                <div className="creator-avatar" aria-hidden="true">
                  {creator.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3>{creator.name}</h3>
                  <span>{creator.role}</span>
                </div>
                <p>{creator.bio}</p>
                {creator.link && (
                  <a className="text-link" href={creator.link} target="_blank" rel="noreferrer">
                    More about {creator.name} <ArrowRight size={14} aria-hidden="true" />
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="panel about-team-note">
            <span className="team-empty-icon"><HeartHandshake size={22} aria-hidden="true" /></span>
            <div>
              <h3>Creator profiles are on the way.</h3>
              <p>We’ll introduce the people behind Robotics Quizzes here as their stories are ready to share.</p>
            </div>
          </div>
        )}
      </section>

      <section className="closing-section about-closing">
        <div className="closing-mark"><BookOpen size={24} aria-hidden="true" /></div>
        <div>
          <span className="eyebrow">Ready when you are</span>
          <h2>Make your next practice count.</h2>
          <p>Create an account to find quizzes, start practicing, or build a team space.</p>
        </div>
        <Link className="button button-primary" to="/sign-up">
          Get started <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
