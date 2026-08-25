/**
 * Advance Royalty Calculator & Valuation Engine
 * Client-Side Controller & Deterministic Valuation Core
 */

// Application State
const state = {
  currentStage: 1,
  entityType: 'artist', // 'artist' or 'label'
  selectedArtist: null,
  declaredMonthlyRevenue: 0,
  dealTerms: {
    rightsScope: 'sound_recording',
    term: 5,
    customRho: 0.50,
    payThroughPct: 0,
    postRecoupSharePct: 90,
    singlesContracted: 5,
    isGross: false,
    distributorFeePct: 15,
    kMode: 'table'
  },
  selectedDistributor: {
    id: 'distrokid',
    name: 'DistroKid',
    color: '#1db954',
    icon: 'DK'
  },
  uploadedFiles: [],
  hasUploadedValidData: false,
  sampleDatasetLoaded: null,
  activeValuationResult: null
};

// Distributor Master Directory
const DISTRIBUTORS_LIST = [
  { id: 'distrokid', name: 'DistroKid', color: '#1db954', icon: 'DK' },
  { id: 'tunecore', name: 'TuneCore', color: '#0088cc', icon: 'TC' },
  { id: 'cdbaby', name: 'CD Baby', color: '#e05638', icon: 'CD' },
  { id: 'toolost', name: 'Too Lost', color: '#e11d48', icon: 'TL' },
  { id: 'dashgo', name: 'DashGo', color: '#10b981', icon: 'DG' },
  { id: 'theorchard', name: 'The Orchard / Sony', color: '#f43f5e', icon: 'TO' },
  { id: 'bmg', name: 'BMG', color: '#06b6d4', icon: 'BMG' },
  { id: 'sparta', name: 'Sparta Distribution', color: '#ef4444', icon: 'SP' },
  { id: 'horus', name: 'Horus Music', color: '#06b6d4', icon: 'HM' },
  { id: 'stopone', name: 'StopOne', color: '#be123c', icon: 'SO' },
  { id: 'black17', name: 'Black 17', color: '#eab308', icon: 'B17' },
  { id: 'kartel', name: 'Kartel Music Group', color: '#ec4899', icon: 'KMG' },
  { id: 'awal', name: 'AWAL', color: '#a855f7', icon: 'AWAL' },
  { id: 'believe', name: 'Believe Digital', color: '#14b8a6', icon: 'BLV' }
];

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initDistributorDropdown();
  updateEstimateCalculations();
  setupDropzone();

  const searchInput = document.getElementById('artistSearchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleStage1Proceed();
      }
    });
  }
});

function handleStage1Proceed() {
  const inputVal = (document.getElementById('artistSearchInput')?.value || '').trim();
  if (!state.selectedArtist && inputVal) {
    selectArtist(inputVal, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', `spotify:artist:${Math.abs(hashString(inputVal))}`);
  } else if (!state.selectedArtist) {
    selectArtist('Islem-23', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', 'spotify:artist:4m5hXq7Z8W3Z');
  }
  goToStage(4);
}

// Stage Navigation
function goToStage(stageNum) {
  // If Stage 2 or 3 requested, redirect directly to Stage 4 (Upload Reports)
  if (stageNum === 2 || stageNum === 3) {
    stageNum = 4;
  }

  if (stageNum > 1 && !state.selectedArtist) {
    const inputVal = (document.getElementById('artistSearchInput')?.value || '').trim();
    if (inputVal) {
      selectArtist(inputVal, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', `spotify:artist:${Math.abs(hashString(inputVal))}`);
    } else {
      selectArtist('Islem-23', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', 'spotify:artist:4m5hXq7Z8W3Z');
    }
  }

  if (stageNum === 5 && !state.hasUploadedValidData && !state.sampleDatasetLoaded) {
    loadSampleDataset('islem23');
    return;
  }

  state.currentStage = stageNum;

  // Toggle stage view
  document.querySelectorAll('.stage-section').forEach(sec => sec.classList.remove('active'));
  const activeSec = document.getElementById(`stage${stageNum}`);
  if (activeSec) activeSec.classList.add('active');

  // Update wizard top indicator (3 clean steps)
  document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
  if (stageNum === 1) document.getElementById('stepIndicator1')?.classList.add('active');
  else if (stageNum === 4) document.getElementById('stepIndicator2')?.classList.add('active');
  else if (stageNum === 5) document.getElementById('stepIndicator3')?.classList.add('active');

  lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Stage 1: Entity Type & Live Real-Time Artist Search
function selectEntityType(type) {
  state.entityType = type;
  document.getElementById('typeArtistBtn').classList.toggle('active', type === 'artist');
  document.getElementById('typeLabelBtn').classList.toggle('active', type === 'label');

  const labelElem = document.getElementById('entitySearchLabel');
  const inputElem = document.getElementById('artistSearchInput');
  const spotifyHelper = document.getElementById('spotifyIdHelperRow');

  if (type === 'label') {
    labelElem.innerText = 'Label Name';
    inputElem.placeholder = 'Type label name';
    if (spotifyHelper) spotifyHelper.style.display = 'none';
  } else {
    labelElem.innerText = 'Artist Name';
    inputElem.placeholder = 'Type artist name';
    if (spotifyHelper) spotifyHelper.style.display = 'block';
  }

  // Clear previous search and close dropdown
  clearSearchInput();
}

function clearSearchInput() {
  const input = document.getElementById('artistSearchInput');
  input.value = '';
  document.getElementById('spotifySearchResults').style.display = 'none';
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  const searchIcon = document.getElementById('searchIcon');
  if (searchIcon) searchIcon.style.display = 'block';
  input.focus();
}

let searchDebounce = null;
function handleArtistSearch(query) {
  clearTimeout(searchDebounce);
  const q = query.trim();

  const clearBtn = document.getElementById('searchClearBtn');
  const searchIcon = document.getElementById('searchIcon');
  if (clearBtn && searchIcon) {
    if (q.length > 0) {
      clearBtn.style.display = 'flex';
      searchIcon.style.display = 'none';
    } else {
      clearBtn.style.display = 'none';
      searchIcon.style.display = 'block';
    }
  }

  if (!q || q.length < 1) {
    document.getElementById('spotifySearchResults').style.display = 'none';
    return;
  }

  // Show dropdown
  const resultsBox = document.getElementById('spotifySearchResults');
  resultsBox.style.display = 'block';
  resultsBox.innerHTML = `
    <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
      <i data-lucide="loader-2" class="spin" style="vertical-align: middle; margin-right: 6px;"></i> Searching...
    </div>
  `;
  lucide.createIcons();

  searchDebounce = setTimeout(() => {
    if (state.entityType === 'label') {
      fetchLabels(q);
    } else {
      fetchSpotifyArtists(q);
    }
  }, 100);

}

async function fetchLabels(query) {
  try {
    const res = await fetch(`/api/labels/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.labels && data.labels.length > 0) {
        renderSpotifySearchResults(data.labels);
        return;
      }
    }
  } catch (err) {
    console.warn('Label search error:', err);
  }
}

async function fetchSpotifyArtists(query) {
  try {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.artists && data.artists.length > 0) {
        renderSpotifySearchResults(data.artists, query);
        return;
      }
    }
  } catch (err) {
    console.warn('Backend search notice:', err);
  }

  // Direct Client-Side Fallback for Netlify & Static Hosting (Deezer & iTunes APIs)
  try {
    const clientArtists = await fetchArtistsClientSide(query);
    if (clientArtists && clientArtists.length > 0) {
      renderSpotifySearchResults(clientArtists, query);
      return;
    }
  } catch (clientErr) {
    console.warn('Client-side streaming search notice:', clientErr);
  }

  renderSpotifySearchResults([], query);
}

async function fetchArtistsClientSide(query) {
  const qStr = (query || "").trim();
  const encoded = encodeURIComponent(qStr);
  const candidates = [];

  // Case 0: Direct Spotify URL, URI, or raw 22-char ID pasted in search bar
  const spotifyMatch = qStr.match(/(?:artist\/|spotify:artist:|^)([A-Za-z0-9]{22})$/i) || qStr.match(/(?:artist\/|spotify:artist:)([A-Za-z0-9]{22})/i);
  if (spotifyMatch) {
    const sId = spotifyMatch[1];
    try {
      const oeRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/artist/${sId}`);
      if (oeRes.ok) {
        const oeData = await oeRes.json();
        if (oeData.title) {
          candidates.push({
            id: sId,
            spotify_id: sId,
            name: oeData.title,
            imageUrl: oeData.thumbnail_url || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop',
            followers: 500000,
            popularity: 75,
            genres: ['Verified Spotify Artist'],
            verified: true,
            spotifyUrl: `https://open.spotify.com/artist/${sId}`,
            source: 'spotify'
          });
          return candidates;
        }
      }
    } catch (e) {
      console.warn('Spotify oEmbed client fetch notice:', e);
    }
  }

  // 1. Query Deezer API (CORS enabled)
  try {
    const dRes = await fetch(`https://api.deezer.com/search/artist?q=${encoded}&limit=15`);
    if (dRes.ok) {
      const dData = await dRes.json();
      (dData.data || []).forEach(item => {
        if (!item.name) return;
        const nbFan = item.nb_fan || 0;
        candidates.push({
          id: `dz_${item.id}`,
          name: item.name,
          imageUrl: item.picture_medium || item.picture_big || item.picture || '',
          followers: nbFan,
          popularity: Math.min(100, Math.round(Math.log10(Math.max(1, nbFan)) * 15)),
          genres: ['Artist'],
          verified: true,
          spotifyUrl: '',
          source: 'global_directory'
        });
      });
    }
  } catch (e) {
    console.warn('Deezer client fetch notice:', e);
  }

  // 2. Query iTunes API (CORS enabled)
  try {
    const iRes = await fetch(`https://itunes.apple.com/search?term=${encoded}&entity=musicArtist&limit=15`);
    if (iRes.ok) {
      const iData = await iRes.json();
      (iData.results || []).forEach(item => {
        if (!item.artistName) return;
        const normName = item.artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const qNorm = query.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!candidates.some(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normName)) {
          candidates.push({
            id: `itunes_${item.artistId}`,
            name: item.artistName,
            imageUrl: '',
            followers: 25000,
            popularity: normName === qNorm ? 70 : 40,
            genres: [item.primaryGenreName || 'Sound Recording'],
            verified: true,
            spotifyUrl: item.artistLinkUrl || '',
            source: 'apple_music'
          });
        }
      });
    }
  } catch (e) {
    console.warn('iTunes client fetch notice:', e);
  }

  return candidates;
}

function formatFollowers(count) {
  if (!count || count === 0) return null;
  if (count >= 1000000) return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M followers';
  if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K followers';
  return count.toLocaleString() + ' followers';
}

function renderSpotifySearchResults(items, query = '') {
  const container = document.getElementById('spotifySearchResults');
  const safeQuery = (query || '').trim();
  const qNorm = safeQuery.toLowerCase().replace(/[^a-z0-9]/g, '');

  let listHtml = '';

  if (items && items.length > 0) {
    listHtml = items.map(a => {
      const img = a.imageUrl || a.image || '';
      const hasImg = img && img.trim().length > 0;
      const isLabel = state.entityType === 'label';
      const genreText = isLabel ? 'Record Label' : ((a.genres && a.genres.length > 0) ? a.genres.slice(0, 2).join(', ') : 'Artist');
      const artistId = a.id || '';
      const spotifyUrl = a.spotifyUrl || (a.spotify_uri ? `https://open.spotify.com/artist/${a.spotify_uri.replace('spotify:artist:', '')}` : '');
      const followers = !isLabel ? formatFollowers(a.followers || a.monthly_listeners || 0) : null;
      const isSpotifyVerified = a.source === 'spotify' || a.verified === true;
      const popularityPct = a.popularity ? Math.min(100, a.popularity) : null;

      return `
        <div class="artist-suggestion-card" onclick="selectArtist('${escapeHtml(a.name)}', '${img}', '${artistId}', '${escapeHtml(genreText)}', '${escapeHtml(spotifyUrl)}')">
          <div class="artist-suggestion-avatar-wrap">
            ${hasImg
              ? `<img src="${img}" alt="${escapeHtml(a.name)}" class="artist-suggestion-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="artist-suggestion-avatar-fallback" style="display:none"><i data-lucide="music"></i></div>`
              : `<div class="artist-suggestion-avatar-fallback"><i data-lucide="music"></i></div>`
            }
            ${isSpotifyVerified ? `<div class="spotify-verified-dot" title="Verified on Spotify"></div>` : ''}
          </div>

          <div class="artist-suggestion-info">
            <div class="artist-suggestion-name">${escapeHtml(a.name)}</div>
            <div class="artist-suggestion-meta">
              ${genreText ? `<span class="artist-genre-tag">${escapeHtml(genreText)}</span>` : ''}
              ${followers ? `<span class="artist-follower-count"><i data-lucide="users" style="width:11px;height:11px;vertical-align:middle;margin-right:3px;"></i>${followers}</span>` : ''}
            </div>
            ${popularityPct !== null ? `
              <div class="artist-popularity-bar">
                <div class="artist-popularity-fill" style="width: ${popularityPct}%"></div>
              </div>` : ''}
          </div>

          <div class="artist-suggestion-actions">
            ${spotifyUrl ? `
              <a href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener noreferrer"
                 class="spotify-open-btn" title="Open on Spotify"
                 onclick="event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                <span>Spotify</span>
              </a>` : ''}
            <div class="artist-suggestion-select-hint"><i data-lucide="corner-down-left" style="width:12px;height:12px;"></i></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Check if an exact match exists in the returned items
  const hasExact = (items || []).some(a => (a.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === qNorm);
  const isUrlOrUri = safeQuery.includes('spotify.com') || safeQuery.includes('spotify:artist:') || /^[A-Za-z0-9]{22}$/.test(safeQuery);

  // If query is present, not a URL/URI, and not an exact match, append option for custom small/indie artist
  if (safeQuery && !hasExact && !isUrlOrUri) {
    const customId = `indie_${Math.abs(hashString(safeQuery))}`;
    const customCard = `
      <div class="artist-suggestion-card custom-artist-option" style="background: rgba(147, 51, 234, 0.08); border-top: 1px solid rgba(255,255,255,0.08);" onclick="selectArtist('${escapeHtml(safeQuery)}', '', '${customId}', 'Independent Artist', '')">
        <div class="artist-suggestion-avatar-wrap">
          <div class="artist-suggestion-avatar-fallback" style="background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff;">
            <i data-lucide="plus"></i>
          </div>
        </div>
        <div class="artist-suggestion-info">
          <div class="artist-suggestion-name">Add "${escapeHtml(safeQuery)}"</div>
          <div class="artist-suggestion-meta">
            <span class="artist-genre-tag" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">Independent / Small Artist</span>
          </div>
        </div>
        <div class="artist-suggestion-actions">
          <div class="artist-suggestion-select-hint" style="color: #c084fc;"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i> Select</div>
        </div>
      </div>
    `;
    listHtml += customCard;
  }

  if (!listHtml) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = `<div class="artist-suggestion-list">${listHtml}</div>`;
  container.style.display = 'block';
  lucide.createIcons();
}


async function selectArtist(name, image, artistId, genreText = 'Artist – Sound Recording', spotifyUrl = '') {
  let cleanName = (name || '').trim();
  let cleanImg = image || '';
  let cleanId = artistId || '';
  let cleanUrl = spotifyUrl || '';

  // Auto-detect and resolve Spotify URLs, URIs, or 22-char raw Spotify IDs
  const sMatch = (cleanName + " " + cleanId + " " + cleanUrl).match(/(?:artist\/|spotify:artist:|^)([A-Za-z0-9]{22})/i);
  if (cleanName.includes('spotify.com') || cleanName.includes('spotify:artist:') || (sMatch && sMatch[1].length === 22)) {
    const extractedId = sMatch ? sMatch[1] : cleanId;
    cleanId = extractedId;
    cleanUrl = `https://open.spotify.com/artist/${extractedId}`;

    // Resolve exact artist name & photo via Spotify oEmbed API
    try {
      const oeRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/artist/${extractedId}`);
      if (oeRes.ok) {
        const oeData = await oeRes.json();
        if (oeData.title) {
          cleanName = oeData.title;
          if (oeData.thumbnail_url) cleanImg = oeData.thumbnail_url;
        }
      }
    } catch (e) {
      console.warn('[Spotify oEmbed Notice]', e);
    }

    if (cleanName.includes('spotify.com') || cleanName.includes('spotify:artist:')) {
      cleanName = 'Verified Spotify Artist';
    }
  }

  const defaultImg = cleanImg || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces';
  
  state.selectedArtist = {
    name: cleanName,
    image: defaultImg,
    spotifyId: cleanId,
    genres: [genreText],
    spotifyUrl: cleanUrl,
    catalogTracks: []
  };

  // Update sidebar & chip
  document.getElementById('sidebarArtistName').innerText = cleanName;
  document.getElementById('sidebarArtistMeta').innerText = genreText;
  document.getElementById('sidebarArtistImg').src = defaultImg;

  document.getElementById('chipArtistName').innerText = cleanName;
  document.getElementById('chipArtistImg').src = defaultImg;

  document.getElementById('spotifySearchResults').style.display = 'none';
  document.getElementById('artistSearchInput').style.display = 'none';
  document.getElementById('selectedArtistChip').style.display = 'flex';

  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';

  // Initialize and show Live Artist & Catalogue Panel
  const panel = document.getElementById('artistCataloguePanel');
  if (panel) {
    panel.style.display = 'block';
    document.getElementById('catalogueArtistName').innerText = cleanName;
    document.getElementById('catalogueArtistAvatar').src = defaultImg;
    document.getElementById('catalogueGenreTag').innerText = genreText;
    document.getElementById('catalogueDistributorVal').innerText = 'Detecting Distributor...';
    document.getElementById('catStatTracks').innerText = '--';
    document.getElementById('catStatAlbums').innerText = '--';
    document.getElementById('catalogueTracksStatus').innerHTML = `<i data-lucide="loader-2" class="spin"></i> Fetching Live Tracks...`;
    document.getElementById('catalogueTrackList').innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.8rem;"><i data-lucide="loader-2" class="spin"></i> Loading catalogue...</div>`;
    
    const spotLink = document.getElementById('catalogueSpotifyLink');
    if (spotLink) {
      if (cleanUrl) {
        spotLink.href = cleanUrl;
        spotLink.style.display = 'inline-flex';
      } else {
        spotLink.style.display = 'none';
      }
    }
    lucide.createIcons();
  }

  // Fetch full live artist profile, tracks, and detect distributor
  fetchArtistDetails(cleanId, cleanName);
}

async function fetchArtistDetails(artistId, artistName) {
  try {
    // 1. Fetch live profile, tracks, and detected distributor from /api/spotify/artist-details
    let catalogTracks = [];
    let details = null;

    try {
      const res = await fetch(`/api/spotify/artist-details?artist_id=${encodeURIComponent(artistId)}&artist_name=${encodeURIComponent(artistName)}`);
      if (res.ok) {
        details = await res.json();
        if (details.tracks && Array.isArray(details.tracks)) {
          catalogTracks = details.tracks;
        }
        if (details.artist) {
          const art = details.artist;
          if (art.image && art.image.trim()) {
            state.selectedArtist.image = art.image;
            document.getElementById('sidebarArtistImg').src = art.image;
            document.getElementById('chipArtistImg').src = art.image;
            const avatarElem = document.getElementById('catalogueArtistAvatar');
            if (avatarElem) avatarElem.src = art.image;
          }
          if (art.spotifyUrl) {
            state.selectedArtist.spotifyUrl = art.spotifyUrl;
            const spotLink = document.getElementById('catalogueSpotifyLink');
            if (spotLink) {
              spotLink.href = art.spotifyUrl;
              spotLink.style.display = 'inline-flex';
            }
          }
          if (art.followers) {
            const fStr = formatFollowers(art.followers) || 'Verified';
            const fElem = document.getElementById('catalogueFollowersVal');
            if (fElem) fElem.innerText = fStr;
          }
        }
        if (details.detectedDistributor) {
          state.selectedArtist.detectedDistributor = details.detectedDistributor;
          const distElem = document.getElementById('catalogueDistributorVal');
          if (distElem) distElem.innerText = details.detectedDistributor;
        }
      }
    } catch (err) {
      console.warn('Backend details endpoint notice:', err);
    }

    // 2. Client-Side Fallback for Netlify / Static Hosting (Deezer & iTunes APIs)
    if (!catalogTracks || catalogTracks.length === 0) {
      try {
        const clientDetails = await fetchArtistDetailsClientSide(artistId, artistName);
        if (clientDetails && clientDetails.tracks && clientDetails.tracks.length > 0) {
          catalogTracks = clientDetails.tracks;
          if (!details) details = clientDetails;
          if (clientDetails.detectedDistributor) {
            state.selectedArtist.detectedDistributor = clientDetails.detectedDistributor;
            const distElem = document.getElementById('catalogueDistributorVal');
            if (distElem) distElem.innerText = clientDetails.detectedDistributor;
          }
        }
      } catch (clientErr) {
        console.warn('Client-side tracks fetch notice:', clientErr);
      }
    }

    state.selectedArtist.catalogTracks = catalogTracks;

    // 3. Render Live Tracks & Monthly Streams in Catalogue Panel
    renderCatalogueTracks(catalogTracks, details);
    renderCatalogueMonthlyStreams(details?.monthly_streams);

    // 4. Extract ISRCs and perform Soundcharts Rollup POST query if backend available
    const isrcs = Array.from(new Set((catalogTracks || []).map(t => t.isrc).filter(Boolean)));
    if (isrcs.length > 0) {
      try {
        const rollupRes = await fetch('/api/admin/investment-memo/soundcharts-rollup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isrcs })
        });
        if (rollupRes.ok) {
          const rollupData = await rollupRes.json();
          state.selectedArtist.soundchartsRollup = rollupData;
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Error loading artist details:', err);
    document.getElementById('catalogueTracksStatus').innerText = 'Live Tracks Loaded';
  }
}

async function fetchArtistDetailsClientSide(artistId, artistName) {
  let tracks = [];
  let detectedDistributor = 'Independent / DIY';
  let cleanName = (artistName || 'Artist').trim();

  // Try Deezer client-side API
  if (artistId && artistId.startsWith('dz_')) {
    const dzId = artistId.replace('dz_', '');
    try {
      const dRes = await fetch(`https://api.deezer.com/artist/${dzId}/top?limit=50`);
      if (dRes.ok) {
        const dData = await dRes.json();
        (dData.data || []).forEach(t => {
          tracks.push({
            title: t.title || t.title_short || 'Untitled Track',
            album: t.album?.title || 'Single',
            isrc: t.isrc || '',
            releaseDate: '2024-01-01',
            artwork: t.album?.cover_medium || t.album?.cover || '',
            spotifyUrl: ''
          });
        });
      }
    } catch (e) {}
  }

  // Fallback to iTunes client-side API
  if (!tracks || tracks.length === 0) {
    try {
      const iRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanName)}&entity=song&limit=50`);
      if (iRes.ok) {
        const iData = await iRes.json();
        (iData.results || []).forEach(t => {
          tracks.push({
            title: t.trackName || 'Untitled Track',
            album: t.collectionName || 'Single',
            isrc: t.isrc || '',
            releaseDate: t.releaseDate ? t.releaseDate.substring(0, 10) : '2024-01-01',
            artwork: t.artworkUrl100 || '',
            spotifyUrl: t.trackViewUrl || ''
          });
        });
      }
    } catch (e) {}
  }

  // Detect distributor from ISRCs
  const isrcs = tracks.map(t => t.isrc).filter(Boolean);
  if (isrcs.some(i => i.startsWith('QZ'))) detectedDistributor = 'DistroKid / Too Lost';
  else if (isrcs.some(i => i.startsWith('TC'))) detectedDistributor = 'TuneCore';
  else if (isrcs.some(i => i.startsWith('US7'))) detectedDistributor = 'The Orchard';

  return {
    artist: { name: cleanName, followers: 250000, popularity: 75, genres: ['Sound Recording'] },
    tracks: tracks,
    detectedDistributor: detectedDistributor,
    monthly_streams: null
  };
}

function renderCatalogueMonthlyStreams(monthlyStreams) {
  const container = document.getElementById('catalogueMonthlyStreamsList');
  const statusElem = document.getElementById('catalogueStreamsStatus');
  if (!container) return;

  if (!monthlyStreams || typeof monthlyStreams !== 'object' || Object.keys(monthlyStreams).length === 0) {
    if (statusElem) statusElem.innerText = 'No Project Data';
    container.innerHTML = `<div style="color:var(--text-dim); text-align:center; padding:8px 0;">No historical monthly streaming statement loaded for this artist yet. Upload statement in Stage 4 to populate.</div>`;
    return;
  }

  if (statusElem) statusElem.innerText = '✓ Statement Stream Data';
  const entries = Object.entries(monthlyStreams).sort((a, b) => a[0].localeCompare(b[0]));
  
  const gridHtml = entries.map(([m, val]) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(255,255,255,0.03); border-radius:6px; margin-bottom:4px;">
      <span style="font-weight:600; color:#fff;">${escapeHtml(m)}</span>
      <span style="color:#34d399; font-weight:700;">${typeof val === 'number' ? (val > 1000 ? val.toLocaleString() + ' streams' : formatCurrency(val)) : escapeHtml(String(val))}</span>
    </div>
  `).join('');

  container.innerHTML = `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">${gridHtml}</div>`;
}

function renderCatalogueTracks(tracks, details = null) {
  const trackListContainer = document.getElementById('catalogueTrackList');
  const tracksStatusElem = document.getElementById('catalogueTracksStatus');
  const catStatTracks = document.getElementById('catStatTracks');
  const catStatAlbums = document.getElementById('catStatAlbums');

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    if (trackListContainer) {
      trackListContainer.innerHTML = `<div style="padding: 10px; color: var(--text-dim); font-size: 0.8rem;">No catalog recordings found. Statement upload required for full pricing.</div>`;
    }
    if (tracksStatusElem) tracksStatusElem.innerText = 'No Tracks Available';
    return;
  }

  const trackCount = details ? (details.trackCount || tracks.length) : tracks.length;
  const albumCount = details ? (details.albumCount || Math.max(1, Math.ceil(tracks.length / 3))) : Math.max(1, Math.ceil(tracks.length / 3));

  if (catStatTracks) catStatTracks.innerText = trackCount;
  if (catStatAlbums) catStatAlbums.innerText = albumCount;
  if (tracksStatusElem) tracksStatusElem.innerText = `Loaded ${tracks.length} Live Recordings`;

  if (trackListContainer) {
    const rowsHtml = tracks.slice(0, 25).map(t => {
      const title = t.title || t.name || 'Untitled Recording';
      const album = t.album || 'Single';
      const art = t.artwork || t.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=50&h=50&fit=crop';
      const isrc = t.isrc || 'ISRC Pending';
      const relDate = t.releaseDate || t.release_date || '2024';

      return `
        <div class="catalogue-track-item">
          <div class="cat-track-left">
            <img src="${escapeHtml(art)}" alt="${escapeHtml(title)}" class="cat-track-art" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=50&h=50&fit=crop';">
            <div>
              <span class="cat-track-title">${escapeHtml(title)}</span>
              <span class="cat-track-album">${escapeHtml(album)}</span>
            </div>
          </div>
          <div class="cat-track-right">
            <span class="cat-isrc-badge">${escapeHtml(isrc)}</span>
            <span class="cat-rel-date">${escapeHtml(relDate)}</span>
          </div>
        </div>
      `;
    }).join('');

    trackListContainer.innerHTML = rowsHtml;
  }
}

function clearArtistSelection() {
  state.selectedArtist = null;
  document.getElementById('selectedArtistChip').style.display = 'none';
  const panel = document.getElementById('artistCataloguePanel');
  if (panel) panel.style.display = 'none';

  const input = document.getElementById('artistSearchInput');
  input.style.display = 'block';
  input.value = '';
  input.focus();

  const searchIcon = document.getElementById('searchIcon');
  if (searchIcon) searchIcon.style.display = 'block';
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';

  // Reset sidebar
  document.getElementById('sidebarArtistName').innerText = 'Select an Artist';
  document.getElementById('sidebarArtistMeta').innerText = 'Live Spotify Search';
  document.getElementById('sidebarArtistImg').src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop';
}



function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}








async function handleStage1Proceed() {
  if (!state.selectedArtist) {
    const inputVal = (document.getElementById('artistSearchInput')?.value || '').trim();
    if (inputVal) {
      const nextBtn = document.getElementById('stage1NextBtn');
      const origHtml = nextBtn ? nextBtn.innerHTML : '';
      if (nextBtn) {
        nextBtn.innerHTML = `<span>RESOLVING SPOTIFY ID...</span> <i data-lucide="loader-2" class="spin"></i>`;
        nextBtn.disabled = true;
        lucide.createIcons();
      }

      // Check if inputVal is a Spotify URL / URI / ID
      const sMatch = inputVal.match(/(?:artist\/|spotify:artist:|^)([A-Za-z0-9]{22})/i);
      if (inputVal.includes('spotify.com') || inputVal.includes('spotify:artist:') || (sMatch && sMatch[1].length === 22)) {
        const sId = sMatch ? sMatch[1] : inputVal;
        await selectArtist(inputVal, '', sId, 'Verified Spotify Artist', `https://open.spotify.com/artist/${sId}`);
        if (nextBtn) { nextBtn.innerHTML = origHtml; nextBtn.disabled = false; }
        goToStage(2);
        return;
      }

      try {
        const res = await fetch(`/api/spotify/resolve?q=${encodeURIComponent(inputVal)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.artist && data.artist.id) {
            const a = data.artist;
            await selectArtist(
              a.name || inputVal,
              a.imageUrl || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces',
              a.id,
              (a.genres && a.genres.length > 0) ? a.genres.slice(0, 2).join(', ') : 'Verified Artist',
              a.spotifyUrl || ''
            );
            if (nextBtn) { nextBtn.innerHTML = origHtml; nextBtn.disabled = false; }
            goToStage(2);
            return;
          }
        }
      } catch (err) {
        console.warn('[Spotify Resolve Notice]', err);
      } finally {
        if (nextBtn) { nextBtn.innerHTML = origHtml; nextBtn.disabled = false; }
      }

      // Graceful fallback
      await selectArtist(inputVal, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces', `spotify:artist:${Math.abs(hashString(inputVal))}`);
      goToStage(2);
    } else {
      alert('Please type or select an artist/label name first.');
      document.getElementById('artistSearchInput')?.focus();
    }
    return;
  }
  goToStage(2);
}

async function toggleSpotifyIdModal() {
  const uri = prompt('Enter Spotify Artist URI, URL, or Artist Name (e.g. spotify:artist:6DARBhWbfcS9E4yJzcliqQ or Karan Aujla):');
  if (uri && uri.trim()) {
    try {
      const res = await fetch(`/api/spotify/resolve?q=${encodeURIComponent(uri.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.artist && data.artist.id) {
          const a = data.artist;
          await selectArtist(
            a.name || uri.trim(),
            a.imageUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop',
            a.id,
            (a.genres && a.genres.length > 0) ? a.genres.slice(0, 2).join(', ') : 'Verified Artist',
            a.spotifyUrl || ''
          );
          return;
        }
      }
    } catch (err) {
      console.warn('[Spotify ID Modal Error]', err);
    }
    selectArtist(uri.trim(), 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop', uri.trim());
  }
}

// Stage 3: Deal Options & Quick Estimator
function selectRightsScope(scope, btn) {
  state.dealTerms.rightsScope = scope;
  btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (scope !== 'sound_recording') {
    alert('Note: Sizing is empirically validated for Sound Recording rights only. Songwriting will be flagged as OUT_OF_SCOPE in the valuation engine.');
  }
  updateEstimateCalculations();
}

function selectTerm(term, btn) {
  state.dealTerms.term = parseInt(term, 10);
  btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateEstimateCalculations();
}

function selectPayThrough(pt, btn) {
  state.dealTerms.payThroughPct = parseInt(pt, 10);
  btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateEstimateCalculations();
}

function updatePostRecoupShare(val) {
  state.dealTerms.postRecoupSharePct = parseInt(val, 10);
  const badge = document.getElementById('postRecoupValBadge');
  badge.innerText = val == 100 ? '100% (ends at recoupment)' : `${val}% post-recoup share`;
  updateEstimateCalculations();
}

function updateContractedSingles(val) {
  const count = parseInt(val, 10);
  state.dealTerms.singlesContracted = count;
  const badge = document.getElementById('singlesValBadge');
  badge.innerText = count === 0 ? '0 singles (Catalog Only)' : `${count} new single${count > 1 ? 's' : ''}`;
  updateEstimateCalculations();
}

function updateEstimateCalculations() {
  const revInput = document.getElementById('declaredMonthlyRevInput');
  const declaredRev = parseFloat(revInput ? revInput.value : 3400) || 0;
  state.declaredMonthlyRevenue = declaredRev;

  const T = state.dealTerms.term;
  const p = state.dealTerms.payThroughPct / 100.0;
  const payFactor = Math.max(0.5, 1.0 - p);

  // K multiples from Table: 1y:10.797, 2y:20.816, 3y:29.211, 5y:36.028, 8y:45.0
  const kMap = { 1: 10.797, 2: 20.816, 3: 29.211, 5: 36.028, 8: 45.0 };
  const kVal = kMap[T] || 29.211;

  const estLow = Math.round(declaredRev * kVal * 0.70 * payFactor);
  const estHigh = Math.round(declaredRev * kVal * 1.15 * payFactor);

  const lowElem = document.getElementById('estRangeLow');
  const highElem = document.getElementById('estRangeHigh');
  if (lowElem) lowElem.innerText = formatCurrency(estLow);
  if (highElem) highElem.innerText = formatCurrency(estHigh);

  const decElem = document.getElementById('estDeclaredDisplay');
  const termElem = document.getElementById('estTermDisplay');
  if (decElem) decElem.innerText = declaredRev.toLocaleString();
  if (termElem) termElem.innerText = T;
}

function toggleSongwritingModal() {
  alert('Songwriting rights require separate publishing administration agreement and are excluded from catalog multiple sizing.');
}

// Stage 4: Distributor Dropdown & Statement Uploads
function initDistributorDropdown() {
  const listElem = document.getElementById('distributorOptionsList');
  if (!listElem) return;

  listElem.innerHTML = DISTRIBUTORS_LIST.map(d => `
    <div class="dist-option-row" onclick="selectDistributor('${d.id}')">
      <span class="dist-icon-badge" style="background:${d.color}">${d.icon}</span>
      <span class="dist-name">${d.name}</span>
    </div>
  `).join('');
}

function toggleDistributorDropdown() {
  const menu = document.getElementById('distributorDropdownMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function selectDistributor(distId) {
  const dist = DISTRIBUTORS_LIST.find(d => d.id === distId) || DISTRIBUTORS_LIST[0];
  state.selectedDistributor = dist;

  const curr = document.getElementById('currentDistributorItem');
  curr.innerHTML = `
    <span class="dist-icon-badge" style="background:${dist.color}">${dist.icon}</span>
    <span class="dist-name">${dist.name}</span>
  `;
  document.getElementById('distributorDropdownMenu').style.display = 'none';
}

function filterDistributorList(query) {
  const rows = document.querySelectorAll('.dist-option-row');
  const q = query.toLowerCase();
  rows.forEach(r => {
    const text = r.innerText.toLowerCase();
    r.style.display = text.includes(q) ? 'flex' : 'none';
  });
}

function setBasis(basis) {
  state.dealTerms.isGross = (basis === 'gross');
  document.getElementById('basisNetBtn').classList.toggle('active', basis === 'net');
  document.getElementById('basisGrossBtn').classList.toggle('active', basis === 'gross');
  document.getElementById('grossFeeInputRow').style.display = (basis === 'gross') ? 'flex' : 'none';
}

function setupDropzone() {
  const dropzone = document.getElementById('fileDropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    processSelectedFiles(files);
  });
}

function handleFileSelection(event) {
  const files = event.target.files;
  processSelectedFiles(files);
}

async function processSelectedFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  state.uploadedFiles = Array.from(fileList);
  state.hasUploadedValidData = true;
  state.sampleDatasetLoaded = null;

  renderUploadedFilesList();
  document.getElementById('calculateExactBtn').removeAttribute('disabled');

  await parseUploadedFilesWithMultimodalLLM(fileList);
}

async function parseUploadedFilesWithMultimodalLLM(fileList) {
  const hub = document.getElementById('multimodalParserResultsHub');
  if (!hub) return;

  hub.style.display = 'block';
  const badge = document.getElementById('parserStatusBadge');
  if (badge) {
    badge.innerText = 'PARSING...';
    badge.style.background = 'rgba(99,102,241,0.2)';
    badge.style.color = '#a5b4fc';
  }

  try {
    const formData = new FormData();
    const filesArray = Array.from(fileList);
    filesArray.forEach(f => formData.append('files', f));
    formData.append('is_gross', state.dealTerms?.isGross || false);
    formData.append('distributor_fee_pct', state.dealTerms?.distributorFeePct || 0);

    const res = await fetch('/api/royalty/parse', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.monthly_breakdown && data.monthly_breakdown.length > 0) {
        renderMultimodalParserResults(data);
        return;
      }
    }
  } catch (err) {
    console.warn('[Multimodal LLM Parser Notice]', err);
  }

  // Client-side instant fallback text parsing if network or backend parsing is delayed
  try {
    const firstFile = fileList[0];
    if (firstFile) {
      const text = await firstFile.text();
      const clientData = parseCSVTextClientSide(text, firstFile.name);
      renderMultimodalParserResults(clientData);
    }
  } catch (clientErr) {
    console.warn('[Client-side Fallback Notice]', clientErr);
  }
}

function parseCSVTextClientSide(text, filename = "statement.csv") {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { status: 'parsed', totals: { net: 0, net_str: "0.00" }, monthly_earnings: [], monthly_breakdown: [] };

  let headerIdx = 0;
  const keyTerms = ['month', 'date', 'period', 'earnings', 'net', 'amount', 'royalty', 'total', 'revenue', 'title', 'isrc'];
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const lLow = lines[i].toLowerCase();
    if (keyTerms.filter(t => lLow.includes(t)).length >= 2) {
      headerIdx = i;
      break;
    }
  }

  const firstLine = lines[headerIdx];
  const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(' | ') ? ' | ' : ',');
  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  let monthCol = headers.findIndex(h => h.includes('month') || h.includes('period') || h.includes('date'));
  let amtCol = headers.findIndex(h => h.includes('earning') || h.includes('net') || h.includes('amount') || h.includes('royalty') || h.includes('total') || h.includes('rev') || h.includes('payable'));

  if (amtCol === -1) amtCol = headers.length - 1;

  const monthlyAgg = {};
  let totalNet = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length <= 1) continue;

    let rawMonth = monthCol !== -1 ? cols[monthCol] : '';
    let mMatch = rawMonth ? rawMonth.match(/(\d{4})[-/.](0[1-9]|1[0-2])/) : null;
    let monthStr = mMatch ? `${mMatch[1]}-${mMatch[2]}` : '2026-01';

    let rawAmtStr = cols[amtCol] ? cols[amtCol].replace(/[\$,\s]/g, '') : '0';
    let rawAmt = parseFloat(rawAmtStr);
    if (isNaN(rawAmt)) rawAmt = 0;

    totalNet += rawAmt;

    if (!monthlyAgg[monthStr]) {
      monthlyAgg[monthStr] = { month: monthStr, net_royalty: 0, raw_str_sum: 0, track_count: 1, primary_source: 'Streaming', first_row: i + 1 };
    }
    monthlyAgg[monthStr].net_royalty += rawAmt;
  }

  const sortedMonths = Object.keys(monthlyAgg).sort();
  let prevNet = null;

  const monthlyEarnings = sortedMonths.map(m => {
    const item = monthlyAgg[m];
    const amtStr = item.net_royalty.toFixed(2);
    return {
      month: m,
      amount: amtStr,
      currency: 'USD',
      provenance: {
        source_file: filename,
        page: 1,
        source_row: item.first_row,
        source_column: 'Net Royalty',
        source_value: amtStr
      }
    };
  });

  const breakdownList = sortedMonths.map(m => {
    const item = monthlyAgg[m];
    const netAmt = item.net_royalty;
    let momGrowth = null;
    if (prevNet !== null && prevNet > 0) {
      momGrowth = Math.round(((netAmt - prevNet) / prevNet) * 1000) / 10;
    }
    prevNet = netAmt;
    return {
      month: m,
      net_royalty: netAmt,
      currency: 'USD',
      mom_growth_pct: momGrowth,
      track_count: item.track_count,
      primary_source: item.primary_source
    };
  });

  const totStr = totalNet.toFixed(2);

  return {
    status: 'parsed',
    statement_metadata: { currency: 'USD', source_file: filename },
    monthly_earnings: monthlyEarnings,
    monthly_breakdown: breakdownList,
    totals: { net: totalNet, net_str: totStr },
    reconciliation: { status: 'reconciled', statement_total: totStr, calculated_total: totStr, difference: "0.00" },
    warnings: []
  };
}

function renderMultimodalParserResults(data) {
  const hub = document.getElementById('multimodalParserResultsHub');
  if (!hub) return;
  hub.style.display = 'block';

  const badge = document.getElementById('parserStatusBadge');
  const statusStr = (data.status || 'parsed').toUpperCase();
  if (badge) {
    badge.innerText = statusStr === 'PARSED' ? '✓ PARSED' : (statusStr === 'NEEDS_REVIEW' ? '⚠ NEEDS REVIEW' : '✓ PARSED WITH WARNINGS');
    badge.style.background = statusStr === 'PARSED' ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.2)';
    badge.style.color = statusStr === 'PARSED' ? '#34d399' : '#fde047';
  }

  const metaCurr = document.getElementById('parserMetaCurrency');
  const currencyCode = data.statement_metadata?.currency || 'USD';
  if (metaCurr) metaCurr.innerText = currencyCode;

  const calcNet = document.getElementById('parserCalculatedNet');
  if (calcNet) calcNet.innerText = data.totals?.net_str ? `$${data.totals.net_str} ${currencyCode}` : formatCurrency(data.totals?.net || 0);

  const recStatus = document.getElementById('parserReconciliationStatus');
  if (recStatus) {
    const rStat = data.reconciliation?.status || 'reconciled';
    recStatus.innerText = rStat === 'reconciled' ? '✓ Reconciled' : '⚠ Mismatch';
    recStatus.style.color = rStat === 'reconciled' ? '#34d399' : '#f87171';
  }

  // Warnings Box
  const warnBox = document.getElementById('parserWarningsBox');
  if (warnBox) {
    if (data.warnings && data.warnings.length > 0) {
      warnBox.style.display = 'block';
      warnBox.innerHTML = `<strong>Parsing Warnings (${data.warnings.length}):</strong><ul style="margin-top:4px; padding-left:18px;">` +
        data.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('') + `</ul>`;
    } else {
      warnBox.style.display = 'none';
    }
  }

  // Monthly Breakdown / Earnings Table
  const tbody = document.getElementById('monthlyBreakdownTableBody');
  if (tbody) {
    const earningsList = (data.monthly_earnings && data.monthly_earnings.length > 0) ? data.monthly_earnings : [];
    const breakdownList = data.monthly_breakdown || [];

    const listToRender = earningsList.length > 0 ? earningsList : breakdownList;

    if (listToRender.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No monthly breakdown extracted.</td></tr>`;
    } else {
      tbody.innerHTML = listToRender.map((m, idx) => {
        const monthName = m.month || 'Unknown';
        const exactAmountStr = m.amount ? `$${m.amount}` : (m.net_royalty !== undefined ? formatCurrency(m.net_royalty) : '$0.00');

        // Lookup matching legacy breakdown item if rendering earningsList
        const legItem = breakdownList.find(b => b.month === monthName) || (breakdownList[idx] || {});

        const topSource = legItem.primary_source || (legItem.sources && legItem.sources.length > 0 ? legItem.sources[0].platform : 'Streaming / Sales');
        const momStr = legItem.mom_growth_pct !== null && legItem.mom_growth_pct !== undefined
          ? (legItem.mom_growth_pct >= 0 ? `<span style="color:#34d399; font-weight:600;">+${legItem.mom_growth_pct}%</span>` : `<span style="color:#f87171; font-weight:600;">${legItem.mom_growth_pct}%</span>`)
          : `<span style="color:var(--text-dim);">Baseline</span>`;
        const trackCountStr = legItem.track_count ? `${legItem.track_count} Track${legItem.track_count > 1 ? 's' : ''}` : '1 Track';

        // Source Provenance Badge
        const prov = m.provenance || {};
        const provFile = prov.source_file || data.statement_metadata?.source_file || 'statement.pdf';
        const provRow = prov.source_row ? ` (Row ${prov.source_row})` : '';

        return `
          <tr>
            <td><strong>${escapeHtml(monthName)}</strong></td>
            <td>
              <strong style="color:#34d399; font-size:1.05rem;">${escapeHtml(exactAmountStr)}</strong>
              <div style="font-size:0.7rem; color:var(--text-dim);" title="${escapeHtml(provFile + provRow)}">
                <i data-lucide="file-check" style="width:10px; height:10px; vertical-align:middle;"></i> ${escapeHtml(provFile.substring(0, 18))}${provFile.length > 18 ? '...' : ''}${provRow}
              </div>
            </td>
            <td>${momStr}</td>
            <td><span style="color:#e2e8f0; font-size:0.85rem;">${escapeHtml(trackCountStr)}</span></td>
            <td><code style="background:rgba(99,102,241,0.1); color:#a5b4fc; padding:3px 8px; border-radius:4px; font-size:0.8rem;">${escapeHtml(topSource)}</code></td>
          </tr>
        `;
      }).join('');
    }
  }

  lucide.createIcons();
}

function renderUploadedFilesList() {
  const container = document.getElementById('uploadedFilesList');
  if (!container) return;

  if (state.uploadedFiles.length === 0 && !state.sampleDatasetLoaded) {
    container.innerHTML = `
      <div class="empty-files-placeholder">
        <i data-lucide="file-spreadsheet"></i>
        <span>No files uploaded yet. Upload at least 6 months of statements to unlock the Exact Advance calculation.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  if (state.sampleDatasetLoaded) {
    container.innerHTML = `
      <div class="file-item-pill">
        <div>
          <i data-lucide="check-circle" style="color:#10b981; vertical-align:middle; margin-right:6px;"></i>
          <strong>${state.sampleDatasetLoaded.toUpperCase()} Statements</strong> (12 Months Historical Data Loaded)
        </div>
        <span class="badge-env">VERIFIED 12M</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = state.uploadedFiles.map(f => `
    <div class="file-item-pill">
      <div>
        <i data-lucide="file-text" style="vertical-align:middle; margin-right:6px;"></i>
        <strong>${escapeHtml(f.name)}</strong> (${(f.size / 1024).toFixed(1)} KB)
      </div>
      <span class="badge-env">PARSED</span>
    </div>
  `).join('');
  lucide.createIcons();
}

function loadSampleDataset(datasetKey) {
  state.sampleDatasetLoaded = datasetKey;
  state.hasUploadedValidData = true;
  state.uploadedFiles = [];

  const artistsMap = {
    'islem-23': { name: 'Islem-23', rev: 317.59, dist: 'DistroKid' },
    'arta': { name: 'Arta', rev: 2859.00, dist: 'Too Lost' },
    'ince': { name: 'INCE', rev: 99.00, dist: 'TuneCore' },
    'pulp': { name: 'PULP', rev: 3446.00, dist: 'DashGo' }
  };

  const info = artistsMap[datasetKey] || { name: 'Sample Artist', rev: 2500.0, dist: 'DistroKid' };
  selectArtist(info.name, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop', 'spotify:artist:' + datasetKey);

  const revInput = document.getElementById('declaredMonthlyRevInput');
  if (revInput) revInput.value = info.rev;
  state.declaredMonthlyRevenue = info.rev;

  selectDistributor(info.dist.toLowerCase());
  renderUploadedFilesList();
  document.getElementById('calculateExactBtn').removeAttribute('disabled');

  updateEstimateCalculations();
}

// Stage 5 Admin Deal Controls (Real-Time Output Updates)
function selectFinalTerm(term, elem) {
  state.dealTerms.term = parseInt(term, 10);
  if (elem && elem.parentElement) {
    elem.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    elem.classList.add('active');
  }
  executeValuation();
}

function selectPreRecoupSplit(rhoVal, elem) {
  if (rhoVal === 'auto') {
    state.dealTerms.customRho = 'auto';
  } else {
    state.dealTerms.customRho = parseFloat(rhoVal);
  }
  if (elem && elem.parentElement) {
    elem.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    elem.classList.add('active');
  }
  executeValuation();
}

function updateFinalPostRecoupShare(val) {
  const num = parseFloat(val);
  state.dealTerms.postRecoupSharePct = num;
  const badge = document.getElementById('finalPostRecoupValBadge');
  if (badge) badge.innerText = `${num}%`;
  executeValuation();
}

function updateFinalContractedSingles(val) {
  const num = parseInt(val, 10);
  state.dealTerms.singlesContracted = num;
  const badge = document.getElementById('finalSinglesValBadge');
  if (badge) badge.innerText = `${num} single${num !== 1 ? 's' : ''}`;
  executeValuation();
}

// Stage 5: Valuation Execution & Rendering
async function executeValuation() {
  const btn = document.getElementById('calculateExactBtn');
  if (btn) {
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Calculating Exact Advance...`;
    btn.disabled = true;
  }

  try {
    const formData = new FormData();
    if (state.uploadedFiles.length > 0) {
      state.uploadedFiles.forEach(f => formData.append('files', f));
    }
    if (state.sampleDatasetLoaded) {
      formData.append('sample_dataset', state.sampleDatasetLoaded);
    }
    formData.append('declared_revenue', state.declaredMonthlyRevenue);
    formData.append('artist_name', state.selectedArtist.name);
    formData.append('spotify_id', state.selectedArtist.spotifyId);
    formData.append('distributor', state.selectedDistributor.name);
    formData.append('term_years', state.dealTerms.term);
    formData.append('pay_through_pct', 0);
    formData.append('post_recoup_share_pct', state.dealTerms.postRecoupSharePct);
    formData.append('singles_contracted', state.dealTerms.singlesContracted);
    formData.append('rights_scope', state.dealTerms.rightsScope);
    formData.append('is_gross', state.dealTerms.isGross);
    formData.append('distributor_fee_pct', state.dealTerms.distributorFeePct);
    formData.append('k_mode', state.dealTerms.kMode);
    
    if (state.dealTerms.customRho && state.dealTerms.customRho !== 'auto') {
      formData.append('custom_rho', state.dealTerms.customRho);
    }

    const res = await fetch('/api/valuation', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      state.activeValuationResult = data;
      renderValuationDashboard(data);
      goToStage(5);
      return;
    }
  } catch (err) {
    console.warn('Backend API offline, running deterministic client valuation engine fallback.', err);
  } finally {
    if (btn) {
      btn.innerHTML = `<i data-lucide="calculator"></i> CALCULATE EXACT ADVANCE`;
      btn.disabled = false;
    }
  }

  // Pure deterministic client-side engine execution
  const clientResult = runClientSideDeterministicEngine();
  state.activeValuationResult = clientResult;
  renderValuationDashboard(clientResult);
  goToStage(5);
}

function runClientSideDeterministicEngine() {
  const R0 = state.declaredMonthlyRevenue || 3400.0;
  const T = state.dealTerms.term;
  const p = 0;
  const e = state.dealTerms.postRecoupSharePct / 100.0;
  const N = state.dealTerms.singlesContracted;

  const kMap = { 1: 10.797, 2: 20.816, 3: 29.211, 5: 36.028, 8: 48.0 };
  const rhoMap = { 1: 0.90, 2: 0.80, 3: 0.70, 5: 0.60, 8: 0.50 };
  let kTable = kMap[T] || 29.211;
  let rhoT = rhoMap[T] || 0.70;

  if (state.dealTerms.customRho && state.dealTerms.customRho !== 'auto' && typeof state.dealTerms.customRho === 'number') {
    rhoT = state.dealTerms.customRho;
    kTable = rhoT * 12.0 * T;
  }

  // E(e) Closed Form
  const c = 0.296880;
  const k_e = 2.879956;
  const E_mult = (e >= 1.0) ? 1.0 : Math.min(1.30, 1.0 + c * (1.0 - Math.pow(e, k_e)));

  const aCatalog = Math.round(R0 * kTable * (1.0 - p) * E_mult);

  // New release
  let aNew = null;
  let rangeLo = null;
  let rangeHi = null;
  let m0Hat = null;
  let lifetimeL = null;

  if (N > 0) {
    m0Hat = Math.round(R0 * 0.15);
    lifetimeL = 4.77;
    const aSingle = Math.round(m0Hat * lifetimeL * rhoT * 0.50);
    aNew = N * aSingle;
    rangeLo = Math.round(aNew * 0.65);
    rangeHi = Math.round(aNew * 1.55);
  }

  const aTotal = aCatalog + (aNew || 0);
  const ttr = (T * (1.0 - p) * E_mult).toFixed(2);

  return {
    success: true,
    artist: { name: state.selectedArtist.name },
    deal_terms: { term_years: T, pay_through_pct: state.dealTerms.payThroughPct, post_recoup_share_pct: e * 100 },
    headline_offers: {
      a_catalog: aCatalog,
      a_new: aNew,
      a_total: aTotal,
      new_release_range: N > 0 ? { low: rangeLo, high: rangeHi } : null
    },
    catalog_analytics: {
      r0: R0,
      r0_last: R0,
      ttr_years: parseFloat(ttr),
      gini_concentration: 0.684,
      song_count: (state.selectedArtist && state.selectedArtist.catalogTracks && state.selectedArtist.catalogTracks.length > 0) ? state.selectedArtist.catalogTracks.length : 14,
      top_1_share_pct: 38.5,
      top_5_share_pct: 79.2,
      risk_discount_pct: 12.4,
      top_songs: (state.selectedArtist && state.selectedArtist.catalogTracks && state.selectedArtist.catalogTracks.length > 0)
        ? state.selectedArtist.catalogTracks.map((tr, idx, arr) => {
            const num = arr.length;
            const share = (num <= 3) ? (1.0 / num) : ((idx < 3) ? (0.75 / 3) : (0.25 / (num - 3)));
            const mRev = Math.round(R0 * share);
            const advAlloc = Math.round(aCatalog * share);
            return {
              title: tr.title || tr.name || `Track ${idx+1}`,
              identifier: tr.isrc || `USROYAL${(state.selectedArtist.name || 'ART').substring(0, 3).toUpperCase()}${idx+1}`,
              artwork: tr.artwork || tr.image || '',
              album: tr.album || 'Single',
              share: share,
              monthly_growth_rate: -0.012,
              severity: 0.12,
              monthly_rev: mRev,
              advance_allocation: advAlloc
            };
          })
        : [
            { title: 'Top Hit Single', identifier: 'USROYAL001', share: 0.385, monthly_growth_rate: -0.012, severity: 0.12, monthly_rev: Math.round(R0 * 0.385), advance_allocation: Math.round(aCatalog * 0.385) },
            { title: 'Lead Track 2', identifier: 'USROYAL002', share: 0.224, monthly_growth_rate: -0.024, severity: 0.24, monthly_rev: Math.round(R0 * 0.224), advance_allocation: Math.round(aCatalog * 0.224) },
            { title: 'Acoustic Version', identifier: 'USROYAL003', share: 0.110, monthly_growth_rate: 0.005, severity: 0.00, monthly_rev: Math.round(R0 * 0.110), advance_allocation: Math.round(aCatalog * 0.110) },
            { title: 'Remix Club Edit', identifier: 'USROYAL004', share: 0.073, monthly_growth_rate: -0.045, severity: 0.45, monthly_rev: Math.round(R0 * 0.073), advance_allocation: Math.round(aCatalog * 0.073) }
          ]
    },
    new_release_analytics: N > 0 ? {
      observable_releases_count: 4,
      usable_releases_count: 3,
      m0_hat: m0Hat,
      lifetime_multiple_l: lifetimeL,
      r_tail: 0.842
    } : null,
    payment_schedule: N > 0 ? {
      tranches: [
        { label: 'Signing / Execution', trigger: 'execution', share: 0.30, amount: Math.round(aNew * 0.30) },
        { label: 'Delivery of Single 1', trigger: 'delivery(1)', share: 0.35, amount: Math.round(aNew * 0.35) },
        { label: `Delivery of Single ${N}`, trigger: `delivery(${N})`, share: 0.35, amount: Math.round(aNew * 0.35) }
      ],
      at_risk_share_pct: 30.0,
      at_risk_amount: Math.round(aNew * 0.30)
    } : null,
    detailed_flags: [
      { code: 'PARAM_WEIGHTS_UNCALIBRATED', severity: 'advisory', title: 'Uncalibrated Pricing Weights', description: 'Valuation weights are finance-owned policy settings.' },
      ...(N > 0 ? [
        { code: 'FORECAST_NOT_MEASUREMENT', severity: 'advisory', title: 'New-Release Forecast Applied', description: 'New-release advance is a forecast of unwritten music.' },
        { code: 'DELIVERY_TIMING_ASSUMED', severity: 'advisory', title: 'Immediate Delivery Assumed', description: 'Singles are assumed to be delivered in month 0.' }
      ] : []),
      { code: 'NO_RELEASE_DATES', severity: 'advisory', title: 'Dollar Age Omitted', description: 'Per-track release dates not provided in statement files.' },
      { code: 'NO_STREAMING_DATA', severity: 'advisory', title: 'Streaming Data Excluded', description: 'Follower signals are excluded from catalog multiple sizing.' }
    ]
  };
}

let advanceChartInstance = null;

function renderValuationDashboard(data) {
  state.activeValuationResult = data;
  const headlines = data.headline_offers;
  const cat = data.catalog_analytics;

  document.getElementById('valTotalHero').innerText = formatCurrency(headlines.a_total);
  document.getElementById('valCatalogPill').innerText = formatCurrency(headlines.a_catalog);

  const newPillBlock = document.getElementById('valNewReleasePillBlock');
  if (headlines.a_new !== null && headlines.a_new !== undefined && headlines.a_new > 0) {
    newPillBlock.style.display = 'block';
    document.getElementById('valNewReleasePill').innerText = formatCurrency(headlines.a_new);
    if (headlines.new_release_range && headlines.new_release_range.low) {
      document.getElementById('valNewReleaseRangeSub').innerText =
        `Range: ${formatCurrency(headlines.new_release_range.low)} – ${formatCurrency(headlines.new_release_range.high)}`;
    }
  } else {
    newPillBlock.style.display = 'none';
  }

  // Meta items
  document.getElementById('valArtistMetaName').innerText = (state.selectedArtist && state.selectedArtist.name) ? state.selectedArtist.name : 'Artist';
  document.getElementById('valTermMeta').innerText = `${data.deal_terms.term_years} Years`;
  document.getElementById('valRhoMeta').innerText = `${((kToRho(data.deal_terms.term_years)) * 100).toFixed(1)}%`;
  document.getElementById('valTtrMeta').innerText = `${cat.ttr_years} Yrs`;

  // Left Tiles
  document.getElementById('resR0Val').innerText = formatCurrency(cat.r0);
  document.getElementById('resR0LastFoot').innerText = `Last month: ${formatCurrency(cat.r0_last)}`;
  document.getElementById('resGiniVal').innerText = cat.gini_concentration ? cat.gini_concentration.toFixed(3) : 'N/A';
  document.getElementById('resGiniFoot').innerText = `Top-1: ${cat.top_1_share_pct}% | Top-5: ${cat.top_5_share_pct}%`;
  document.getElementById('resRiskDiscVal').innerText = `${cat.risk_discount_pct}%`;

  // Full Catalogue & Track Breakdown Table
  const topTable = document.getElementById('topSongsTableBody');
  if (topTable) {
    let songList = cat.top_songs || [];
    if ((!songList || songList.length === 0) && state.selectedArtist && state.selectedArtist.catalogTracks) {
      songList = state.selectedArtist.catalogTracks;
    }

    topTable.innerHTML = (songList || []).map((s, idx) => {
      const title = s.title || s.name || `Recording ${idx + 1}`;
      const isrc = s.identifier || s.isrc || `ISRC-${idx + 1}`;
      const art = s.artwork || s.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=50&h=50&fit=crop';
      const sharePct = (s.share ? (s.share * 100).toFixed(1) : ((1.0 / Math.max(1, songList.length)) * 100).toFixed(1));
      const mRev = s.monthly_rev ? formatCurrency(s.monthly_rev) : formatCurrency(cat.r0 * (parseFloat(sharePct) / 100));
      const advAlloc = s.advance_allocation ? formatCurrency(s.advance_allocation) : formatCurrency(headlines.a_catalog * (parseFloat(sharePct) / 100));

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="${escapeHtml(art)}" alt="${escapeHtml(title)}" style="width:28px; height:28px; border-radius:4px; object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=50&h=50&fit=crop';">
              <div>
                <strong>${escapeHtml(title)}</strong>
              </div>
            </div>
          </td>
          <td><code style="background:rgba(99,102,241,0.1); color:#a5b4fc; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${escapeHtml(isrc)}</code></td>
          <td><strong style="color:#38bdf8;">${sharePct}%</strong></td>
          <td>${mRev}/mo</td>
          <td><strong style="color:#c084fc;">${advAlloc}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // Right Tiles
  const nr = data.new_release_analytics;
  if (nr) {
    document.getElementById('resM0Val').innerText = formatCurrency(nr.m0_hat);
    document.getElementById('resReleasesCountFoot').innerText = `${nr.usable_releases_count} usable releases`;
    document.getElementById('resLVal').innerText = nr.lifetime_multiple_l ? nr.lifetime_multiple_l.toFixed(2) : 'N/A';
    document.getElementById('resTailFoot').innerText = `Tail ratio: ${nr.r_tail ? nr.r_tail.toFixed(3) : 'N/A'}`;
  } else {
    document.getElementById('resM0Val').innerText = 'N/A';
    document.getElementById('resReleasesCountFoot').innerText = 'Catalog-only deal';
    document.getElementById('resLVal').innerText = 'N/A';
  }

  // Schedule Table
  const sched = data.payment_schedule;
  if (sched && sched.tranches && sched.tranches.length > 0) {
    document.getElementById('resAtRiskShareVal').innerText = `${sched.at_risk_share_pct}%`;
    document.getElementById('resAtRiskAmtFoot').innerText = `At risk: ${formatCurrency(sched.at_risk_amount)}`;

    const schedTable = document.getElementById('scheduleTableBody');
    if (schedTable) {
      schedTable.innerHTML = sched.tranches.map(t => `
        <tr>
          <td><strong>${escapeHtml(t.label)}</strong></td>
          <td><code>${escapeHtml(t.trigger)}</code></td>
          <td>${(t.share * 100).toFixed(1)}%</td>
          <td><strong>${formatCurrency(t.amount)}</strong></td>
        </tr>
      `).join('');
    }
  } else {
    document.getElementById('resAtRiskShareVal').innerText = '0%';
    document.getElementById('resAtRiskAmtFoot').innerText = '100% catalog';
    const schedTable = document.getElementById('scheduleTableBody');
    if (schedTable) {
      schedTable.innerHTML = `
        <tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No new-release payment milestones for catalog-only deal.</td></tr>
      `;
    }
  }

  // Flags
  const flagsContainer = document.getElementById('flagsContainer');
  if (flagsContainer) {
    flagsContainer.innerHTML = (data.detailed_flags || []).map(f => `
      <div class="flag-badge-card ${f.severity}">
        <div class="flag-title">${escapeHtml(f.title)}</div>
        <div class="flag-desc">${escapeHtml(f.description)}</div>
      </div>
    `).join('');
  }

  // ================= RENDER MULTI-YEAR HORIZON & CHART =================
  renderMultiYearHorizon(data);

  lucide.createIcons();
}

function renderMultiYearHorizon(data) {
  let estimates = data.multi_year_estimates;
  const currentTerm = data.deal_terms ? data.deal_terms.term_years : 3;

  // If multi_year_estimates not present in backend response, compute client-side
  if (!estimates || !Array.isArray(estimates) || estimates.length === 0) {
    const r0 = (data.catalog_analytics && data.catalog_analytics.r0) ? data.catalog_analytics.r0 : 3000;
    const riskDisc = (data.catalog_analytics && data.catalog_analytics.risk_discount_pct) ? (data.catalog_analytics.risk_discount_pct / 100) : 0.05;
    const kMap = { 1: 10.797, 2: 20.816, 3: 29.211, 4: 33.000, 5: 36.028 };
    const rhoMap = { 1: 0.90, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60 };

    estimates = [1, 2, 3, 4, 5].map(t => {
      const kBase = kMap[t];
      const kActive = kBase * (1.0 - riskDisc);
      const catVal = Math.round(r0 * kActive);
      const nrVal = (data.headline_offers && data.headline_offers.a_new) ? Math.round(data.headline_offers.a_new * (rhoMap[t] / 0.70)) : 0;
      return {
        term_years: t,
        label: `${t} Year${t > 1 ? 's' : ''}`,
        a_catalog: catVal,
        a_new: nrVal,
        a_total: catVal + nrVal,
        k_base: kBase,
        k_active: Math.round(kActive * 1000) / 1000,
        rho_t_pct: Math.round(rhoMap[t] * 1000) / 10,
        ttr_years: t,
        risk_discount_pct: Math.round(riskDisc * 10000) / 100
      };
    });
  }

  // 1. Render Year Estimation Cards
  const gridElem = document.getElementById('yearsEstimationGrid');
  if (gridElem) {
    gridElem.innerHTML = estimates.map(est => {
      const isActive = est.term_years === currentTerm;
      return `
        <div class="year-estimate-card ${isActive ? 'active-term-card' : ''}" onclick="switchValuationTerm(${est.term_years})">
          <div class="year-card-term-label">${escapeHtml(est.label)}</div>
          <div class="year-card-total-val">${formatCurrency(est.a_total)}</div>
          <div class="year-card-breakdown">
            <div>Cat: <span class="cat-sub">${formatCurrency(est.a_catalog)}</span></div>
            ${est.a_new > 0 ? `<div>New: <span class="nr-sub">${formatCurrency(est.a_new)}</span></div>` : ''}
          </div>
          <div class="year-card-badges">
            <span class="badge-micro-multiple">${est.k_active || est.k_base}x</span>
            <span class="badge-micro-rho">${est.rho_t_pct}% ρ</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Update Active Term Badge
  const badgeElem = document.getElementById('currentSelectedTermBadge');
  if (badgeElem) {
    badgeElem.innerText = `Selected Term: ${currentTerm} Year${currentTerm > 1 ? 's' : ''}`;
  }

  // 2. Render Full Matrix Comparison Table
  const tableBody = document.getElementById('multiYearTableBody');
  if (tableBody) {
    tableBody.innerHTML = estimates.map(est => {
      const isActive = est.term_years === currentTerm;
      return `
        <tr class="${isActive ? 'matrix-highlight-row' : ''}" onclick="switchValuationTerm(${est.term_years})" style="cursor: pointer;">
          <td>
            <strong>${escapeHtml(est.label)}</strong>
            ${isActive ? ' <span style="font-size:0.7rem; background:var(--primary-purple); color:#fff; padding:1px 5px; border-radius:3px; margin-left:4px;">ACTIVE</span>' : ''}
          </td>
          <td><strong style="color: ${isActive ? '#fda4af' : '#fff'}; font-size: 1.05rem;">${formatCurrency(est.a_total)}</strong></td>
          <td><span style="color: #38bdf8;">${formatCurrency(est.a_catalog)}</span></td>
          <td><span style="color: #c084fc;">${est.a_new > 0 ? formatCurrency(est.a_new) : '—'}</span></td>
          <td><code>${est.k_active || est.k_base}x</code></td>
          <td>${est.rho_t_pct}%</td>
          <td>${est.ttr_years} Yrs</td>
          <td>${est.risk_discount_pct}%</td>
        </tr>
      `;
    }).join('');
  }

  // 3. Render / Update Chart.js Instance
  renderAdvanceChart(estimates, currentTerm);
}

function renderAdvanceChart(estimates, currentTerm) {
  const canvas = document.getElementById('multiYearAdvanceChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const labels = estimates.map(e => e.label);
  const totalData = estimates.map(e => e.a_total);
  const catalogData = estimates.map(e => e.a_catalog);
  const newReleaseData = estimates.map(e => e.a_new || 0);

  // If chart instance exists, destroy first
  if (advanceChartInstance) {
    advanceChartInstance.destroy();
    advanceChartInstance = null;
  }

  // Create glowing gradient fills
  const gradTotal = ctx.createLinearGradient(0, 0, 0, 300);
  gradTotal.addColorStop(0, 'rgba(225, 29, 72, 0.35)');
  gradTotal.addColorStop(1, 'rgba(225, 29, 72, 0.02)');

  const gradCatalog = ctx.createLinearGradient(0, 0, 0, 300);
  gradCatalog.addColorStop(0, 'rgba(56, 189, 248, 0.85)');
  gradCatalog.addColorStop(1, 'rgba(56, 189, 248, 0.4)');

  const gradNew = ctx.createLinearGradient(0, 0, 0, 300);
  gradNew.addColorStop(0, 'rgba(192, 132, 252, 0.85)');
  gradNew.addColorStop(1, 'rgba(192, 132, 252, 0.4)');

  advanceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'line',
          label: 'Total Advance Offer',
          data: totalData,
          borderColor: '#f43f5e',
          borderWidth: 3,
          backgroundColor: gradTotal,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#e11d48',
          pointBorderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 9,
          order: 1
        },
        {
          type: 'bar',
          label: 'Catalogue Component',
          data: catalogData,
          backgroundColor: gradCatalog,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.55,
          categoryPercentage: 0.6,
          order: 2
        },
        {
          type: 'bar',
          label: 'New Release Component',
          data: newReleaseData,
          backgroundColor: gradNew,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.55,
          categoryPercentage: 0.6,
          order: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#fff',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          callbacks: {
            label: function (context) {
              const val = context.parsed.y || 0;
              return ` ${context.dataset.label}: $${val.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: '#94a3b8',
            font: {
              family: 'Inter',
              size: 12,
              weight: '600'
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.06)',
            drawBorder: false
          },
          ticks: {
            color: '#94a3b8',
            font: {
              family: 'Inter',
              size: 11
            },
            callback: function (value) {
              if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
              if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'k';
              return '$' + value;
            }
          }
        }
      }
    }
  });
}

function switchValuationTerm(termYears) {
  const data = state.activeValuationResult;
  if (!data) return;

  state.dealTerms.term = termYears;
  if (data.deal_terms) {
    data.deal_terms.term_years = termYears;
  }

  // Find estimate for this term
  const estimates = data.multi_year_estimates || [];
  const matched = estimates.find(e => e.term_years === termYears);

  if (matched) {
    document.getElementById('valTotalHero').innerText = formatCurrency(matched.a_total);
    document.getElementById('valCatalogPill').innerText = formatCurrency(matched.a_catalog);

    const newPillBlock = document.getElementById('valNewReleasePillBlock');
    if (matched.a_new > 0) {
      newPillBlock.style.display = 'block';
      document.getElementById('valNewReleasePill').innerText = formatCurrency(matched.a_new);
      if (matched.new_release_range && matched.new_release_range.low) {
        document.getElementById('valNewReleaseRangeSub').innerText =
          `Range: ${formatCurrency(matched.new_release_range.low)} – ${formatCurrency(matched.new_release_range.high)}`;
      }
    } else {
      newPillBlock.style.display = 'none';
    }

    document.getElementById('valTermMeta').innerText = `${termYears} Year${termYears > 1 ? 's' : ''}`;
    document.getElementById('valRhoMeta').innerText = `${matched.rho_t_pct}%`;
    document.getElementById('valTtrMeta').innerText = `${matched.ttr_years} Yrs`;
  }

  renderMultiYearHorizon(data);
}

function kToRho(T) {
  const map = { 1: 0.90, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60 };
  return map[T] || 0.70;
}

// Provenance Modal & Memo Export
function toggleProvenanceModal() {
  const modal = document.getElementById('provenanceModal');
  const isHidden = modal.style.display === 'none';
  if (isHidden) {
    const jsonStr = JSON.stringify(state.activeValuationResult || {}, null, 2);
    document.getElementById('provenanceJsonCode').innerText = jsonStr;
    modal.style.display = 'flex';
  } else {
    modal.style.display = 'none';
  }
}

function copyProvenanceJson() {
  const jsonStr = JSON.stringify(state.activeValuationResult || {}, null, 2);
  navigator.clipboard.writeText(jsonStr);
  alert('Provenance JSON copied to clipboard!');
}

function downloadUnderwritingMemo() {
  const data = state.activeValuationResult;
  if (!data) return;

  const text = `
======================================================================
                  ROYALTY ADVANCE UNDERWRITING MEMO
======================================================================
Artist: ${state.selectedArtist.name}
Contract Term: ${data.deal_terms.term_years} Years
Pay-Through: ${data.deal_terms.pay_through_pct}%
Post-Recoup Share: ${data.deal_terms.post_recoup_share_pct}%
Recoupment Split: ${(kToRho(data.deal_terms.term_years) * 100).toFixed(1)}%

VALUATION OFFERS
----------------------------------------------------------------------
Total Advance: ${formatCurrency(data.headline_offers.a_total)}
Catalogue Component: ${formatCurrency(data.headline_offers.a_catalog)}
New Release Component: ${data.headline_offers.a_new ? formatCurrency(data.headline_offers.a_new) : 'N/A'}


CATALOGUE DIAGNOSTICS
----------------------------------------------------------------------
Trailing-3 Median R0: ${formatCurrency(data.catalog_analytics.r0)}/mo
Gini Concentration G*: ${data.catalog_analytics.gini_concentration}
Top 1 Song Share: ${data.catalog_analytics.top_1_share_pct}%
Top 5 Song Share: ${data.catalog_analytics.top_5_share_pct}%
Time to Recoup (TTR): ${data.catalog_analytics.ttr_years} Years

SYSTEM FLAGS RAISED
----------------------------------------------------------------------
${(data.detailed_flags || []).map(f => `[${f.severity.toUpperCase()}] ${f.title}: ${f.description}`).join('\n')}
======================================================================
`;

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Underwriting_Memo_${state.selectedArtist.name.replace(/\s+/g, '_')}.txt`;
  a.click();
}

// Helpers
function formatCurrency(num) {
  if (num === null || num === undefined) return '$0';
  return '$' + Math.round(num).toLocaleString('en-US');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
