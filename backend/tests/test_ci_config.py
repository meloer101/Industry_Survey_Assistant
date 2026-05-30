from pathlib import Path
import tomllib


ROOT = Path(__file__).resolve().parents[2]


def test_backend_dev_dependencies_include_ruff():
    pyproject = tomllib.loads((ROOT / "backend" / "pyproject.toml").read_text())

    dev_dependencies = pyproject["dependency-groups"]["dev"]

    assert any(dependency.startswith("ruff") for dependency in dev_dependencies)


def test_ci_runs_ruff_check_in_backend_lint_job():
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text()

    assert "uv run ruff check ." in workflow
