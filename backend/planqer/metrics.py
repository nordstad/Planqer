import time
from functools import wraps
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# Prometheus metrics
REQUEST_COUNT = Counter(
    'planqer_http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status_code']
)

REQUEST_DURATION = Histogram(
    'planqer_http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint']
)

OPTIMIZATION_COUNT = Counter(
    'planqer_optimization_requests_total',
    'Total optimization requests',
    ['algorithm', 'status']
)

OPTIMIZATION_DURATION = Histogram(
    'planqer_optimization_duration_seconds',
    'Optimization processing time in seconds',
    ['algorithm']
)

PARTS_PROCESSED = Histogram(
    'planqer_parts_processed_total',
    'Number of parts processed in optimization',
    ['algorithm']
)

BOARDS_USED = Histogram(
    'planqer_boards_used_total',
    'Number of boards used in optimization',
    ['algorithm']
)

WASTE_PERCENTAGE = Histogram(
    'planqer_waste_percentage',
    'Percentage of material wasted',
    ['algorithm']
)

ACTIVE_REQUESTS = Gauge(
    'planqer_active_requests',
    'Number of active HTTP requests'
)

CACHE_HITS = Counter(
    'planqer_cache_hits_total',
    'Total cache hits'
)

CACHE_MISSES = Counter(
    'planqer_cache_misses_total',
    'Total cache misses'
)

WEBSOCKET_CONNECTIONS = Gauge(
    'planqer_websocket_connections_active',
    'Number of active WebSocket connections'
)

def metrics_endpoint():
    """Prometheus metrics endpoint"""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )

def track_request_metrics(func):
    """Decorator to track HTTP request metrics"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        ACTIVE_REQUESTS.inc()
        start_time = time.time()
        
        try:
            response = await func(*args, **kwargs)
            status_code = getattr(response, 'status_code', 200)
            REQUEST_COUNT.labels(
                method='POST',  # Most optimization endpoints are POST
                endpoint=func.__name__,
                status_code=status_code
            ).inc()
            
            return response
        except Exception:
            REQUEST_COUNT.labels(
                method='POST',
                endpoint=func.__name__,
                status_code=500
            ).inc()
            raise
        finally:
            duration = time.time() - start_time
            REQUEST_DURATION.labels(
                method='POST',
                endpoint=func.__name__
            ).observe(duration)
            ACTIVE_REQUESTS.dec()
    
    return wrapper

def track_optimization_metrics(algorithm: str, success: bool, duration: float, 
                             parts_count: int, boards_used: int, waste_percent: float):
    """Track optimization-specific metrics"""
    status = 'success' if success else 'error'
    
    OPTIMIZATION_COUNT.labels(algorithm=algorithm, status=status).inc()
    
    if success:
        OPTIMIZATION_DURATION.labels(algorithm=algorithm).observe(duration)
        PARTS_PROCESSED.labels(algorithm=algorithm).observe(parts_count)
        BOARDS_USED.labels(algorithm=algorithm).observe(boards_used)
        WASTE_PERCENTAGE.labels(algorithm=algorithm).observe(waste_percent)

def track_cache_hit():
    """Track cache hit"""
    CACHE_HITS.inc()

def track_cache_miss():
    """Track cache miss"""
    CACHE_MISSES.inc()

def track_websocket_connection(delta: int):
    """Track WebSocket connection changes"""
    if delta > 0:
        WEBSOCKET_CONNECTIONS.inc()
    else:
        WEBSOCKET_CONNECTIONS.dec()