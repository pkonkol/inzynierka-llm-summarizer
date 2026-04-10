from typing import Literal

from pydantic import BaseModel

from .summary import SummaryResponse


class JobCreateRequest(BaseModel):
    url: str


class JobStatusResponse(BaseModel):
    job_id: str
    source_url: str
    status: Literal["pending", "completed", "failed"]
    summary_data: SummaryResponse | None = None