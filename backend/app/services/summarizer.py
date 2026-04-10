def build_summary_prompt(text: str) -> str:
    return (
        "Summarize the following web content into concise key points.\n\n"
        f"{text}"
    )
