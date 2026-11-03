import unicodedata
from html.parser import HTMLParser

_BLOCK_TAGS = {"p", "div", "br", "pre", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"}


class _TextCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")


def to_prompt_text(raw: str, max_chars: int) -> str:
    """HTML stripped, Unicode NFKC, invisible characters removed, truncated."""
    collector = _TextCollector()
    collector.feed(raw)
    collector.close()
    text = unicodedata.normalize("NFKC", "".join(collector.parts))
    # Format characters (zero-width spaces, BOM, Unicode tag characters) hide instructions from a human reader.
    visible = "".join(char for char in text if unicodedata.category(char) != "Cf")
    return visible.strip()[:max_chars]
