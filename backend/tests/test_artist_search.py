"""
Unit Test Suite for Live Artist Search & Ingestion.
Verifies small artist fetching, exact match ranking, and multi-provider fallback.
"""
import unittest
from backend.services.spotify_client import spotify_client


class TestArtistSearch(unittest.TestCase):

    def test_search_small_artist_exact_match(self):
        """Test searching for a small artist returns exact match at position #1."""
        results = spotify_client.search_artists("Amany")
        self.assertTrue(len(results) > 0, "Should return search results for 'Amany'")
        
        first_artist = results[0]
        self.assertEqual(first_artist["name"].lower(), "amany", "First result should be exact match 'Amany'")

    def test_search_indie_artist(self):
        """Test searching for a small indie artist not in canonical map."""
        results = spotify_client.search_artists("Aviella Winder")
        self.assertTrue(len(results) > 0, "Should return results for 'Aviella Winder'")
        first_name = results[0]["name"].lower()
        self.assertIn("aviella", first_name)

    def test_canonical_map_no_substring_hijack(self):
        """Ensure single letter queries like 's' or 'a' do not hijack search with hardcoded Islem or Drake."""
        results = spotify_client.search_artists("Sam")
        self.assertTrue(len(results) > 0)
        top_name = results[0]["name"]
        norm_top = spotify_client.normalize_text(top_name)
        self.assertTrue(
            "sam" in norm_top or "sammy" in norm_top,
            f"Top result for 'Sam' should contain 'sam', got {top_name!r}"
        )


if __name__ == "__main__":
    unittest.main()
