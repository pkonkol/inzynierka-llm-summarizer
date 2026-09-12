# services/llm/_prompts.py — prompt templates shared across summarization strategies

from langchain_core.prompts import ChatPromptTemplate

_SYSTEM_MESSAGE = (
    "system",
    "You are an expert content summarizer. Write the entire output in language code: {language}. "
    "Return only valid JSON matching the requested schema.",
)

# The reminder message repeats {detail_guidance} verbatim as a closing human turn. LangChain's
# with_structured_output(..., include_raw=True) goes through tool-calling/json_mode on every
# provider used here, which has no assistant-turn continuation point to prefill into — so this
# repetition, not a true prefill, is the mechanism for reinforcing the length/format instruction
# right before the model answers. See .scratch/claude_plans/dlugosc-i-rejestr-podsumowan-analiza.md
# (Aneks A.6 / Aneks C) for why reinforcement is used instead.
_REMINDER_MESSAGE = ("human", "Reminder — follow these requirements precisely: {detail_guidance}")

EXTRACT_FROM_CONTENT = ChatPromptTemplate.from_messages(
    [
        _SYSTEM_MESSAGE,
        (
            "human",
            "Generate {what_to_generate} from the content. {detail_guidance}"
            "{focus_query_clause}\n\nContent:\n{text}",
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
