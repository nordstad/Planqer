"""
Tile / surface layout optimization.

Unlike sheet_optimization.py (irregular 2D bin packing), this is a periodic
grid placement problem: identical tiles laid on a fixed-pitch lattice, where
the only real decision variables are the lattice's start offset and its bond
pattern. Everything else (tile count, cut sizes, waste) is derived from
those choices, not searched for.

See /Users/sssenz/dev/github.com/refactor/planqer/.plans/tile-layout.md for
the full design plan, phasing and decisions log.
"""
