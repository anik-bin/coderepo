"""TypedDict schema for the CodeRepo LangGraph agent state."""

from typing import TypedDict


class AgentState(TypedDict):
    repo_id: str
    question: str
    chunks: list[dict]       # retrieved code chunks from Chroma
    answer: str              # synthesised answer text
    citations: list[dict]    # [{file_path, start_line, end_line, github_url}]
    retry_count: int         # number of synthesiser re-runs triggered by critic
    is_grounded: bool        # critic verdict: answer is supported by chunks
    corrective_hint: str     # passed back to synthesiser when not grounded
