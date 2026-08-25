import hashlib
import json


def generate_request_hash(parts: dict[float, int], boards: list[float], kerf: float, algorithm_name: str = "default", optimize_for: str = "waste", board_costs: dict = None) -> str:
    """
    Generate a deterministic hash for the optimization request parameters.
    
    This ensures identical requests get the same hash for cache lookup.
    """
    # Sort parts and boards for consistent hashing
    sorted_parts = dict(sorted(parts.items()))
    sorted_boards = sorted(boards)
    
    # Create a data structure that represents the request
    request_data = {
        "parts": sorted_parts,
        "boards": sorted_boards,
        "kerf": round(kerf, 3),  # Round kerf to avoid floating point precision issues
        "algorithm": algorithm_name,
        "optimize_for": optimize_for,
        "board_costs": dict(sorted(board_costs.items())) if board_costs else None
    }
    
    # Convert to JSON string and hash
    json_str = json.dumps(request_data, sort_keys=True)
    return hashlib.md5(json_str.encode()).hexdigest()


# Global cache dictionary
_optimization_cache = {}
_cache_max_size = 1000
_cache_access_order = []


def get_cached_optimization(
    parts: dict[float, int],
    boards: list[float],
    kerf: float,
    optimization_func,
    algorithm_name: str = "default",
    optimize_for: str = "waste",
    board_costs: dict = None
) -> tuple[float, float, list[list[float]], float]:
    """
    Get optimization result from cache or compute and cache it.
    
    Args:
        parts: Dictionary mapping part lengths to quantities
        boards: List of available board lengths
        kerf: Saw blade width
        optimization_func: Function to call if not cached (should return the same tuple format)
        algorithm_name: Name of the algorithm for cache key generation
    
    Returns:
        Tuple of (optimal_board_length, cost, cut_list, total_waste, algorithm_used, computation_time)
    """
    global _optimization_cache, _cache_access_order
    
    request_hash = generate_request_hash(parts, boards, kerf, algorithm_name, optimize_for, board_costs)
    
    # Check if result is cached
    if request_hash in _optimization_cache:
        # Move to end (most recently used)
        _cache_access_order.remove(request_hash)
        _cache_access_order.append(request_hash)
        return _optimization_cache[request_hash]
    
    # Not in cache, compute the result
    result = optimization_func(parts, boards, kerf)
    
    # Add to cache
    _optimization_cache[request_hash] = result
    _cache_access_order.append(request_hash)
    
    # Implement LRU eviction if cache is full
    if len(_optimization_cache) > _cache_max_size:
        # Remove least recently used item
        lru_key = _cache_access_order.pop(0)
        del _optimization_cache[lru_key]
    
    return result


def get_cache_info():
    """Get cache statistics for monitoring."""
    return {
        "cache_size": len(_optimization_cache),
        "max_size": _cache_max_size,
        "hit_ratio": "N/A"  # Would need to track hits/misses to calculate
    }


def clear_cache():
    """Clear the optimization cache."""
    global _optimization_cache, _cache_access_order
    _optimization_cache.clear()
    _cache_access_order.clear()