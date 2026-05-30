import os
import logging
import concurrent.futures

from google.adk.tools import ToolContext
from tavily import TavilyClient


logger = logging.getLogger(__name__)
TAVILY_TIMEOUT = 20
_client: TavilyClient | None = None
_client_api_key: str | None = None


def _get_tavily_client(api_key: str) -> TavilyClient:
    global _client, _client_api_key
    if _client is None or _client_api_key != api_key:
        _client = TavilyClient(api_key=api_key)
        _client_api_key = api_key
    return _client


def tavily_search(query: str, tool_context: ToolContext) -> str:
    """Search the web and return results with source IDs for citation.

    Args:
        query: The search query string.
        tool_context: ADK tool context providing session state access.

    Returns:
        Formatted search results, each prefixed with a [src-N] citation ID.
    """
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        logger.warning("Tavily search skipped because TAVILY_API_KEY is not configured.")
        return "Search unavailable: TAVILY_API_KEY is not configured."

    def _do_search() -> dict:
        client = _get_tavily_client(api_key)
        return client.search(query, search_depth="basic", max_results=5)

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(_do_search)
        response = future.result(timeout=TAVILY_TIMEOUT)
    except concurrent.futures.TimeoutError:
        future.cancel()
        logger.warning("Tavily search timed out for query: %s", query)
        return "Search unavailable: Tavily request timed out. Try again later."
    except Exception:
        logger.warning("Tavily search failed for query: %s", query, exc_info=True)
        return "Search unavailable: Tavily request failed. Try again later."
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    url_to_short_id: dict = tool_context.state.get("url_to_short_id", {})
    sources: dict = tool_context.state.get("sources", {})
    id_counter = len(url_to_short_id) + 1

    formatted: list[str] = []
    for result in response.get("results", []):
        url: str = result.get("url", "")
        title: str = result.get("title", url)
        content: str = result.get("content", "")
        domain: str = url.split("/")[2] if url else ""

        if url not in url_to_short_id:
            short_id = f"src-{id_counter}"
            url_to_short_id[url] = short_id
            sources[short_id] = {
                "short_id": short_id,
                "title": title,
                "url": url,
                "domain": domain,
                "supported_claims": [],
            }
            id_counter += 1
        else:
            short_id = url_to_short_id[url]

        formatted.append(f"[{short_id}] **{title}**\nURL: {url}\n{content}")

    tool_context.state["url_to_short_id"] = url_to_short_id
    tool_context.state["sources"] = sources

    return "\n\n---\n\n".join(formatted) if formatted else "No results found."
