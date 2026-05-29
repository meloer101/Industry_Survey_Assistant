import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from google.adk.models.lite_llm import LiteLlm
import litellm

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

litellm.num_retries = int(os.environ.get("LITELLM_NUM_RETRIES", "3"))


@dataclass
class ResearchConfiguration:
    """Configuration for research-related models and parameters."""

    worker_model: LiteLlm = field(
        default_factory=lambda: LiteLlm(
            model=os.environ.get("WORKER_MODEL", "deepseek/deepseek-v4-flash")
        )
    )
    critic_model: LiteLlm = field(
        default_factory=lambda: LiteLlm(
            model=os.environ.get("CRITIC_MODEL", "deepseek/deepseek-v4-pro")
        )
    )
    max_search_iterations: int = field(
        default_factory=lambda: int(os.environ.get("MAX_SEARCH_ITERATIONS", "3"))
    )


config = ResearchConfiguration()
