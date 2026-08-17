# services/llm/_prompts.py — prompt templates shared across summarization modes

from langchain_core.prompts import ChatPromptTemplate

_SYSTEM_MESSAGE = (
    "system",
    "You are an expert content summarizer. Write the entire output in language code: {language}. "
    "Return only valid JSON matching the requested schema.",
)

EXTRACT_FROM_CONTENT = ChatPromptTemplate.from_messages(
    [
        _SYSTEM_MESSAGE,
        (
            "human",
            "Generate {what_to_generate} from the content. {detail_guidance}\n\nContent:\n{text}",
        ),
    ]
)

SYNTHESIZE_FROM_TAKEAWAYS = ChatPromptTemplate.from_messages(
    [
        _SYSTEM_MESSAGE,
        (
            "human",
            "Generate summary from the key points. {detail_guidance}\n\nKey points:\n{takeaways}",
        ),
    ]
)
