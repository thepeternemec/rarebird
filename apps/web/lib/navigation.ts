/** Canonical destinations shared by the site, workspace menu and footer. */
export const SCREENER_HREF = "/app/screener";
export const RESEARCH_HREF = "/app/research";
export const AGENT_SETUP_HREF = "/docs/quickstart";

export const WORKSPACE_LINKS = [
  { href: SCREENER_HREF, label: "Stock screener", description: "Current setups, lifecycle updates and performance" },
  { href: RESEARCH_HREF, label: "Research", description: "Search stocks and crypto, read news and inspect evidence" },
] as const;

export const SITE_LINKS = [
  { href: RESEARCH_HREF, label: "Research", description: "Explore news, prices and supporting evidence" },
  { href: "/for-agents", label: "For agents", description: "Understand the MCP and REST integration" },
  { href: "/docs", label: "Docs", description: "Connection guides, tools and API examples" },
  { href: "/pricing", label: "Pricing", description: "Early access and planned membership" },
] as const;

export const NAVIGATION_LINKS = [
  ...WORKSPACE_LINKS,
  { href: AGENT_SETUP_HREF, label: "Connect your agent", description: "Add the MCP URL and test your first call" },
  ...SITE_LINKS.filter(link => link.href !== RESEARCH_HREF),
  { href: "/status", label: "Service status", description: "Check service availability and recent checks" },
  { href: "/faq", label: "Help & FAQ", description: "Answers about Rarebird and its coverage" },
] as const;
