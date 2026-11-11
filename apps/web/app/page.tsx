import { SiteHeader } from "../components/landing/site-header";
import { Hero } from "../components/landing/hero";
import { Steps } from "../components/landing/steps";
import { Demo } from "../components/landing/demo";
import { Pricing } from "../components/landing/pricing";
import { Install } from "../components/landing/install";
import { Footer } from "../components/landing/footer";

/**
 * The landing page (docs/project.md §6.1).
 *
 * The sections of §6.1, in order: hero, how it works, live demo, pricing,
 * install snippet, footer.
 *
 * It is static: no widget runs here yet (that arrives in Phase 6), nothing
 * is fetched, and the only client-side code is on the install section: the
 * copy button, and the origin the snippet names.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Steps />
        <Demo />
        <Pricing />
        <Install />
      </main>
      <Footer />
    </div>
  );
}
