import threading
import time

from planqer.cache import clear_cache, get_cached_optimization


def test_concurrent_cache_misses_compute_once():
    clear_cache()
    calls = 0
    calls_lock = threading.Lock()

    def optimize(parts, boards, kerf):
        nonlocal calls
        with calls_lock:
            calls += 1
        time.sleep(0.02)
        return "result"

    barrier = threading.Barrier(2)

    def request():
        barrier.wait()
        return get_cached_optimization(
            {100.0: 1}, [200.0], 3.0, optimize
        )

    first = threading.Thread(target=request)
    second = threading.Thread(target=request)
    first.start()
    second.start()
    first.join()
    second.join()

    assert calls == 1
    clear_cache()
