# schemas/base.py — base for every model that appears in an OpenAPI response

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    # Pydantic derives `required` from "may be omitted when constructing", but a response schema
    # answers a different question: "will this key be in the JSON". Nothing here excludes unset
    # fields, so every field always ships — the flag makes the schema say so, and generated
    # clients get `x: T | null` instead of a `x?: T | null` they would have to null-check.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
