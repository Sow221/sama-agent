"""Recherche web réelle pour le chat (sans clé d'API).

1. DuckDuckGo (version HTML) : résultats du web ouvert ;
2. repli Wikipédia FR (API JSON publique) si DuckDuckGo ne répond pas.

Ne lève jamais : une recherche ratée donne une liste vide, et l'agent répond
alors sans source web (il le dit), il n'invente pas de lien.
"""
from __future__ import annotations

import html
import logging
import re
from urllib.parse import parse_qs, unquote, urlparse

import httpx

log = logging.getLogger("sama.web")

_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
_TAG = re.compile(r"<[^>]+>")


def _clean(fragment: str) -> str:
    return html.unescape(_TAG.sub("", fragment)).strip()


def _real_url(href: str) -> str:
    """DuckDuckGo encapsule les liens (//duckduckgo.com/l/?uddg=<url>)."""
    href = html.unescape(href)
    if "uddg=" in href:
        target = parse_qs(urlparse(href).query).get("uddg", [""])[0]
        return unquote(target)
    return "https:" + href if href.startswith("//") else href


def parse_duckduckgo(page: str, k: int) -> list[dict]:
    results: list[dict] = []
    links = re.findall(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page, re.S)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</(?:a|div|td)>', page, re.S)
    for i, (href, title) in enumerate(links):
        url = _real_url(href)
        if not url.startswith("http") or "duckduckgo.com/y.js" in url:
            continue  # publicités
        results.append({
            "title": _clean(title),
            "url": url,
            "snippet": _clean(snippets[i]) if i < len(snippets) else "",
        })
        if len(results) >= k:
            break
    return results


def _duckduckgo(client: httpx.Client, query: str, k: int) -> list[dict]:
    r = client.post("https://html.duckduckgo.com/html/", data={"q": query, "kl": "fr-fr"})
    r.raise_for_status()
    return parse_duckduckgo(r.text, k)


def _wikipedia(client: httpx.Client, query: str, k: int) -> list[dict]:
    r = client.get("https://fr.wikipedia.org/w/api.php", params={
        "action": "query", "list": "search", "srsearch": query,
        "format": "json", "srlimit": k, "utf8": 1,
    })
    r.raise_for_status()
    return [{
        "title": item["title"],
        "url": "https://fr.wikipedia.org/wiki/" + item["title"].replace(" ", "_"),
        "snippet": _clean(item.get("snippet", "")),
    } for item in r.json().get("query", {}).get("search", [])]


def search_query(text: str, max_words: int = 18) -> str:
    """Requête courte à partir d'un message, même long (paragraphe) : la phrase
    interrogative si elle existe, sinon le début du message."""
    sentences = [x.strip() for x in re.split(r"(?<=[.!?])\s+|\n+", text) if x.strip()]
    questions = [x for x in sentences if x.endswith("?")]
    base = questions[-1] if questions else (sentences[0] if sentences else text)
    return " ".join(base.split()[:max_words])


def web_search(query: str, k: int = 5, timeout_s: float = 8.0) -> list[dict]:
    """Jusqu'à `k` résultats {title, url, snippet} ; [] si le web est injoignable."""
    query = query.strip()[:300]
    if not query:
        return []
    with httpx.Client(timeout=timeout_s, headers={"User-Agent": _UA}, follow_redirects=True) as client:
        for provider in (_duckduckgo, _wikipedia):
            try:
                found = provider(client, query, k)
                if found:
                    log.info("recherche web (%s) : %d résultat(s)", provider.__name__.strip("_"), len(found))
                    return found
            except Exception as exc:  # noqa: BLE001 — la recherche ne casse jamais un tour
                log.warning("recherche web %s en échec : %s", provider.__name__.strip("_"), exc)
    return []
