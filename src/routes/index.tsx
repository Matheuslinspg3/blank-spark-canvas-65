import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Layers, Palette } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canvas — A blank page, beautifully started" },
      {
        name: "description",
        content:
          "Canvas is a calm, minimal starting point for your next idea. A blank canvas, thoughtfully designed.",
      },
      { property: "og:title", content: "Canvas — A blank page, beautifully started" },
      {
        property: "og:description",
        content:
          "Canvas is a calm, minimal starting point for your next idea. A blank canvas, thoughtfully designed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const sections = [
  {
    icon: Palette,
    title: "Begin simply",
    body: "Start with nothing but intention. A quiet canvas where your first line sets the tone.",
  },
  {
    icon: Layers,
    title: "Compose freely",
    body: "Add structure as it earns its place. Nothing cluttered, nothing forced — just clear space to build.",
  },
  {
    icon: Sparkles,
    title: "Refine quietly",
    body: "Detail appears where it matters. Generous rhythm and restraint give your work room to breathe.",
  },
];

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <a href="/" className="font-display text-xl font-semibold tracking-tight">
          Canvas<span className="text-accent">.</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#approach" className="transition-colors hover:text-foreground">
            Approach
          </a>
          <a href="#principles" className="transition-colors hover:text-foreground">
            Principles
          </a>
        </nav>
        <Link
          to="/"
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/30"
        >
          Get started
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 md:px-10 md:pt-24">
        <p className="animate-fade-up text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          A blank canvas, beautifully started
        </p>
        <h1 className="animate-fade-up mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          Begin with nothing. Build something{" "}
          <span className="italic text-accent">worth keeping</span>.
        </h1>
        <p className="animate-fade-up mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
          Every great idea starts as an empty page. Canvas gives you a calm,
          considered foundation — clean type, generous space, and nothing in
          the way of your first stroke.
        </p>
        <div className="animate-fade-up mt-10 flex flex-wrap items-center gap-4">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start your project
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-medium transition-colors hover:border-foreground/30"
          >
            See the principles
          </Link>
        </div>
      </section>

      {/* Principles */}
      <section id="approach" className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {sections.map((s) => (
              <div key={s.title} className="flex flex-col gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
                  <s.icon className="h-5 w-5 text-accent" />
                </div>
                <h2 className="text-2xl font-semibold">{s.title}</h2>
                <p className="leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote / close */}
      <section id="principles" className="mx-auto max-w-6xl px-6 py-24 md:px-10">
        <figure className="max-w-2xl">
          <blockquote className="font-display text-3xl font-medium leading-snug tracking-tight md:text-4xl">
            “The space between things is where the meaning lives.”
          </blockquote>
          <figcaption className="mt-6 text-sm text-muted-foreground">
            — The spirit of the blank page
          </figcaption>
        </figure>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:px-10">
          <span className="font-display text-base font-semibold text-foreground">
            Canvas<span className="text-accent">.</span>
          </span>
          <span>Made to be filled in.</span>
        </div>
      </footer>
    </main>
  );
}
