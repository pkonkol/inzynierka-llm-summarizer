from pydantic import BaseModel, HttpUrl

class SummaryResponse(BaseModel):
    title: str
    short_summary: str
    key_takeaways: str
    source_url: str = ""
