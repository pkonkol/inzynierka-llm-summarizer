import hashlib


def judge_prompt_version(prompt_text: str) -> str:
    """First 8 hex chars of sha256 over the prompt, the same scheme as rubric_version."""
    return hashlib.sha256(prompt_text.encode()).hexdigest()[:8]
