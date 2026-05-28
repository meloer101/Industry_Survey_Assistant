import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from google.adk.models.lite_llm import LiteLlm

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)


@dataclass
class ResearchConfiguration:
    """Configuration for research-related models and parameters."""

    worker_model: LiteLlm = field(
        default_factory=lambda: LiteLlm(model="deepseek/deepseek-v4-flash")
    )
    critic_model: LiteLlm = field(
        default_factory=lambda: LiteLlm(model="deepseek/deepseek-v4-pro")
    )
    max_search_iterations: int = 3


config = ResearchConfiguration()
