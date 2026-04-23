"""Shared application logger.

Import `logger` anywhere in `srcs` and call `logger.info(...)`, etc.
"""
import logging
import sys

from srcs.config import get_settings


def _build_logger() -> logging.Logger:
    log = logging.getLogger("settleops")
    if log.handlers:
        return log

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)-7s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    log.addHandler(handler)
    log.setLevel(logging.DEBUG if get_settings().DEBUG else logging.INFO)
    log.propagate = False
    return log


logger = _build_logger()

__all__ = ["logger"]
