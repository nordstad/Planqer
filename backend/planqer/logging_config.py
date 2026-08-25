import structlog

def configure_structured_logging():
    """Configure structured logging for the application"""
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

def get_logger(name: str):
    """Get a structured logger instance"""
    return structlog.get_logger(name)

def log_optimization_request(logger, request_id: str, parts_count: int, 
                           boards_count: int, algorithm: str, project_name: str = None):
    """Log optimization request with structured data"""
    # Check if this is a structured logger (has bind method) or standard logger
    if hasattr(logger, 'bind'):
        # Structured logger
        logger.info(
            "optimization_request_received",
            request_id=request_id,
            parts_count=parts_count,
            boards_count=boards_count,
            algorithm=algorithm,
            project_name=project_name,
            event_type="optimization_request"
        )
    else:
        # Standard Python logger
        logger.info(f"[{request_id}] Optimization request - Parts: {parts_count}, Boards: {boards_count}, Algorithm: {algorithm}, Project: {project_name}")

def log_optimization_result(logger, request_id: str, algorithm: str, 
                          duration: float, boards_used: int, waste_amount: float,
                          success: bool = True, error: str = None):
    """Log optimization result with structured data"""
    # Check if this is a structured logger (has bind method) or standard logger
    if hasattr(logger, 'bind'):
        # Structured logger
        log_data = {
            "request_id": request_id,
            "algorithm": algorithm,
            "duration_seconds": duration,
            "event_type": "optimization_result"
        }
        
        if success:
            log_data.update({
                "boards_used": boards_used,
                "waste_amount": waste_amount,
                "status": "success"
            })
            logger.info("optimization_completed", **log_data)
        else:
            log_data.update({
                "status": "error",
                "error_message": error
            })
            logger.error("optimization_failed", **log_data)
    else:
        # Standard Python logger
        if success:
            logger.info(f"[{request_id}] Optimization completed - Algorithm: {algorithm}, Duration: {duration:.3f}s, Boards: {boards_used}, Waste: {waste_amount}")
        else:
            logger.error(f"[{request_id}] Optimization failed - Algorithm: {algorithm}, Duration: {duration:.3f}s, Error: {error}")

def log_api_request(logger, method: str, path: str, client_ip: str, 
                   user_agent: str = None, request_id: str = None):
    """Log API request with structured data"""
    if hasattr(logger, 'bind'):
        # Structured logger
        logger.info(
            "api_request",
            method=method,
            path=path,
            client_ip=client_ip,
            user_agent=user_agent,
            request_id=request_id,
            event_type="api_request"
        )
    else:
        # Standard Python logger
        logger.info(f"[{request_id}] {method} {path} from {client_ip} - {user_agent}")

def log_websocket_event(logger, event: str, task_id: str = None, 
                       connection_count: int = None):
    """Log WebSocket events with structured data"""
    if hasattr(logger, 'bind'):
        # Structured logger
        logger.info(
            "websocket_event",
            event=event,
            task_id=task_id,
            connection_count=connection_count,
            event_type="websocket"
        )
    else:
        # Standard Python logger
        logger.info(f"WebSocket {event} - Task: {task_id}, Connections: {connection_count}")

def log_cache_event(logger, event: str, key: str = None, hit_rate: float = None):
    """Log cache events with structured data"""
    if hasattr(logger, 'bind'):
        # Structured logger
        logger.info(
            "cache_event",
            event=event,
            cache_key=key,
            hit_rate=hit_rate,
            event_type="cache"
        )
    else:
        # Standard Python logger
        logger.info(f"Cache {event} - Key: {key}, Hit rate: {hit_rate}")

def log_error(logger, error: Exception, context: dict = None, request_id: str = None):
    """Log errors with structured data and context"""
    if hasattr(logger, 'bind'):
        # Structured logger
        log_data = {
            "error_type": type(error).__name__,
            "error_message": str(error),
            "request_id": request_id,
            "event_type": "error"
        }
        
        if context:
            log_data["context"] = context
            
        logger.error("application_error", **log_data, exc_info=True)
    else:
        # Standard Python logger
        context_str = f" Context: {context}" if context else ""
        logger.error(f"[{request_id}] {type(error).__name__}: {str(error)}{context_str}", exc_info=True)