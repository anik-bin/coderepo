"""Compile and export the CodeRepo LangGraph StateGraph.

The graph is compiled once at module load and reused across requests.

Flow: router → retriever → synthesiser → critic → (end | synthesiser retry)
"""

import logging

from langgraph.graph import StateGraph, END

from agent.state import AgentState
from agent.nodes import router_node, retriever_node, synthesiser_node, critic_node, should_retry

logger = logging.getLogger(__name__)


def _build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node('router', router_node)
    workflow.add_node('retriever', retriever_node)
    workflow.add_node('synthesiser', synthesiser_node)
    workflow.add_node('critic', critic_node)

    workflow.set_entry_point('router')
    workflow.add_edge('router', 'retriever')
    workflow.add_edge('retriever', 'synthesiser')
    workflow.add_edge('synthesiser', 'critic')
    workflow.add_conditional_edges(
        'critic',
        should_retry,
        {'synthesiser': 'synthesiser', 'end': END},
    )

    compiled = workflow.compile()
    logger.info("LangGraph agent compiled successfully")
    return compiled


# Module-level singleton — compiled once, reused for every request
graph = _build_graph()
