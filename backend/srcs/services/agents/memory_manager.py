import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class MemoryManager:
    """Handles loading and parsing of memory or instruction files for agents.
    Can be expanded to handle summarisation middleware or dynamic memory retrieval.
    """
    
    def __init__(self, base_path: Optional[str] = None):
        if base_path:
            self.base_dir = base_path
        else:
            # Default to tracking the 'prompts/' directory relative to this file
            self.base_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "prompts"
            )

    def load_prompt(self, filename: str) -> str:
        """Load a text/markdown file by filename from the prompts directory."""
        file_path = os.path.join(self.base_dir, filename)
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read().strip()
            except Exception as e:
                logger.error(f"Failed to read prompt file {filename}: {e}")
                return ""
        logger.warning(f"Prompt file not found: {file_path}")
        return ""

    def load_context(self) -> str:
        """Helper to specifically load the memory context file."""
        return self.load_prompt("CONTEXT.md") or "No memory context provided."

    def load_system_prompt(self) -> str:
        """Helper to specifically load the baseline instructions."""
        fallback = "You are a helpful AI assistant."
        return self.load_prompt("SYSTEM.md") or fallback


# Global default instance
memory_manager = MemoryManager()


if __name__ == "__main__":
    # Test block
    print("--- MemoryManager Test ---")
    
    # 1. System Prompt
    system_prompt = memory_manager.load_system_prompt()
    print(f"\\nSYSTEM.md Output:\\n{system_prompt}\\n")
    
    # 2. Context Prompt
    context_prompt = memory_manager.load_context()
    print(f"CONTEXT.md Output:\\n{context_prompt}\\n")

