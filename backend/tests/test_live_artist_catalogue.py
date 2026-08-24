"""
Verification test suite for live artist & catalogue fetching mechanism.
"""
import pytest
from backend.services.spotify_client import spotify_client


def test_artist_search_fast_resolution():
    """Verify artist search returns candidates without high latency."""
    results = spotify_client.search_artists("Drake", limit=5)
    assert isinstance(results, list)
    assert len(results) > 0
    top = results[0]
    assert "name" in top
    assert "drake" in top["name"].lower()


def test_live_artist_catalogue_fetching():
    """Verify live artist profile and catalogue fetching."""
    details = spotify_client.get_artist_profile_and_tracks(artist_id="4m5hXq7Z8W3Z", artist_name="Islem-23")
    assert "artist" in details
    assert "catalogue" in details
    assert isinstance(details["catalogue"], list)
    assert len(details["catalogue"]) > 0
    
    art = details["artist"]
    assert "name" in art
    assert "followers" in art
    assert "popularity" in art
    assert "genres" in art

    # Verify normalized catalogue track structure
    first_cat = details["catalogue"][0]
    assert "track_id" in first_cat
    assert "track_name" in first_cat
    assert "album_name" in first_cat
    assert "release_date" in first_cat


def test_monthly_streams_resolution_no_fabrication():
    """Verify existing monthly streams resolution returns valid data for ingested artists and None for un-ingested artists."""
    # Existing dataset artist (Islem-23)
    streams_islem = spotify_client.get_artist_monthly_streams("Islem-23", "4m5hXq7Z8W3Z")
    assert streams_islem is not None
    assert isinstance(streams_islem, dict)
    assert len(streams_islem) > 0
    assert "2025-06" in streams_islem

    # New un-ingested artist (Taylor Swift / Random Artist without statement data)
    streams_new = spotify_client.get_artist_monthly_streams("Random Un-ingested Artist 123", "random_id_999")
    assert streams_new is None, "Monthly streams must return None when no statement source exists (no fabricated numbers)"


def test_isrc_distributor_detection():
    """Verify ISRC prefix analysis identifies major and indie distributors."""
    dist_dk = spotify_client.detect_distributor_from_isrcs(["QZ1234567890", "QZ9876543210"])
    assert dist_dk in ["DistroKid", "Too Lost"]

    dist_tc = spotify_client.detect_distributor_from_isrcs(["TC1234567890", "TC9876543210"])
    assert dist_tc == "TuneCore"

    dist_orchard = spotify_client.detect_distributor_from_isrcs(["US7123456789", "US7987654321"])
    assert dist_orchard == "The Orchard"
