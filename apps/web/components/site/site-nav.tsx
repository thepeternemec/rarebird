/** Plain anchors remount page scroll and reveal controllers on navigation. */
import ThemeToggle from "./theme-toggle";
import BrandMark, { BrandWordmark } from "./brand-mark";
import MobileNavigation from "./mobile-navigation";
import { NAVIGATION_LINKS, SCREENER_HREF, SITE_LINKS } from "@/lib/navigation";
import "./mobile-navigation.css";

export default function SiteNav({ active }: { active?: string }) {
  return (
    <nav className="nav nav-site" aria-label="Main navigation">
      <div className="nav-pill">
        <a className="nav-logo" href="/" aria-label="Rarebird home">
          <BrandMark className="rb-nav-emblem" size={32} />
          <BrandWordmark className="brand-wordmark" width={122} />
        </a>
        <span className="nav-links">
          {SITE_LINKS.map(link => (
            <a key={link.href} className="nav-link" href={link.href} aria-current={active === link.href ? "page" : undefined}>{link.label}</a>
          ))}
        </span>
        <span className="nav-desktop-theme"><ThemeToggle /></span>
        <a className="nav-cta" href={SCREENER_HREF} aria-current={active === SCREENER_HREF ? "page" : undefined}><span className="nav-cta-wide">Stock screener</span><span className="nav-cta-compact">Screener</span></a>
        <MobileNavigation links={NAVIGATION_LINKS} active={active} />
      </div>
    </nav>
  );
}
