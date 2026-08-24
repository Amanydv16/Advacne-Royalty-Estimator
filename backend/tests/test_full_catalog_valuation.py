"""
Verification test suite for full artist catalogue valuation & track breakdown.
"""
import pytest
from backend.api.main import generate_sample_rows_for_dataset, engine


def test_generate_sample_rows_uses_live_artist_tracks():
    """Verify sample row generator uses live artist tracks."""
    rows = generate_sample_rows_for_dataset("islem-23", monthly_rev=317.59, artist_name="Islem-23")
    assert isinstance(rows, list)
    assert len(rows) > 0

    titles = set(r["title"] for r in rows)
    isrcs = set(r["isrc"] for r in rows)

    assert len(titles) > 1
    assert len(isrcs) > 1


def test_valuation_engine_returns_track_level_advance_allocations():
    """Verify valuation engine returns per-track advance allocations and titles."""
    rows = generate_sample_rows_for_dataset("islem-23", monthly_rev=317.59, artist_name="Islem-23")
    result = engine.evaluate_deal(statement_rows=rows, term=5)

    assert result["success"] is True
    assert "catalog_analytics" in result
    cat_analytics = result["catalog_analytics"]
    assert "top_songs" in cat_analytics
    
    top_songs = cat_analytics["top_songs"]
    assert len(top_songs) > 0

    first_song = top_songs[0]
    assert "title" in first_song
    assert "identifier" in first_song
    assert "advance_allocation" in first_song
    assert "monthly_rev" in first_song
