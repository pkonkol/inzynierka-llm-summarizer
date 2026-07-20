from pydantic import BaseModel, HttpUrl

class SummaryResponse(BaseModel):
    title: str
    summary: str
    key_takeaways: list[str]
    source_url: str = ""
