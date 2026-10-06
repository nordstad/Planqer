import threading
import time

from planqer.cache import clear_cache, generate_request_hash, get_cached_optimization


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
        return get_cached_optimization({100.0: 1}, [200.0], 3.0, optimize)

    first = threading.Thread(target=request)
    second = threading.Thread(target=request)
    first.start()
    second.start()
    first.join()
    second.join()

    assert calls == 1
    clear_cache()


def test_cache_does_not_merge_kerfs_with_different_feasibility():
    clear_cache()
    calls = []

    def optimize(parts, boards, kerf):
        calls.append(kerf)
        return "feasible" if sum(parts) + kerf <= boards[0] else "infeasible"

    parts = {6.0: 1, 3.0: 1}
    boards = [10.23445]
    lower_kerf = 1.2344
    higher_kerf = 1.23449

    assert round(lower_kerf, 3) == round(higher_kerf, 3)
    assert get_cached_optimization(parts, boards, lower_kerf, optimize) == "feasible"
    assert get_cached_optimization(parts, boards, higher_kerf, optimize) == "infeasible"
    assert calls == [lower_kerf, higher_kerf]
    clear_cache()


def test_cache_key_keeps_equivalent_normalized_requests_equivalent():
    assert generate_request_hash({100: 1}, [200], 3) == generate_request_hash(
        {100.0: 1}, [200.0], 3.0
    )
