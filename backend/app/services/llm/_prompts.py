# services/llm/_prompts.py — prompt templates shared across summarization strategies

from langchain_core.prompts import ChatPromptTemplate

_SYSTEM_MESSAGE = (
    "system",
    "You are an expert content summarizer. {language_instruction} "
    "Return only valid JSON matching the requested schema.",
)

# Repeats {detail_guidance} right before the answer: structured output (tool calling / json_mode)
# has no assistant turn to prefill, so repetition is what reinforces length and format.
_REMINDER_MESSAGE = ("human", "Reminder — follow these requirements precisely: {detail_guidance}")

EXTRACT_FROM_CONTENT = ChatPromptTemplate.from_messages(
    [
        _SYSTEM_MESSAGE,
        (
            "human",
            "Generate {what_to_generate} from the content. {detail_guidance}\n\nContent:\n{text}",
        ),
        _REMINDER_MESSAGE,
    ]
)

SYNTHESIZE_FROM_TAKEAWAYS = ChatPromptTemplate.from_messages(
    [
        _SYSTEM_MESSAGE,
        (
            "human",
            "Generate summary from the key points. {detail_guidance}\n\nKey points:\n{takeaways}",
        ),
        _REMINDER_MESSAGE,
    ]
)
