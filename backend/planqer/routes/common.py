import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("planqer.api")
limiter = Limiter(key_func=get_remote_address)
