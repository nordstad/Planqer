import os
import tempfile
from pathlib import Path

import pytest
import yaml
from planqer.helpers import compute_metrics, load_config


def test_load_config(tmp_path):
    # Test loading a simple YAML config file
    config_content = {"max_lengths": {"part_length": 100, "board_length": 200}}
    config_file = tmp_path / "test_config.yaml"
    with open(config_file, "w") as f:
        yaml.dump(config_content, f)
    config = load_config(Path(config_file))
    assert config["max_lengths"]["part_length"] == 100
    assert config["max_lengths"]["board_length"] == 200


# Edge case: compute_metrics with empty cut_list


def test_compute_metrics_empty_cut_list():
    cut_list = []
    board_length = 200
    total_waste, warning_count = compute_metrics(cut_list, board_length)
    assert total_waste == 0.0
    assert warning_count == 0


# Edge case: compute_metrics with empty boards in cut_list


def test_compute_metrics_empty_boards():
    cut_list = [[], []]
    board_length = 200
    total_waste, warning_count = compute_metrics(cut_list, board_length)
    assert total_waste == 400.0
    assert warning_count == 0
