"""Clone a public GitHub repo to a temp directory using GitPython."""

import logging
import tempfile
from pathlib import Path

import git

logger = logging.getLogger(__name__)

# Extensions we bother cloning/processing (keeps temp dirs small)
SUPPORTED_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx',
    '.java', '.go', '.rb', '.rs', '.cpp', '.c', '.h',
    '.md', '.txt',
}


def clone_repo(github_url: str) -> Path:
    """Clone *github_url* into a fresh temp directory and return its path.

    The caller is responsible for deleting the directory when done
    (use try/finally or a context manager).
    """
    tmp_dir = tempfile.mkdtemp(prefix='coderepo_')
    logger.info("Cloning %s into %s", github_url, tmp_dir)
    git.Repo.clone_from(github_url, tmp_dir, depth=1)
    logger.info("Clone complete: %s", tmp_dir)
    return Path(tmp_dir)


def collect_files(repo_path: Path) -> list[Path]:
    """Return all source files under *repo_path* with supported extensions."""
    files = [
        p for p in repo_path.rglob('*')
        if p.is_file()
        and p.suffix in SUPPORTED_EXTENSIONS
        and '.git' not in p.parts
    ]
    logger.info("Collected %d files from %s", len(files), repo_path)
    return files
