"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { API_BASE } from "./content";
import { chooseSearchResult, findAssets, workspaceSuggestions, type CoinSuggestion, type LookupAsset, type MarketCoin } from "./landing-lookup-data";
import "./catalog-search.css";

type SearchResult = { term: string; phase: "ready"; topics: LookupAsset[] } | { term: string; phase: "error" };

type Suggestion = LookupAsset | CoinSuggestion;
const suggestionId = (topic: Suggestion) => "beat_id" in topic ? topic.beat_id : topic.coin_id;

export default function CatalogSearch({ id, className, onSelect, initialQuery = "", marketCoins }: {
  id: string;
  className?: string;
  onSelect: (asset: LookupAsset) => void;
  initialQuery?: string;
  marketCoins?: { coins: readonly MarketCoin[]; onSelect: (coinId: string) => void };
}) {
  const menu = useId();
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(Boolean(initialQuery));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [retry, setRetry] = useState(0);
  const term = query.trim();
  const result = search?.term === term ? search : null;
  const catalogTopics = result?.phase === "ready" ? result.topics : [];
  const topics = marketCoins && result ? workspaceSuggestions(catalogTopics, marketCoins.coins, term) : catalogTopics;
  const index = topics.findIndex(topic => suggestionId(topic) === activeId);
  const expanded = open && Boolean(term);
  const optionId = (topic: Suggestion) => menu + "-" + suggestionId(topic);

  useEffect(() => {
    if (!term || !open) return;
    const request = new AbortController();
    let active = true;
    let timeout: number | undefined;
    const debounce = window.setTimeout(() => {
      timeout = window.setTimeout(() => request.abort(), 8_000);
      void findAssets(API_BASE, term, request.signal)
        .then(topics => { if (active) setSearch({ term, phase: "ready", topics }); })
        .catch(() => { if (active) setSearch({ term, phase: "error" }); })
        .finally(() => window.clearTimeout(timeout));
    }, 200);
    return () => {
      active = false;
      request.abort();
      window.clearTimeout(debounce);
      window.clearTimeout(timeout);
    };
  }, [open, term, retry]);

  useEffect(() => {
    if (!expanded) return;

    // A touch can blur the input without a next focus target. Close on an
    // outside interaction so the option stays mounted until its click.
    function closeOutside(event: Event) {
      if (!(event.target instanceof Node) || form.current?.contains(event.target)) return;
      setOpen(false);
      setActiveId(null);
    }

    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside, true);
    };
  }, [expanded]);

  function choose(topic: Suggestion) {
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) input.current?.blur();
    else input.current?.focus();
    setQuery("");
    setOpen(false);
    setActiveId(null);
    if ("beat_id" in topic) onSelect(topic);
    else marketCoins?.onSelect(topic.coin_id);
  }

  return <form ref={form} className={"rb-catalog-search" + (className ? " " + className : "")} role="search"
    aria-label="Search by ticker or company"
    onSubmit={event => {
      event.preventDefault();
      const topic = chooseSearchResult(topics, term, expanded ? index : -1);
      if (topic) choose(topic);
      else {
        setOpen(true);
        if (result?.phase === "error") {
          setSearch(null);
          setRetry(value => value + 1);
        }
      }
    }}>
    <div className="catalog-search-field">
      <Search size={17} aria-hidden="true" />
      <input ref={input} id={id} type="text" role="combobox" aria-label="Search ticker or company"
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? menu : undefined}
        aria-activedescendant={expanded && topics[index] ? optionId(topics[index]) : undefined}
        placeholder="Search ticker or company" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={80} enterKeyHint="search"
        value={query} onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActiveId(null); }}
        onKeyDown={event => {
          if (event.key === "Escape" && expanded) {
            event.preventDefault();
            setOpen(false);
            setActiveId(null);
          }
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && topics.length) {
            event.preventDefault();
            setOpen(true);
            const next = event.key === "ArrowDown" ? (index + 1) % topics.length : index <= 0 ? topics.length - 1 : index - 1;
            setActiveId(suggestionId(topics[next]!));
          }
        }} />
      {query && <button className="catalog-search-clear" type="button" aria-label="Clear search"
        onClick={() => { setQuery(""); setActiveId(null); setOpen(false); input.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
    </div>
    {expanded && <div className="catalog-search-menu" data-lenis-prevent>
      <ul id={menu} role="listbox" aria-label="Matching stocks and crypto">
        {topics.map((topic, position) => <li key={suggestionId(topic)} role="presentation">
          <button type="button" className="catalog-search-option" id={optionId(topic)} role="option"
            tabIndex={-1} aria-selected={position === index}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(topic)}>
            <span><strong>{topic.label}</strong><small>{topic.asset === "crypto" ? "Crypto" : "Stock"}</small></span>
            <span>{topic.ticker}<ArrowRight size={14} aria-hidden="true" /></span>
          </button>
        </li>)}
      </ul>
      {!topics.length && <p role="status">
        {!result ? "Finding matches…" : result.phase === "error" ? "Search unavailable. Press Enter to retry." : "No matching stock or crypto asset."}
      </p>}
    </div>}
  </form>;
}
