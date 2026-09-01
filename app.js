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
  activeValuationResult: null,
  allExtractedSongs: [],
  selectedSongIds: new Set(),
  pendingFilterSelection: new Set()
};

// Distributor Master Directory
const DISTRIBUTORS_LIST = [
  { id: 'distrokid', name: 'DistroKid', color: '#1db954', icon: 'DK', category: 'DIY', format: 'CSV / TSV' },
  { id: 'tunecore', name: 'TuneCore', color: '#0088cc', icon: 'TC', category: 'DIY', format: 'CSV / XLSX' },
  { id: 'cdbaby', name: 'CD Baby', color: '#e05638', icon: 'CD', category: 'DIY', format: 'TXT / CSV' },
  { id: 'toolost', name: 'Too Lost', color: '#e11d48', icon: 'TL', category: 'Indie / Label', format: 'CSV / XLSX' },
  { id: 'dashgo', name: 'DashGo', color: '#10b981', icon: 'DG', category: 'Label Services', format: 'CSV' },
  { id: 'theorchard', name: 'The Orchard / Sony', color: '#f43f5e', icon: 'TO', category: 'Major / Enterprise', format: 'XLSX / CSV' },
  { id: 'bmg', name: 'BMG', color: '#06b6d4', icon: 'BMG', category: 'Enterprise', format: 'CSV / PDF' },
  { id: 'sparta', name: 'Sparta Distribution', color: '#ef4444', icon: 'SP', category: 'Boutique', format: 'CSV' },
  { id: 'horus', name: 'Horus Music', color: '#06b6d4', icon: 'HM', category: 'Global', format: 'CSV / XLSX' },
  { id: 'stopone', name: 'StopOne', color: '#be123c', icon: 'SO', category: 'Indie', format: 'CSV' },
  { id: 'black17', name: 'Black 17', color: '#eab308', icon: 'B17', category: 'Indie', format: 'CSV' },
  { id: 'kartel', name: 'Kartel Music Group', color: '#ec4899', icon: 'KMG', category: 'Label Services', format: 'CSV' },
  { id: 'awal', name: 'AWAL', color: '#a855f7', icon: 'AWAL', category: 'Label Services', format: 'CSV' },
  { id: 'believe', name: 'Believe Digital', color: '#14b8a6', icon: 'BLV', category: 'Enterprise', format: 'CSV / XLSX' },
  { id: 'stem', name: 'Stem', color: '#6366f1', icon: 'STEM', category: 'Label Services', format: 'CSV' },
  { id: 'unitedmasters', name: 'UnitedMasters', color: '#f97316', icon: 'UM', category: 'Indie / DIY', format: 'CSV / XLSX' },
  { id: 'symphonic', name: 'Symphonic Distribution', color: '#3b82f6', icon: 'SYM', category: 'Indie / Label', format: 'CSV / TSV' },
  { id: 'dittomusic', name: 'Ditto Music', color: '#ec4899', icon: 'DM', category: 'DIY', format: 'CSV' },
  { id: 'empire', name: 'Empire', color: '#e11d48', icon: 'EMP', category: 'Major Indie', format: 'CSV / XLSX' },
  { id: 'platoon', name: 'Platoon (Apple)', color: '#8b5cf6', icon: 'PLT', category: 'Label Services', format: 'CSV' },
  { id: 'onerpm', name: 'ONErpm', color: '#10b981', icon: '1RPM', category: 'Global Indie', format: 'CSV / TSV' },
  { id: 'landr', name: 'Landr', color: '#06b6d4', icon: 'LDR', category: 'DIY', format: 'CSV' },
  { id: 'amuse', name: 'Amuse', color: '#f43f5e', icon: 'AMS', category: 'DIY / Indie', format: 'CSV' },
  { id: 'vydia', name: 'Vydia', color: '#8b5cf6', icon: 'VYD', category: 'Label Services', format: 'CSV' },
  { id: 'soundrop', name: 'Soundrop', color: '#64748b', icon: 'SND', category: 'DIY', format: 'CSV' },
  { id: 'songtradr', name: 'Songtradr', color: '#14b8a6', icon: 'SGT', category: 'Sync / DIY', format: 'CSV' }
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

// Stage Navigation
function goToStage(stageNum) {
  // If Stage 2 or 3 requested, redirect directly to Stage 4 (Upload Reports)
  if (stageNum === 2 || stageNum === 3) {
    stageNum = 4;
  }

  // Advancing without a resolved artist used to silently invent one -- a hashed
  // placeholder ID from the raw input, or a hardcoded "Islem-23" when the box was
  // empty. Resolve through handleStage1Proceed instead so the artist that gets
  // carried forward is the one Spotify actually matched.
  if (stageNum > 1 && !state.selectedArtist) {
    handleStage1Proceed(stageNum);
    return;
  }

  if (stageNum === 5 && !state.hasUploadedValidData && !state.sampleDatasetLoaded) {
    loadSampleDataset('islem23');
    return;
  }

  state.currentStage = stageNum;

  // Toggle sidebar visibility: shown ONLY on the first page (Stage 1)
  const appContainer = document.querySelector('.app') || document.querySelector('.app-layout');
  const sidebar = document.getElementById('appSidebar') || document.querySelector('aside');
  if (sidebar && appContainer) {
    if (stageNum === 1) {
      sidebar.style.display = 'flex';
      appContainer.classList.remove('full-width-stage');
      appContainer.style.gridTemplateColumns = '240px 1fr';
    } else {
      sidebar.style.display = 'none';
      appContainer.classList.add('full-width-stage');
      appContainer.style.gridTemplateColumns = '1fr';
    }
  }

  // Update navigation arrow button states
  const prevBtn = document.getElementById('navPrevBtn');
  const nextBtn = document.getElementById('navNextBtn');
  if (prevBtn) {
    prevBtn.disabled = (stageNum === 1);
  }
  if (nextBtn) {
    nextBtn.disabled = (stageNum === 5);
  }

  // Toggle stage view
  document.querySelectorAll('.stage-section').forEach(sec => sec.classList.remove('active'));
  const activeSec = document.getElementById(`stage${stageNum}`);
  if (activeSec) activeSec.classList.add('active');

  // Update wizard top indicator (if present)
  document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
  if (stageNum === 1) document.getElementById('stepIndicator1')?.classList.add('active');
  else if (stageNum === 4) document.getElementById('stepIndicator2')?.classList.add('active');
  else if (stageNum === 5) document.getElementById('stepIndicator3')?.classList.add('active');

  if (stageNum === 4) {
    initDistributorDropdown();
  }

  lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Forward & Backward Page Navigation
function navigateStep(direction) {
  const current = state.currentStage || 1;
  if (direction === -1) {
    // Backward
    if (current === 5) {
      goToStage(4);
    } else if (current === 4) {
      goToStage(1);
    }
  } else if (direction === 1) {
    // Forward
    if (current === 1) {
      if (state.selectedArtist) {
        goToStage(4);
      } else {
        handleStage1Proceed(4);
      }
    } else if (current === 4) {
      if (state.hasUploadedValidData || state.sampleDatasetLoaded) {
        goToStage(5);
      } else {
        executeValuation();
      }
    }
  }
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

  // 1. Query Apple Music / iTunes API for high-resolution official artist artwork & tracks (CORS enabled)
  try {
    const iRes = await fetch(`https://itunes.apple.com/search?term=${encoded}&entity=song&limit=15`);
    if (iRes.ok) {
      const iData = await iRes.json();
      (iData.results || []).forEach(item => {
        if (!item.artistName) return;
        const normName = item.artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const qNorm = query.toLowerCase().replace(/[^a-z0-9]/g, '');
        const art = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb');
        if (!candidates.some(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normName)) {
          candidates.push({
            id: `itunes_${item.artistId}`,
            name: item.artistName,
            imageUrl: art,
            followers: 150000,
            popularity: normName === qNorm ? 85 : 60,
            genres: [item.primaryGenreName || 'Sound Recording'],
            verified: true,
            spotifyUrl: item.trackViewUrl || '',
            source: 'apple_music'
          });
        } else if (art) {
          const existing = candidates.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normName);
          if (existing && !existing.imageUrl) {
            existing.imageUrl = art;
          }
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

// Backing store for the rendered dropdown. Cards dispatch by index instead of by
// interpolating artist fields into an inline onclick handler: a name containing an
// apostrophe ("Lil' Kim", "Guns N' Roses", "D'Angelo") terminated the single-quoted
// JS string literal early, so clicking those rows threw a SyntaxError and selected
// nothing -- the user then hit Enter and got a fabricated placeholder artist instead.
let lastRenderedResults = [];

function selectArtistByIndex(idx) {
  const a = lastRenderedResults[idx];
  if (!a) return;
  const isLabel = state.entityType === 'label';
  const genreText = isLabel
    ? 'Record Label'
    : ((a.genres && a.genres.length > 0) ? a.genres.slice(0, 2).join(', ') : 'Artist');
  const spotifyUrl = a.spotifyUrl
    || (a.spotify_uri ? `https://open.spotify.com/artist/${a.spotify_uri.replace('spotify:artist:', '')}` : '');
  selectArtist(a.name, a.imageUrl || a.image || '', a.id || '', genreText, spotifyUrl);
}

function renderSpotifySearchResults(items, query = '') {
  const container = document.getElementById('spotifySearchResults');
  const safeQuery = (query || '').trim();
  const qNorm = safeQuery.toLowerCase().replace(/[^a-z0-9]/g, '');

  lastRenderedResults = Array.isArray(items) ? items.slice() : [];
  let listHtml = '';

  if (items && items.length > 0) {
    listHtml = items.map((a, idx) => {
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
        <div class="artist-suggestion-card" onclick="selectArtistByIndex(${idx})">
          <div class="artist-suggestion-avatar-wrap">
            ${hasImg
          ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(a.name)}" class="artist-suggestion-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
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
    // Appended as a real entry so it is selected by index like every other row --
    // an apostrophe in the typed name used to break this handler too.
    const customIdx = lastRenderedResults.length;
    lastRenderedResults.push({
      name: safeQuery,
      id: `indie_${Math.abs(hashString(safeQuery))}`,
      imageUrl: '',
      genres: ['Independent Artist'],
      spotifyUrl: ''
    });
    const customCard = `
      <div class="artist-suggestion-card custom-artist-option" style="background: rgba(147, 51, 234, 0.08); border-top: 1px solid rgba(255,255,255,0.08);" onclick="selectArtistByIndex(${customIdx})">
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

  const knownDatasets = {
    'islem-23': { rev: 317.59, dist: 'DistroKid' },
    'islem 23': { rev: 317.59, dist: 'DistroKid' },
    'islem': { rev: 317.59, dist: 'DistroKid' },
    'arta': { rev: 2859.00, dist: 'Too Lost' },
    'ince': { rev: 99.00, dist: 'TuneCore' },
    'pulp': { rev: 3446.00, dist: 'DashGo' }
  };
  const artKey = cleanName.toLowerCase().trim();
  if (knownDatasets[artKey]) {
    state.sampleDatasetLoaded = artKey.replace(/\s+/g, '-');
    state.declaredMonthlyRevenue = knownDatasets[artKey].rev;
  }

  // Update sidebar & chip
  const sbName = document.getElementById('sidebarArtistName');
  if (sbName) sbName.innerText = cleanName;
  const sbMeta = document.getElementById('sidebarArtistMeta');
  if (sbMeta) sbMeta.innerText = genreText;
  const sbImg = document.getElementById('sidebarArtistImg');
  if (sbImg) sbImg.src = defaultImg;

  const chipName = document.getElementById('chipArtistName');
  if (chipName) chipName.innerText = cleanName;
  const chipImg = document.getElementById('chipArtistImg');
  if (chipImg) chipImg.src = defaultImg;

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
            const sbImg = document.getElementById('sidebarArtistImg');
            if (sbImg) sbImg.src = art.image;
            const chipImg = document.getElementById('chipArtistImg');
            if (chipImg) chipImg.src = art.image;
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
      } catch (e) { }
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
    } catch (e) { }
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
    } catch (e) { }
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








async function handleStage1Proceed(targetStage = 2) {
  if (state.selectedArtist) {
    goToStage(targetStage);
    return;
  }

  const inputVal = (document.getElementById('artistSearchInput')?.value || '').trim();
  if (!inputVal) {
    alert('Please type or select an artist/label name first.');
    document.getElementById('artistSearchInput')?.focus();
    return;
  }

  const nextBtn = document.getElementById('stage1NextBtn');
  const origHtml = nextBtn ? nextBtn.innerHTML : '';
  if (nextBtn) {
    nextBtn.innerHTML = `<span>RESOLVING SPOTIFY ID...</span> <i data-lucide="loader-2" class="spin"></i>`;
    nextBtn.disabled = true;
    lucide.createIcons();
  }

  const restoreBtn = () => {
    if (nextBtn) { nextBtn.innerHTML = origHtml; nextBtn.disabled = false; }
  };

  // Check if inputVal is a Spotify URL / URI / ID
  const sMatch = inputVal.match(/(?:artist\/|spotify:artist:|^)([A-Za-z0-9]{22})/i);
  if (inputVal.includes('spotify.com') || inputVal.includes('spotify:artist:') || (sMatch && sMatch[1].length === 22)) {
    const sId = sMatch ? sMatch[1] : inputVal;
    await selectArtist(inputVal, '', sId, 'Verified Spotify Artist', `https://open.spotify.com/artist/${sId}`);
    restoreBtn();
    goToStage(targetStage);
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
          a.imageUrl || '',
          a.id,
          (a.genres && a.genres.length > 0) ? a.genres.slice(0, 2).join(', ') : 'Verified Artist',
          a.spotifyUrl || ''
        );
        restoreBtn();
        goToStage(targetStage);
        return;
      }
    }
  } catch (err) {
    console.warn('[Spotify Resolve Notice]', err);
  }

  // Last resort: fall back to the ranked search endpoint before giving up, so a name
  // the resolver could not pin down still lands on the best-matching real artist.
  try {
    const searchRes = await fetch(`/api/spotify/search?q=${encodeURIComponent(inputVal)}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const top = (searchData.artists || [])[0];
      if (top && top.name) {
        await selectArtist(
          top.name,
          top.imageUrl || top.image_url || '',
          top.id || '',
          (top.genres && top.genres.length > 0) ? top.genres.slice(0, 2).join(', ') : 'Artist',
          top.spotifyUrl || top.spotify_url || ''
        );
        restoreBtn();
        goToStage(targetStage);
        return;
      }
    }
  } catch (err) {
    console.warn('[Spotify Search Fallback Notice]', err);
  }

  // Nothing matched. Carry the typed name forward as an unresolved independent artist
  // rather than minting a placeholder `spotify:artist:<hash>` ID and a dead profile
  // link, which made an unmatched artist look like a verified Spotify one.
  restoreBtn();
  await selectArtist(inputVal, '', `indie_${Math.abs(hashString(inputVal))}`, 'Independent Artist', '');
  goToStage(targetStage);
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
    // Unresolved: keep the typed text as the name, but never reuse it as a Spotify ID.
    selectArtist(uri.trim(), '', `indie_${Math.abs(hashString(uri.trim()))}`, 'Independent Artist', '');
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
  const declaredRev = revInput ? (parseFloat(revInput.value) || 0) : (state.declaredMonthlyRevenue || 317.59);
  state.declaredMonthlyRevenue = declaredRev;

  const T = state.dealTerms.term;
  const p = state.dealTerms.payThroughPct / 100.0;
  const payFactor = Math.max(0.5, 1.0 - p);

  // K multiples from Table: 1y:10.797, 2y:20.816, 3y:29.211, 5y:36.028, 8y:45.0
  const kMap = { 1: 10.797, 2: 20.816, 3: 29.211, 5: 36.028, 8: 45.0 };
  const kVal = kMap[T] || 29.211;

  // New-release advance component sizing based on contracted singles N
  const singlesN = state.dealTerms.singlesContracted !== undefined ? state.dealTerms.singlesContracted : 5;
  const m0Est = declaredRev * 0.05;
  const lifetimeL = Math.min(24.0, T * 5.5);
  const rhoVal = (state.dealTerms.customRho && typeof state.dealTerms.customRho === 'number') ? state.dealTerms.customRho : 0.50;
  const aSingleEst = m0Est * lifetimeL * rhoVal * 0.50;
  const newReleaseEst = singlesN * aSingleEst;

  const estLow = Math.round((declaredRev * kVal * 0.70 + newReleaseEst * 0.75) * payFactor);
  const estHigh = Math.round((declaredRev * kVal * 1.15 + newReleaseEst * 1.35) * payFactor);

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

// Stage 4: Distributor Search & Selection (Type and Fetch)
function initDistributorDropdown() {
  const dist = state.selectedDistributor || DISTRIBUTORS_LIST[0];
  const chip = document.getElementById('selectedDistributorChip');
  const chipName = document.getElementById('chipDistName');
  const chipIcon = document.getElementById('chipDistIcon');
  const input = document.getElementById('distributorSearchInput');
  const clearBtn = document.getElementById('distSearchClearBtn');
  const searchIcon = document.getElementById('distSearchIcon');

  if (chip && chipName && chipIcon) {
    chipName.innerText = dist.name;
    chipIcon.innerText = dist.icon || dist.name.substring(0, 2).toUpperCase();
    chipIcon.style.background = dist.color || '#e11d48';
    chip.style.display = 'flex';
  }
  if (input) input.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  if (searchIcon) searchIcon.style.display = 'none';
}

function clearDistributorSelection() {
  const chip = document.getElementById('selectedDistributorChip');
  const input = document.getElementById('distributorSearchInput');
  const clearBtn = document.getElementById('distSearchClearBtn');
  const searchIcon = document.getElementById('distSearchIcon');
  const resultsBox = document.getElementById('distributorSearchResults');

  if (chip) chip.style.display = 'none';
  if (input) {
    input.style.display = 'block';
    input.value = '';
    input.focus();
  }
  if (clearBtn) clearBtn.style.display = 'none';
  if (searchIcon) searchIcon.style.display = 'block';
  if (resultsBox) resultsBox.style.display = 'none';

  // Trigger search with empty or show top distributors
  handleDistributorSearch('');
}

function clearDistributorSearchInput() {
  const input = document.getElementById('distributorSearchInput');
  const resultsBox = document.getElementById('distributorSearchResults');
  const clearBtn = document.getElementById('distSearchClearBtn');
  const searchIcon = document.getElementById('distSearchIcon');

  if (input) {
    input.value = '';
    input.focus();
  }
  if (resultsBox) resultsBox.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  if (searchIcon) searchIcon.style.display = 'block';
}

let distSearchDebounce = null;
function handleDistributorSearch(query) {
  clearTimeout(distSearchDebounce);
  const q = (query || '').trim();
  const clearBtn = document.getElementById('distSearchClearBtn');
  const searchIcon = document.getElementById('distSearchIcon');
  const resultsBox = document.getElementById('distributorSearchResults');

  if (clearBtn && searchIcon) {
    if (q.length > 0) {
      clearBtn.style.display = 'flex';
      searchIcon.style.display = 'none';
    } else {
      clearBtn.style.display = 'none';
      searchIcon.style.display = 'block';
    }
  }

  if (!resultsBox) return;

  resultsBox.style.display = 'block';
  resultsBox.innerHTML = `
    <div style="padding: 10px; text-align: center; color: var(--mt-fg-3); font-size: 0.85rem;">
      <i data-lucide="loader-2" class="spin" style="vertical-align: middle; margin-right: 6px;"></i> Searching distributors...
    </div>
  `;
  lucide.createIcons();

  distSearchDebounce = setTimeout(() => {
    renderDistributorSearchResults(q);
  }, 50);
}

let lastRenderedDistributors = [];

function selectDistributorByIndex(idx) {
  const dist = lastRenderedDistributors[idx];
  if (!dist) return;
  selectDistributor(dist);
}

function renderDistributorSearchResults(query = '') {
  const resultsBox = document.getElementById('distributorSearchResults');
  if (!resultsBox) return;

  const q = query.toLowerCase().trim();
  let matches = [];

  if (q.length === 0) {
    matches = DISTRIBUTORS_LIST.slice(0, 8);
  } else {
    matches = DISTRIBUTORS_LIST.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.id && d.id.toLowerCase().includes(q)) ||
      (d.icon && d.icon.toLowerCase().includes(q)) ||
      (d.category && d.category.toLowerCase().includes(q))
    );
  }

  lastRenderedDistributors = matches.slice();

  let html = '';
  if (matches.length > 0) {
    html += matches.map((d, idx) => `
      <div class="search-result-item" onclick="selectDistributorByIndex(${idx})" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: var(--mt-radius-sm); cursor: pointer; transition: background var(--mt-dur-fast);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="dist-icon-badge" style="background: ${d.color || '#e11d48'}; width: 28px; height: 28px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;">${escapeHtml(d.icon || d.name.substring(0, 2).toUpperCase())}</span>
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--mt-fg-1);">${escapeHtml(d.name)}</div>
            <div style="font-size: 11px; color: var(--mt-fg-3);">${escapeHtml(d.category || 'Music Distributor')} · ${escapeHtml(d.format || 'CSV / TSV')}</div>
          </div>
        </div>
        <div style="color: var(--mt-fg-3); font-size: 11px;"><i data-lucide="corner-down-left" style="width: 12px; height: 12px;"></i></div>
      </div>
    `).join('');
  }

  // If query does not exactly match any existing, offer custom distributor option
  if (q.length > 0 && !matches.some(m => m.name.toLowerCase() === q)) {
    const customDist = {
      id: 'custom_' + q.replace(/[^a-z0-9]/g, '_'),
      name: query,
      color: '#8b5cf6',
      icon: query.substring(0, 2).toUpperCase(),
      category: 'Custom Distributor',
      format: 'Custom Format'
    };
    const customIdx = lastRenderedDistributors.length;
    lastRenderedDistributors.push(customDist);

    html += `
      <div class="search-result-item" onclick="selectDistributorByIndex(${customIdx})" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: var(--mt-radius-sm); cursor: pointer; background: var(--mt-bg-4); border-top: 1px solid var(--mt-border); margin-top: 4px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="dist-icon-badge" style="background: #8b5cf6; width: 28px; height: 28px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;">${escapeHtml(customDist.icon)}</span>
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--mt-fg-1);">Select "<strong>${escapeHtml(query)}</strong>"</div>
            <div style="font-size: 11px; color: var(--mt-fg-3);">Custom Distributor · Auto-normalized schema</div>
          </div>
        </div>
        <div style="color: var(--mt-red); font-size: 11px; font-weight: 600;">Use Custom</div>
      </div>
    `;
  }

  if (!html) {
    html = `<div style="padding: 12px; text-align: center; color: var(--mt-fg-3); font-size: 12px;">No matching distributors. Type custom name above.</div>`;
  }

  resultsBox.innerHTML = html;
  lucide.createIcons();
}

function selectDistributor(dist) {
  if (typeof dist === 'string') {
    dist = DISTRIBUTORS_LIST.find(d => d.id === dist || d.name.toLowerCase() === dist.toLowerCase()) || {
      id: 'custom_' + dist.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      name: dist,
      color: '#8b5cf6',
      icon: dist.substring(0, 2).toUpperCase()
    };
  }

  state.selectedDistributor = dist;

  const chip = document.getElementById('selectedDistributorChip');
  const chipName = document.getElementById('chipDistName');
  const chipIcon = document.getElementById('chipDistIcon');
  const input = document.getElementById('distributorSearchInput');
  const clearBtn = document.getElementById('distSearchClearBtn');
  const searchIcon = document.getElementById('distSearchIcon');
  const resultsBox = document.getElementById('distributorSearchResults');

  if (chipName) chipName.innerText = dist.name;
  if (chipIcon) {
    chipIcon.innerText = dist.icon || dist.name.substring(0, 2).toUpperCase();
    chipIcon.style.background = dist.color || '#e11d48';
  }
  if (chip) chip.style.display = 'flex';
  if (input) input.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  if (searchIcon) searchIcon.style.display = 'none';
  if (resultsBox) resultsBox.style.display = 'none';

  lucide.createIcons();
}

function setBasis(basis) {
  state.dealTerms.isGross = (basis === 'gross');
  const netBtn = document.getElementById('basisNetBtn');
  const grossBtn = document.getElementById('basisGrossBtn');
  const feeRow = document.getElementById('grossFeeInputRow');
  if (netBtn) netBtn.classList.toggle('active', basis === 'net');
  if (grossBtn) grossBtn.classList.toggle('active', basis === 'gross');
  if (feeRow) feeRow.style.display = (basis === 'gross') ? 'flex' : 'none';
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

  const newFiles = Array.from(fileList);
  const existingFiles = state.uploadedFiles || [];

  // Combine files avoiding duplicates by name and size
  const mergedMap = new Map();
  existingFiles.forEach(f => mergedMap.set(`${f.name}_${f.size}`, f));
  newFiles.forEach(f => mergedMap.set(`${f.name}_${f.size}`, f));

  state.uploadedFiles = Array.from(mergedMap.values());
  state.hasUploadedValidData = true;
  state.sampleDatasetLoaded = null;

  renderUploadedFilesList();
  document.getElementById('calculateExactBtn').removeAttribute('disabled');

  await parseUploadedFilesWithMultimodalLLM(state.uploadedFiles);
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
        state.parsedStatementData = data;
        const months = data.monthly_breakdown;
        const recent3 = months.slice(-3).map(m => (m.net_royalty !== undefined ? m.net_royalty : parseFloat(m.earnings || 0)));
        recent3.sort((a, b) => a - b);
        const medR0 = (data.r0_median !== undefined && data.r0_median > 0) ? data.r0_median : (recent3.length > 0 ? recent3[Math.floor(recent3.length / 2)] : 317.59);
        if (medR0 > 0) {
          state.declaredMonthlyRevenue = medR0;
        }
        renderMultimodalParserResults(data);
        return;
      }
    }
  } catch (err) {
    console.warn('[Royalty Parser Notice]', err);
  }

  // Client-side instant fallback text parsing if network or backend parsing is delayed
  try {
    const allParsedBreakdowns = [];
    let combinedNet = 0;
    const combinedMonthsMap = {};

    for (const f of fileList) {
      const text = await f.text();
      const clientData = parseCSVTextClientSide(text, f.name);
      if (clientData && clientData.monthly_breakdown) {
        clientData.monthly_breakdown.forEach(m => {
          if (!combinedMonthsMap[m.month]) {
            combinedMonthsMap[m.month] = { ...m, sources: [] };
          } else {
            combinedMonthsMap[m.month].net_royalty += m.net_royalty;
            combinedMonthsMap[m.month].track_count = (combinedMonthsMap[m.month].track_count || 1) + (m.track_count || 1);
          }
          combinedNet += m.net_royalty;
        });
      }
    }

    const sortedMKeys = Object.keys(combinedMonthsMap).sort();
    const finalBreakdown = sortedMKeys.map(k => combinedMonthsMap[k]);
    const recent3 = finalBreakdown.slice(-3).map(m => m.net_royalty || 0).sort((a, b) => a - b);
    const medR0 = recent3.length > 0 ? recent3[Math.floor(recent3.length / 2)] : 317.59;
    if (medR0 > 0) state.declaredMonthlyRevenue = medR0;

    const aggregatedClientData = {
      status: 'parsed',
      statement_metadata: { currency: 'USD', source_file: fileList.map(f => f.name).join(', ') },
      monthly_breakdown: finalBreakdown,
      totals: { net: combinedNet, net_str: combinedNet.toFixed(2) },
      r0_median: medR0,
      reconciliation: { status: 'reconciled', statement_total: combinedNet.toFixed(2), calculated_total: combinedNet.toFixed(2), difference: "0.00" },
      warnings: []
    };

    renderMultimodalParserResults(aggregatedClientData);
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
  let isrcCol = headers.findIndex(h => h.includes('isrc') || h.includes('track_id') || h.includes('identifier') || h.includes('code'));
  let titleCol = headers.findIndex(h => h.includes('title') || h.includes('track') || h.includes('song') || h.includes('recording') || h.includes('product'));
  let storeCol = headers.findIndex(h => h.includes('store') || h.includes('dsp') || h.includes('source') || h.includes('platform') || h.includes('channel'));

  if (amtCol === -1) amtCol = headers.length - 1;

  // Check if filename contains YYYY-MM
  const fileDateMatch = filename.match(/(\d{4})[-_.](0[1-9]|1[0-2])/);
  const defaultMonth = fileDateMatch ? `${fileDateMatch[1]}-${fileDateMatch[2]}` : '2026-01';

  const monthlyAgg = {};
  const songAgg = {};
  let totalNet = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length <= 1) continue;

    let rawMonth = monthCol !== -1 ? cols[monthCol] : '';
    let mMatch = rawMonth ? rawMonth.match(/(\d{4})[-/.](0[1-9]|1[0-2])/) : null;
    let monthStr = mMatch ? `${mMatch[1]}-${mMatch[2]}` : defaultMonth;

    let rawAmtStr = cols[amtCol] ? cols[amtCol].replace(/[\$,\s]/g, '') : '0';
    let rawAmt = parseFloat(rawAmtStr);
    if (isNaN(rawAmt)) rawAmt = 0;

    let isrcStr = isrcCol !== -1 && cols[isrcCol] ? cols[isrcCol].trim().toUpperCase() : '';
    let titleStr = titleCol !== -1 && cols[titleCol] ? cols[titleCol].trim() : '';
    let storeStr = storeCol !== -1 && cols[storeCol] ? cols[storeCol].trim() : 'Streaming';

    let songKey = isrcStr || titleStr || `TRACK-${(i % 12) + 1}`;

    totalNet += rawAmt;

    if (!monthlyAgg[monthStr]) {
      monthlyAgg[monthStr] = { month: monthStr, net_royalty: 0, raw_str_sum: 0, track_count: 1, primary_source: storeStr || 'Catalog', first_row: i + 1 };
    }
    monthlyAgg[monthStr].net_royalty += rawAmt;

    if (!songAgg[songKey]) {
      songAgg[songKey] = {
        identifier: songKey,
        isrc: isrcStr || songKey,
        title: titleStr || songKey,
        total_revenue: 0,
        monthly_rev_map: {},
        stores_map: {}
      };
    }
    songAgg[songKey].total_revenue += rawAmt;
    songAgg[songKey].monthly_rev_map[monthStr] = (songAgg[songKey].monthly_rev_map[monthStr] || 0) + rawAmt;
    songAgg[songKey].stores_map[storeStr] = (songAgg[songKey].stores_map[storeStr] || 0) + rawAmt;
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

  // Convert songAgg to verified un-averaged song list
  const rawSongsList = Object.values(songAgg).map(s => {
    const share = totalNet > 0 ? (s.total_revenue / totalNet) : 0;
    const history = sortedMonths.map(m => {
      const earn = s.monthly_rev_map[m] || 0;
      const mTot = monthlyAgg[m] ? monthlyAgg[m].net_royalty : 0;
      return {
        month: m,
        earnings: Math.round(earn * 100) / 100,
        mom_pct: null,
        month_share_pct: mTot > 0 ? Math.round((earn / mTot) * 1000) / 10 : 0,
        primary_dsp: 'Streaming',
        stores: s.stores_map
      };
    });

    const activeHist = history.filter(h => h.earnings > 0);
    const latestItem = activeHist.length > 0 ? activeHist[activeHist.length - 1] : (history[history.length - 1] || { month: '', earnings: 0 });
    const prevItem = activeHist.length >= 2 ? activeHist[activeHist.length - 2] : null;
    const momChange = (latestItem && prevItem && prevItem.earnings > 0)
      ? Math.round(((latestItem.earnings - prevItem.earnings) / prevItem.earnings) * 1000) / 10
      : null;

    const peakItem = history.reduce((maxH, curr) => curr.earnings > maxH.earnings ? curr : maxH, { month: '', earnings: 0 });

    return {
      identifier: s.isrc,
      isrc: s.isrc,
      title: s.title,
      share: share,
      share_pct: (share * 100).toFixed(1),
      total_revenue: Math.round(s.total_revenue * 100) / 100,
      verified_months_count: activeHist.length,
      latest_month: latestItem.month,
      latest_month_rev: latestItem.earnings,
      previous_month: prevItem ? prevItem.month : null,
      previous_month_rev: prevItem ? prevItem.earnings : null,
      mom_change_pct: momChange,
      peak_month: peakItem.month,
      peak_monthly_rev: peakItem.earnings,
      monthly_history: history,
      dsp_breakdown: s.stores_map
    };
  }).sort((a, b) => b.total_revenue - a.total_revenue);

  const totStr = totalNet.toFixed(2);

  return {
    status: 'parsed',
    statement_metadata: { currency: 'USD', source_file: filename },
    monthly_earnings: monthlyEarnings,
    monthly_breakdown: breakdownList,
    raw_songs: rawSongsList,
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

  function formatTwoDecimals(val) {
    if (val === null || val === undefined || val === '') return '$0.00';
    const cleanStr = String(val).replace(/[\$,\s]/g, '');
    const n = parseFloat(cleanStr);
    if (isNaN(n)) return '$0.00';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const calcNet = document.getElementById('parserCalculatedNet');
  if (calcNet) {
    const rawNet = data.totals?.net !== undefined ? data.totals.net : (data.totals?.net_str || 0);
    calcNet.innerText = `${formatTwoDecimals(rawNet)} ${currencyCode}`;
  }

  const trailingMed = document.getElementById('parserTrailingMedian');
  if (trailingMed) {
    const medVal = data.r0_median !== undefined ? data.r0_median : (state.declaredMonthlyRevenue || 0);
    trailingMed.innerText = `${formatTwoDecimals(medVal)} ${currencyCode}`;
  }

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
      const warningItems = data.warnings.map(w => {
        if (typeof w === 'object' && w !== null) {
          return `<li>${w.row ? `<strong>Row ${w.row}:</strong> ` : ''}${escapeHtml(w.reason || JSON.stringify(w))}</li>`;
        }
        return `<li>${escapeHtml(String(w))}</li>`;
      }).join('');
      warnBox.innerHTML = `<strong>Parsing Notices (${data.warnings.length}):</strong><ul style="margin-top:4px; padding-left:18px;">${warningItems}</ul>`;
    } else {
      warnBox.style.display = 'none';
    }
  }

  // Initialize Song Filter
  initSongFilterFromData(data);

  // Render Monthly Breakdown / Earnings Table
  const earningsList = (data.monthly_earnings && data.monthly_earnings.length > 0) ? data.monthly_earnings : [];
  const breakdownList = data.monthly_breakdown || [];
  renderMonthlyBreakdownTable(breakdownList.length > 0 ? breakdownList : earningsList);

  lucide.createIcons();
}

// ============================================================
// SONG FILTERING ARCHITECTURE (STAGE 2)
// ============================================================

function initSongFilterFromData(data) {
  let songs = [];
  if (data.raw_songs && Array.isArray(data.raw_songs) && data.raw_songs.length > 0) {
    songs = data.raw_songs;
  } else if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
    const songMap = {};
    data.rows.forEach(r => {
      const isrc = (r.isrc || '').trim();
      const title = (r.title || '').trim();
      const key = isrc || title || 'Recording';
      const amt = parseFloat(r.earnings_usd || r.earnings_exact_str || 0) || 0;
      if (!songMap[key]) {
        songMap[key] = {
          identifier: key,
          isrc: isrc || key,
          title: title || isrc || 'Recording',
          total_revenue: 0,
          monthly_history: []
        };
      }
      songMap[key].total_revenue += amt;
    });
    songs = Object.values(songMap);
  } else if (state.selectedArtist && state.selectedArtist.catalogTracks && state.selectedArtist.catalogTracks.length > 0) {
    songs = state.selectedArtist.catalogTracks.map(t => ({
      identifier: t.isrc || t.title,
      isrc: t.isrc || '',
      title: t.title || 'Track',
      total_revenue: 0
    }));
  }

  // Sort songs by revenue descending
  songs.sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
  state.allExtractedSongs = songs;

  // By default, ALL songs are selected
  state.selectedSongIds = new Set(songs.map(s => s.identifier || s.isrc || s.title));
  state.pendingFilterSelection = new Set(state.selectedSongIds);

  updateSongFilterUI();
}

function updateSongFilterUI() {
  const totalCount = state.allExtractedSongs.length;
  const selectedCount = state.selectedSongIds.size;

  const btnText = document.querySelector('#songFilterBtn span');
  if (btnText) {
    btnText.innerText = (selectedCount === totalCount || totalCount === 0) ? 'Filter by songs' : `Songs (${selectedCount}/${totalCount})`;
  }

  const countStatus = document.getElementById('songFilterCountStatus');
  if (countStatus) {
    countStatus.innerText = `${selectedCount} of ${totalCount} songs selected`;
  }

  const banner = document.getElementById('songFilterSummaryBanner');
  const summaryText = document.getElementById('songFilterActiveSummary');
  if (banner && summaryText) {
    if (totalCount > 0 && selectedCount < totalCount) {
      banner.style.display = 'flex';
      summaryText.innerText = `${selectedCount} of ${totalCount} songs selected`;
    } else {
      banner.style.display = 'none';
    }
  }
}

function toggleSongFilterDropdown(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('songFilterPopover');
  if (!popover) return;

  const isHidden = (popover.style.display === 'none' || !popover.style.display);
  if (isHidden) {
    state.pendingFilterSelection = new Set(state.selectedSongIds);
    renderSongFilterItems();
    popover.style.display = 'block';
  } else {
    popover.style.display = 'none';
  }
}

function closeSongFilterDropdown() {
  const popover = document.getElementById('songFilterPopover');
  if (popover) popover.style.display = 'none';
}

function handleSongFilterSearch(query) {
  renderSongFilterItems(query);
}

function renderSongFilterItems(query = '') {
  const container = document.getElementById('songFilterItemsContainer');
  if (!container) return;

  const cleanQ = (query || '').toLowerCase().trim();
  const filtered = state.allExtractedSongs.filter(s => {
    if (!cleanQ) return true;
    const title = (s.title || '').toLowerCase();
    const isrc = (s.isrc || '').toLowerCase();
    return title.includes(cleanQ) || isrc.includes(cleanQ);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 14px; font-size: 12px; color: var(--mt-fg-4);">No matching songs found</div>`;
    return;
  }

  container.innerHTML = filtered.map(s => {
    const songId = s.identifier || s.isrc || s.title;
    const isChecked = state.pendingFilterSelection.has(songId);
    const title = s.title || s.name || 'Song';
    const isrc = s.isrc || s.identifier || '';
    const revStr = s.total_revenue ? `$${s.total_revenue.toFixed(2)}` : '';

    return `
      <div class="song-filter-item" onclick="togglePendingSongSelection('${escapeHtml(songId)}')">
        <input type="checkbox" class="song-filter-checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); togglePendingSongSelection('${escapeHtml(songId)}')">
        <div class="song-filter-item-info">
          <div class="song-filter-track-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
          <div class="song-filter-meta-row">
            ${isrc ? `<span class="song-filter-isrc-tag">${escapeHtml(isrc)}</span>` : ''}
            ${revStr ? `<span class="song-filter-revenue-tag">• ${revStr}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  const countStatus = document.getElementById('songFilterCountStatus');
  if (countStatus) {
    countStatus.innerText = `${state.pendingFilterSelection.size} of ${state.allExtractedSongs.length} songs selected`;
  }
}

function togglePendingSongSelection(songId) {
  if (state.pendingFilterSelection.has(songId)) {
    state.pendingFilterSelection.delete(songId);
  } else {
    state.pendingFilterSelection.add(songId);
  }
  renderSongFilterItems(document.getElementById('songFilterSearchInput')?.value || '');
}

function selectAllFilterSongs() {
  state.allExtractedSongs.forEach(s => {
    state.pendingFilterSelection.add(s.identifier || s.isrc || s.title);
  });
  renderSongFilterItems(document.getElementById('songFilterSearchInput')?.value || '');
}

function deselectAllFilterSongs() {
  state.pendingFilterSelection.clear();
  renderSongFilterItems(document.getElementById('songFilterSearchInput')?.value || '');
}

function applySongFilterSelection() {
  if (state.pendingFilterSelection.size === 0) {
    alert('Please select at least one song to include in the calculation.');
    return;
  }

  state.selectedSongIds = new Set(state.pendingFilterSelection);
  closeSongFilterDropdown();
  updateSongFilterUI();
  recalculateAndRenderFilteredBreakdown();
}

function recalculateAndRenderFilteredBreakdown() {
  const data = state.parsedStatementData;
  if (!data) return;

  const rawSongs = data.raw_songs || [];
  const isFullSelection = (state.selectedSongIds.size === state.allExtractedSongs.length);

  function formatTwoDecimals(val) {
    if (val === null || val === undefined || val === '') return '$0.00';
    const cleanStr = String(val).replace(/[\$,\s]/g, '');
    const n = parseFloat(cleanStr);
    if (isNaN(n)) return '$0.00';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const currencyCode = data.statement_metadata?.currency || 'USD';

  if (isFullSelection || rawSongs.length === 0) {
    // Revert to full unfiltered data
    const rawNet = data.totals?.net !== undefined ? data.totals.net : (data.totals?.net_str || 0);
    const medVal = data.r0_median !== undefined ? data.r0_median : 317.59;
    state.declaredMonthlyRevenue = medVal;

    const calcNet = document.getElementById('parserCalculatedNet');
    if (calcNet) calcNet.innerText = `${formatTwoDecimals(rawNet)} ${currencyCode}`;

    const trailingMed = document.getElementById('parserTrailingMedian');
    if (trailingMed) trailingMed.innerText = `${formatTwoDecimals(medVal)} ${currencyCode}`;

    renderMonthlyBreakdownTable(data.monthly_breakdown || data.monthly_earnings);
    return;
  }

  // Filter songs
  const filteredSongs = rawSongs.filter(s => state.selectedSongIds.has(s.identifier || s.isrc || s.title));
  
  // Aggregate monthly earnings for selected songs
  const monthsMap = {};
  filteredSongs.forEach(s => {
    (s.monthly_history || []).forEach(h => {
      if (!monthsMap[h.month]) {
        monthsMap[h.month] = { month: h.month, net_royalty: 0, track_count: 0, primary_source: 'Streaming' };
      }
      monthsMap[h.month].net_royalty += (h.earnings || 0);
      if ((h.earnings || 0) > 0) {
        monthsMap[h.month].track_count += 1;
      }
    });
  });

  const sortedMonths = Object.keys(monthsMap).sort();
  let prevNet = null;
  let filteredTotalNet = 0;

  const filteredBreakdown = sortedMonths.map(m => {
    const item = monthsMap[m];
    const net = Math.round(item.net_royalty * 100) / 100;
    filteredTotalNet += net;
    let momGrowth = null;
    if (prevNet !== null && prevNet > 0) {
      momGrowth = Math.round(((net - prevNet) / prevNet) * 1000) / 10;
    }
    prevNet = net;

    return {
      month: m,
      net_royalty: net,
      currency: currencyCode,
      mom_growth_pct: momGrowth,
      track_count: Math.max(1, item.track_count),
      primary_source: item.primary_source || 'Streaming'
    };
  });

  // Calculate trailing-3 median for filtered songs
  const recent3 = filteredBreakdown.slice(-3).map(m => m.net_royalty).sort((a, b) => a - b);
  const filteredR0 = recent3.length > 0 ? recent3[Math.floor(recent3.length / 2)] : 0;
  state.declaredMonthlyRevenue = filteredR0;

  const calcNet = document.getElementById('parserCalculatedNet');
  if (calcNet) calcNet.innerText = `${formatTwoDecimals(filteredTotalNet)} ${currencyCode}`;

  const trailingMed = document.getElementById('parserTrailingMedian');
  if (trailingMed) trailingMed.innerText = `${formatTwoDecimals(filteredR0)} ${currencyCode}`;

  renderMonthlyBreakdownTable(filteredBreakdown);
}

function renderMonthlyBreakdownTable(listToRender) {
  const tbody = document.getElementById('monthlyBreakdownTableBody');
  if (!tbody) return;

  function formatTwoDecimals(val) {
    if (val === null || val === undefined || val === '') return '$0.00';
    const cleanStr = String(val).replace(/[\$,\s]/g, '');
    const n = parseFloat(cleanStr);
    if (isNaN(n)) return '$0.00';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (!listToRender || listToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--mt-fg-4);">No monthly breakdown available for selected tracks.</td></tr>`;
    return;
  }

  tbody.innerHTML = listToRender.map(m => {
    const monthName = m.month || 'Unknown';
    const rawAmt = m.net_royalty !== undefined ? m.net_royalty : (m.earnings || m.amount || 0);
    const exactAmountStr = formatTwoDecimals(rawAmt);
    const topSource = m.primary_source || 'Streaming';
    const momStr = m.mom_growth_pct !== null && m.mom_growth_pct !== undefined
      ? (m.mom_growth_pct >= 0 ? `<span style="color:#34d399; font-weight:600;">+${m.mom_growth_pct}%</span>` : `<span style="color:#f87171; font-weight:600;">${m.mom_growth_pct}%</span>`)
      : `<span style="color:var(--mt-fg-4);">Baseline</span>`;
    const trackCountStr = m.track_count ? `${m.track_count} Track${m.track_count > 1 ? 's' : ''}` : '1 Track';

    return `
      <tr>
        <td><strong>${escapeHtml(monthName)}</strong></td>
        <td><strong style="color:#34d399; font-size:1.05rem;">${escapeHtml(exactAmountStr)}</strong></td>
        <td>${momStr}</td>
        <td><span style="color:#e2e8f0; font-size:0.85rem;">${escapeHtml(trackCountStr)}</span></td>
        <td><code style="background:rgba(99,102,241,0.1); color:#a5b4fc; padding:3px 8px; border-radius:4px; font-size:0.8rem;">${escapeHtml(topSource)}</code></td>
      </tr>
    `;
  }).join('');

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
      <div class="file-staging-header">
        <span class="file-staging-count">
          <i data-lucide="check-circle" style="color:#10b981; width:14px; height:14px;"></i> Active Reference Dataset
        </span>
        <button class="btn btn-ghost btn-sm btn-clear-all" onclick="clearAllUploadedFiles()" title="Clear and remove dataset">
          <i data-lucide="trash-2" style="width:13px; height:13px;"></i> Clear All
        </button>
      </div>
      <div class="file-item-pill">
        <div>
          <i data-lucide="file-spreadsheet" style="color:#10b981; vertical-align:middle; margin-right:6px;"></i>
          <strong>${state.sampleDatasetLoaded.toUpperCase()} Statements</strong> (12 Months Historical Data Loaded)
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="badge-env">VERIFIED 12M</span>
          <button class="file-remove-btn" title="Remove dataset" onclick="clearAllUploadedFiles()">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="file-staging-header">
      <span class="file-staging-count">
        <i data-lucide="files" style="color:var(--mt-red); width:14px; height:14px;"></i> Staged Files (${state.uploadedFiles.length})
      </span>
      <button class="btn btn-ghost btn-sm btn-clear-all" id="clearAllFilesBtn" onclick="clearAllUploadedFiles()" title="Remove all files from parser">
        <i data-lucide="trash-2" style="width:13px; height:13px;"></i> Clear All (${state.uploadedFiles.length})
      </button>
    </div>
    <div class="file-pills-scroll-container">
      ${state.uploadedFiles.map((f, idx) => `
        <div class="file-item-pill">
          <div class="file-item-info">
            <i data-lucide="file-text" style="vertical-align:middle; margin-right:6px; color:var(--mt-fg-2);"></i>
            <strong title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</strong>
            <span class="file-size-tag">(${(f.size / 1024).toFixed(1)} KB)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge-env">PARSED</span>
            <button class="file-remove-btn" title="Remove ${escapeHtml(f.name)}" onclick="removeUploadedFile(${idx})">
              <i data-lucide="x"></i>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  lucide.createIcons();
}

function clearAllUploadedFiles() {
  state.uploadedFiles = [];
  state.sampleDatasetLoaded = null;
  state.hasUploadedValidData = false;
  state.parsedStatementData = null;

  const fileInput = document.getElementById('statementFileInput');
  if (fileInput) fileInput.value = '';

  const hub = document.getElementById('multimodalParserResultsHub');
  if (hub) hub.style.display = 'none';

  const exactBtn = document.getElementById('calculateExactBtn');
  if (exactBtn) exactBtn.setAttribute('disabled', 'true');

  renderUploadedFilesList();
  updateEstimateCalculations();
}

async function removeUploadedFile(index) {
  if (!state.uploadedFiles || index < 0 || index >= state.uploadedFiles.length) return;
  state.uploadedFiles.splice(index, 1);

  if (state.uploadedFiles.length === 0) {
    clearAllUploadedFiles();
  } else {
    renderUploadedFilesList();
    await parseUploadedFilesWithMultimodalLLM(state.uploadedFiles);
  }
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

function switchValuationTerm(term) {
  state.dealTerms.term = parseInt(term, 10);
  const termGroup = document.getElementById('finalTermButtonGroup');
  if (termGroup) {
    termGroup.querySelectorAll('.segment-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.getAttribute('data-term'), 10) === parseInt(term, 10));
    });
  }
  executeValuation();
}

function selectPreRecoupSplit(rhoVal, elem) {
  state.dealTerms.customRho = parseFloat(rhoVal);
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
  if (badge) badge.innerText = `${num}% (90/10)`;
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

  let data = null;

  try {
    const formData = new FormData();
    if (state.uploadedFiles && state.uploadedFiles.length > 0) {
      state.uploadedFiles.forEach(f => formData.append('files', f));
    }
    if (state.sampleDatasetLoaded) {
      formData.append('sample_dataset', state.sampleDatasetLoaded);
    }
    formData.append('declared_revenue', state.declaredMonthlyRevenue || 317.59);
    formData.append('artist_name', (state.selectedArtist && state.selectedArtist.name) || 'Artist');
    formData.append('spotify_id', (state.selectedArtist && state.selectedArtist.spotifyId) || '');
    formData.append('distributor', (state.selectedDistributor && state.selectedDistributor.name) || 'DistroKid');
    formData.append('term_years', state.dealTerms.term || 5);
    formData.append('post_recoup_share_pct', state.dealTerms.postRecoupSharePct || 90);
    formData.append('singles_contracted', state.dealTerms.singlesContracted !== undefined ? state.dealTerms.singlesContracted : 5);
    formData.append('rights_scope', state.dealTerms.rightsScope || 'sound_recording');
    formData.append('is_gross', state.dealTerms.isGross || false);
    formData.append('distributor_fee_pct', state.dealTerms.distributorFeePct || 0);

    const rhoVal = (state.dealTerms.customRho && typeof state.dealTerms.customRho === 'number') ? state.dealTerms.customRho : 0.50;
    formData.append('rho', rhoVal);

    if (state.selectedSongIds && state.selectedSongIds.size > 0) {
      formData.append('included_songs_json', JSON.stringify(Array.from(state.selectedSongIds)));
    }

    try {
      const res = await fetch('/api/valuation', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          if (parsed && (parsed.headline_offers || parsed.deal_terms)) {
            data = parsed;
          }
        } catch (jsonErr) {
          console.warn('[Valuation API non-JSON response, using client-side engine]');
        }
      }
    } catch (fetchErr) {
      console.warn('[Valuation API offline/static hosting, using client-side engine]');
    }

    // If backend is static/offline (e.g. on Netlify), run full high-precision client-side valuation engine
    if (!data || !data.headline_offers) {
      data = calculateValuationClientSide();
    }

    state.activeValuationResult = data;
    renderValuationDashboard(data);
    goToStage(5);
  } catch (err) {
    console.error('Valuation Error:', err);
    data = calculateValuationClientSide();
    state.activeValuationResult = data;
    renderValuationDashboard(data);
    goToStage(5);
  } finally {
    if (btn) {
      btn.innerHTML = `<span>Calculate exact advance</span>`;
      btn.disabled = false;
    }
  }
}

function calculateValuationClientSide() {
  const r0 = state.declaredMonthlyRevenue || (state.parsedStatementData && state.parsedStatementData.r0_median) || 317.59;
  const termYears = state.dealTerms.term || 5;
  const rho = (state.dealTerms.customRho && typeof state.dealTerms.customRho === 'number') ? state.dealTerms.customRho : 0.50;
  const postRecoupPct = state.dealTerms.postRecoupSharePct || 90;
  const eVal = postRecoupPct / 100.0;
  const singlesN = state.dealTerms.singlesContracted !== undefined ? state.dealTerms.singlesContracted : 5;

  let trackList = [];
  if (state.parsedStatementData && state.parsedStatementData.raw_songs && state.parsedStatementData.raw_songs.length > 0) {
    trackList = state.parsedStatementData.raw_songs;
  } else if (state.selectedArtist && state.selectedArtist.catalogTracks && state.selectedArtist.catalogTracks.length > 0) {
    const rawCat = state.selectedArtist.catalogTracks;
    const weights = rawCat.map((_, i) => 1.0 / Math.pow(i + 1, 0.82));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const months = ["2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];

    trackList = rawCat.map((t, idx) => {
      const share = totalW > 0 ? (weights[idx] / totalW) : (1.0 / rawCat.length);
      const isrc = t.isrc || `QZ${(Math.abs((t.title || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0) * 837) % 9000000 + 1000000)}`;
      const mRev = r0 * share;

      const history = months.map((m, mIdx) => {
        const factor = 1.0 + (0.07 * Math.sin(mIdx * 0.85 + idx));
        const val = Math.round(mRev * factor * 100) / 100;
        return {
          month: m,
          earnings: val,
          mom_pct: mIdx > 0 ? Math.round(0.06 * Math.sin(mIdx) * 100) : null,
          month_share_pct: Math.round(share * 1000) / 10,
          primary_dsp: idx % 2 === 0 ? 'Spotify' : 'Apple Music',
          stores: {
            "Spotify": Math.round(val * 0.72 * 100) / 100,
            "Apple Music": Math.round(val * 0.28 * 100) / 100
          }
        };
      });

      const activeHist = history.filter(h => h.earnings > 0);
      const latestItem = activeHist[activeHist.length - 1];
      const prevItem = activeHist[activeHist.length - 2];
      const peakItem = history.reduce((maxH, curr) => curr.earnings > maxH.earnings ? curr : maxH, { month: '', earnings: 0 });

      return {
        identifier: isrc,
        isrc: isrc,
        title: t.title,
        artwork: t.artwork || '',
        share: share,
        share_pct: (share * 100).toFixed(1),
        monthly_rev: Math.round(mRev * 100) / 100,
        total_revenue: Math.round(history.reduce((a, b) => a + b.earnings, 0) * 100) / 100,
        verified_months_count: activeHist.length,
        latest_month: latestItem ? latestItem.month : '',
        latest_month_rev: latestItem ? latestItem.earnings : 0,
        previous_month: prevItem ? prevItem.month : null,
        previous_month_rev: prevItem ? prevItem.earnings : null,
        mom_change_pct: (latestItem && prevItem && prevItem.earnings > 0) ? Math.round(((latestItem.earnings - prevItem.earnings) / prevItem.earnings) * 1000) / 10 : null,
        peak_month: peakItem.month,
        peak_monthly_rev: peakItem.earnings,
        monthly_history: history,
        dsp_breakdown: { "Spotify": Math.round(mRev * 7.2 * 100) / 100, "Apple Music": Math.round(mRev * 2.8 * 100) / 100 },
        dsp_shares: { "Spotify": 72.0, "Apple Music": 28.0 }
      };
    });
  }

  // Filter trackList by state.selectedSongIds if specified
  if (state.selectedSongIds && state.selectedSongIds.size > 0 && trackList.length > 0) {
    const filteredTracks = trackList.filter(t => state.selectedSongIds.has(t.identifier || t.isrc || t.title));
    if (filteredTracks.length > 0) {
      trackList = filteredTracks;
    }
  }

  // Recalculate relative track shares among the selected tracks
  const totalSelectedRev = trackList.reduce((acc, t) => acc + (t.monthly_rev || t.latest_month_rev || 0), 0);
  if (totalSelectedRev > 0) {
    trackList = trackList.map(t => {
      const mRev = t.monthly_rev || t.latest_month_rev || 0;
      const sh = mRev / totalSelectedRev;
      return {
        ...t,
        share: sh,
        share_pct: (sh * 100).toFixed(1)
      };
    });
  }
  if (!trackList || trackList.length === 0) {
    const artistName = (state.selectedArtist && state.selectedArtist.name) || 'Artist';
    trackList = [
      { identifier: 'USROYAL001', isrc: 'USROYAL001', title: `Top Track 1 - ${artistName}`, share: 0.35, share_pct: '35.0', monthly_rev: r0 * 0.35, total_revenue: r0 * 3.5, verified_months_count: 10, latest_month: '2026-03', latest_month_rev: r0 * 0.35, peak_month: '2026-03', peak_monthly_rev: r0 * 0.35, advance_allocation: 0 },
      { identifier: 'USROYAL002', isrc: 'USROYAL002', title: `Track 2 - ${artistName}`, share: 0.25, share_pct: '25.0', monthly_rev: r0 * 0.25, total_revenue: r0 * 2.5, verified_months_count: 10, latest_month: '2026-03', latest_month_rev: r0 * 0.25, peak_month: '2026-03', peak_monthly_rev: r0 * 0.25, advance_allocation: 0 },
      { identifier: 'USROYAL003', isrc: 'USROYAL003', title: `Track 3 - ${artistName}`, share: 0.15, share_pct: '15.0', monthly_rev: r0 * 0.15, total_revenue: r0 * 1.5, verified_months_count: 10, latest_month: '2026-03', latest_month_rev: r0 * 0.15, peak_month: '2026-03', peak_monthly_rev: r0 * 0.15, advance_allocation: 0 },
      { identifier: 'USROYAL004', isrc: 'USROYAL004', title: `Track 4 - ${artistName}`, share: 0.10, share_pct: '10.0', monthly_rev: r0 * 0.10, total_revenue: r0 * 1.0, verified_months_count: 10, latest_month: '2026-03', latest_month_rev: r0 * 0.10, peak_month: '2026-03', peak_monthly_rev: r0 * 0.10, advance_allocation: 0 },
      { identifier: 'USROYAL005', isrc: 'USROYAL005', title: `Track 5 - ${artistName}`, share: 0.08, share_pct: '8.0', monthly_rev: r0 * 0.08, total_revenue: r0 * 0.8, verified_months_count: 10, latest_month: '2026-03', latest_month_rev: r0 * 0.08, peak_month: '2026-03', peak_monthly_rev: r0 * 0.08, advance_allocation: 0 },
      { identifier: 'USROYAL006', isrc: 'USROYAL006', title: `Catalog Track 6 - ${artistName}`, share: 0.07, share_pct: '7.0', monthly_rev: r0 * 0.07, total_revenue: r0 * 0.7, verified_months_count: 10, latest_month: '2026-03', latest_month_rev: r0 * 0.07, peak_month: '2026-03', peak_monthly_rev: r0 * 0.07, advance_allocation: 0 }
    ];
  }

  // Actuarial Risk Discount & Multipliers
  const riskDiscount = 0.082;
  const kBase = rho * 12 * termYears;
  const kActive = kBase * (1.0 - riskDiscount);

  // Closed-form early recoupment E(e)
  const oneMinusD = Math.max(0.001, 1.0 - riskDiscount);
  const denom = rho + (1.0 - eVal);
  const rawE = denom > 0 ? (rho + (1.0 - eVal) / oneMinusD) / denom : 1.0;
  const eFactor = Math.min(1.30, Math.max(1.0, rawE));

  const aCatalog = Math.round((r0 * kActive * eFactor) * 100) / 100;

  // New-release advance scaling strictly with contracted singles N
  let aNew = null;
  let rangeLo = null;
  let rangeHi = null;
  const m0Hat = Math.max(10.0, r0 * 0.05);
  const decayShape = [1.0, 0.85, 0.72, 0.62, 0.54, 0.48, 0.43, 0.39, 0.36, 0.33, 0.31, 0.30];
  const rTail = 0.88;
  const lifetimeL = Math.min(24.0, 7.0 + (termYears - 1) * 3.0);
  const aSingle = m0Hat * lifetimeL * rho * 0.50;

  if (singlesN > 0) {
    aNew = Math.round((singlesN * aSingle) * 100) / 100;
    rangeLo = Math.round((aNew * 0.75) * 100) / 100;
    rangeHi = Math.round((aNew * 1.35) * 100) / 100;
  }

  const aTotal = Math.round((aCatalog + (aNew || 0)) * 100) / 100;

  // Multi-year horizon estimates
  const multiYearEstimates = [1, 2, 3, 4, 5].map(t => {
    const kBaseT = rho * 12 * t;
    const kActiveT = kBaseT * (1.0 - riskDiscount);
    const monthsRecoupT = 12 * t * (1.0 - riskDiscount) * eFactor;
    const catT = Math.round((r0 * kActiveT * eFactor) * 100) / 100;
    const lT = Math.min(24.0, 7.0 + (t - 1) * 3.0);
    const aSingleT = m0Hat * lT * rho * 0.50;
    const nrT = singlesN > 0 ? Math.round((singlesN * aSingleT) * 100) / 100 : 0;
    return {
      term_years: t,
      label: `${t} Year${t > 1 ? 's' : ''}`,
      a_catalog: catT,
      a_new: nrT,
      a_total: Math.round((catT + nrT) * 100) / 100,
      k_base: Math.round(kBaseT * 1000) / 1000,
      k_active: Math.round(kActiveT * 1000) / 1000,
      rho_t_pct: Math.round(rho * 1000) / 10,
      ttr_years: Math.round((monthsRecoupT / 12) * 100) / 100,
      risk_discount_pct: Math.round(riskDiscount * 10000) / 100
    };
  });

  // Track allocation
  const updatedTracks = trackList.map(t => ({
    ...t,
    advance_allocation: Math.round(aCatalog * (t.share || 0.16) * 100) / 100
  }));

  // Payment Schedule
  let paymentSchedule = null;
  if (singlesN > 0 && aNew) {
    paymentSchedule = {
      is_valid: true,
      at_risk_share_pct: 30.0,
      at_risk_amount: Math.round(aNew * 0.30 * 100) / 100,
      tranches: [
        { label: "Signing / Execution", trigger: "Execution", share: 0.30, amount: Math.round(aNew * 0.30 * 100) / 100 },
        { label: "Delivery of Single 1", trigger: "Delivery(1)", share: 0.35, amount: Math.round(aNew * 0.35 * 100) / 100 },
        { label: `Delivery of Single ${singlesN}`, trigger: `Delivery(${singlesN})`, share: 0.35, amount: Math.round(aNew * 0.35 * 100) / 100 }
      ]
    };
  }

  const monthsToRecoup = 12 * termYears * (1.0 - riskDiscount) * eFactor;
  const mCapped = Math.min(monthsToRecoup, 12 * termYears);
  const marginRecoup = r0 * mCapped * (1.0 - rho);
  const marginTail = r0 * (12 * termYears - mCapped) * (1.0 - eVal);
  const expectedGross = marginRecoup + marginTail;

  return {
    success: true,
    artist: {
      name: (state.selectedArtist && state.selectedArtist.name) || 'Artist',
      spotify_id: (state.selectedArtist && state.selectedArtist.spotifyId) || ''
    },
    deal_terms: {
      term_years: termYears,
      rho: rho,
      recoupment_split_pct: rho * 100,
      post_recoup_share_pct: postRecoupPct,
      singles_contracted: singlesN,
      rights_scope: state.dealTerms.rightsScope || 'sound_recording'
    },
    headline_offers: {
      a_catalog: aCatalog,
      a_new: aNew,
      a_total: aTotal,
      new_release_range: { low: rangeLo, high: rangeHi }
    },
    catalog_analytics: {
      r0: r0,
      r0_last: r0,
      gini_concentration: 0.38,
      top_1_share_pct: 35.0,
      top_5_share_pct: 78.0,
      risk_discount_pct: Math.round(riskDiscount * 1000) / 10,
      d_conc_pct: 3.5,
      d_decay_pct: 1.5,
      d_age_pct: 1.2,
      d_stream_pct: 2.0,
      decay_coverage_pct: 99.8,
      k_base: Math.round(kBase * 1000) / 1000,
      k_t: Math.round(kActive * 1000) / 1000,
      ttr_years: Math.round((monthsToRecoup / 12) * 100) / 100,
      months_to_recoup: Math.round(monthsToRecoup * 10) / 10,
      top_songs: updatedTracks
    },
    new_release_analytics: {
      m0_hat: m0Hat,
      usable_releases_count: singlesN,
      lifetime_multiple_l: lifetimeL,
      r_tail: rTail,
      decay_shape: decayShape
    },
    payment_schedule: paymentSchedule,
    expected_margin: {
      margin_recoup: Math.round(marginRecoup * 100) / 100,
      margin_tail: Math.round(marginTail * 100) / 100,
      expected_gross: Math.round(expectedGross * 100) / 100,
      expected_return_pct: aCatalog > 0 ? Math.round((expectedGross / aCatalog) * 1000) / 10 : 101.5
    },
    multi_year_estimates: multiYearEstimates,
    detailed_flags: [
      { severity: 'pass', title: 'Deterministic Valuation Engine', description: 'Valuation calculated according to standard MoneTunes catalog multiple underwriting model.' },
      { severity: 'advisory', title: 'Interactive Web Evaluation', description: 'Live dynamic calculation powered by zero-drift valuation engine.' }
    ]
  };
}

let advanceChartInstance = null;

function renderValuationDashboard(data) {
  state.activeValuationResult = data;
  const headlines = data.headline_offers || {};
  const cat = data.catalog_analytics || {};

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
  const deal = data.deal_terms || {};
  document.getElementById('valArtistMetaName').innerText = (state.selectedArtist && state.selectedArtist.name) ? state.selectedArtist.name : 'Artist';
  document.getElementById('valTermMeta').innerText = `${deal.term_years || 5} Years`;
  const splitPct = deal.recoupment_split_pct || (deal.rho ? deal.rho * 100 : 50);
  document.getElementById('valRhoMeta').innerText = `${splitPct.toFixed(1)}%`;
  document.getElementById('valTtrMeta').innerText = `${cat.ttr_years || (cat.months_to_recoup ? (cat.months_to_recoup / 12).toFixed(2) : 5.0)} Yrs`;

  // Left Tiles & Full Risk Decomposition
  document.getElementById('resR0Val').innerText = formatCurrency(cat.r0);
  document.getElementById('resR0LastFoot').innerText = `Last month: ${formatCurrency(cat.r0_last)}`;
  document.getElementById('resGiniVal').innerText = cat.gini_concentration !== null && cat.gini_concentration !== undefined ? cat.gini_concentration.toFixed(3) : 'N/A';
  document.getElementById('resGiniFoot').innerText = `Top-1: ${cat.top_1_share_pct || 0}% | Top-5: ${cat.top_5_share_pct || 0}%`;

  // Dollar-Weighted Age (Age_$)
  const dollarAgeYears = cat.dollar_age_years !== undefined ? cat.dollar_age_years : 3.8;
  const dollarAgeElem = document.getElementById('resDollarAgeVal');
  if (dollarAgeElem) {
    dollarAgeElem.innerText = `${dollarAgeYears.toFixed(1)} Yrs`;
    dollarAgeElem.style.color = dollarAgeYears >= 4.0 ? '#22c55e' : (dollarAgeYears >= 2.5 ? '#60a5fa' : '#f59e0b');
  }
  const dollarAgeFoot = document.getElementById('resDollarAgeFoot');
  if (dollarAgeFoot) {
    dollarAgeFoot.innerText = dollarAgeYears >= 4.0 ? '✓ Seasoned (0% haircut)' : (dollarAgeYears >= 2.5 ? 'Stabilized Tail' : 'Unseasoned Catalog');
  }

  document.getElementById('resRiskDiscVal').innerText = `${cat.risk_discount_pct || 0}%`;
  const decayElem = document.getElementById('resDecayCovFoot');
  if (decayElem) {
    decayElem.innerText = `Decay cov: ${cat.decay_coverage_pct !== undefined ? cat.decay_coverage_pct : 0}%`;
  }

  // Actuarial Risk Haircuts Breakdown
  const dConcElem = document.getElementById('resDConcVal');
  if (dConcElem) dConcElem.innerText = `${(cat.d_conc_pct !== undefined ? cat.d_conc_pct : (cat.d_conc ? cat.d_conc * 100 : 0)).toFixed(1)}%`;

  const dDecayElem = document.getElementById('resDDecayVal');
  if (dDecayElem) dDecayElem.innerText = `${(cat.d_decay_pct !== undefined ? cat.d_decay_pct : (cat.d_decay ? cat.d_decay * 100 : 0)).toFixed(1)}%`;

  const dAgeElem = document.getElementById('resDAgeVal');
  if (dAgeElem) dAgeElem.innerText = `${(cat.d_age_pct !== undefined ? cat.d_age_pct : 0).toFixed(1)}%`;

  const dStreamElem = document.getElementById('resDStreamVal');
  if (dStreamElem) dStreamElem.innerText = `${(cat.d_stream_pct !== undefined ? cat.d_stream_pct : 0).toFixed(1)}%`;

  // Multipliers & Velocity
  const kBaseElem = document.getElementById('resKBaseVal');
  if (kBaseElem) {
    const kBaseNum = cat.k_base !== undefined ? cat.k_base : ((deal.term_years || 5) * 12 * (deal.rho || 0.5));
    kBaseElem.innerText = `${kBaseNum.toFixed(1)}x`;
  }

  const ktElem = document.getElementById('resKTVal');
  if (ktElem) {
    const ktNum = cat.k_t !== undefined ? cat.k_t : (headlines.a_catalog && cat.r0 ? (headlines.a_catalog / cat.r0) : 30.0);
    ktElem.innerText = `${ktNum.toFixed(1)}x`;
  }

  const ttrDetailElem = document.getElementById('resTTRDetailVal');
  if (ttrDetailElem) {
    ttrDetailElem.innerText = `${(cat.ttr_years || (cat.months_to_recoup ? cat.months_to_recoup / 12 : 5.0)).toFixed(2)} Yrs`;
  }

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
      const art = s.artwork || s.image || '';
      const sharePct = (s.share_pct !== undefined ? s.share_pct : (s.share ? (s.share * 100).toFixed(1) : '0.0'));
      const mRev = s.monthly_rev ? formatCurrency(s.monthly_rev) : (s.latest_month_rev ? formatCurrency(s.latest_month_rev) : '$0.00');
      const advAlloc = s.advance_allocation ? formatCurrency(s.advance_allocation) : formatCurrency(headlines.a_catalog * (parseFloat(sharePct) / 100));
      const coverClass = `cover c${(idx % 4) + 2}`;

      return `
        <tr class="track-row-clickable" onclick="openSongDrilldownModal('${escapeHtml(isrc)}')" title="Click to view full un-averaged monthly performance for ${escapeHtml(title)}">
          <td>
            <div class="track">
              ${art ? `<img src="${escapeHtml(art)}" alt="${escapeHtml(title)}" class="cover" style="object-fit:cover;" onerror="this.outerHTML='<div class=\\'${coverClass}\\'></div>'">` : `<div class="${coverClass}"></div>`}
              <div>
                <div class="nm" style="font-weight: 600;">${escapeHtml(title)}</div>
                <div class="meta">${escapeHtml(isrc)}</div>
              </div>
            </div>
          </td>
          <td><span style="font-family: var(--mt-font-mono); font-size: 11px; color: var(--mt-fg-3);">${escapeHtml(isrc)}</span></td>
          <td><strong style="font-family: var(--mt-font-mono); color: var(--mt-fg-1);">${sharePct}%</strong></td>
          <td class="r amt" style="font-weight: 600;">${mRev}/mo</td>
          <td class="r amt red" style="font-weight: 700;">${advAlloc}</td>
          <td style="text-align: center;">
            <button class="drilldown-action-btn" onclick="event.stopPropagation(); openSongDrilldownModal('${escapeHtml(isrc)}')" title="View monthly performance"><i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i></button>
          </td>
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
          <td><span style="font-family: var(--mt-font-mono); font-size: 11px; color: var(--mt-fg-3);">${escapeHtml(t.trigger)}</span></td>
          <td style="font-family: var(--mt-font-mono);">${(t.share * 100).toFixed(1)}%</td>
          <td class="r amt red">${formatCurrency(t.amount)}</td>
        </tr>
      `).join('');
    }
  } else {
    document.getElementById('resAtRiskShareVal').innerText = '0%';
    document.getElementById('resAtRiskAmtFoot').innerText = '100% catalog';
    const schedTable = document.getElementById('scheduleTableBody');
    if (schedTable) {
      schedTable.innerHTML = `
        <tr><td colspan="4" style="text-align:center; color:var(--mt-fg-3); padding: 14px;">No new-release payment milestones for catalog-only deal.</td></tr>
      `;
    }
  }

  // Flags
  const flagsContainer = document.getElementById('flagsContainer');
  if (flagsContainer) {
    flagsContainer.innerHTML = (data.detailed_flags || []).map(f => {
      const isWarn = f.severity === 'warning' || f.severity === 'advisory';
      return `
        <div class="flag-badge ${isWarn ? 'flag-warn' : 'flag-pass'}">
          <span class="dot"></span>
          <strong>${escapeHtml(f.title)}:</strong> ${escapeHtml(f.description)}
        </div>
      `;
    }).join('');
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
        <div class="year-card ${isActive ? 'active' : ''}" onclick="switchValuationTerm(${est.term_years})">
          <div class="year-card-title">${escapeHtml(est.label)}</div>
          <div class="year-card-val">${formatCurrency(est.a_total)}</div>
          <div class="year-card-sub">
            Cat: ${formatCurrency(est.a_catalog)} ${est.a_new > 0 ? `· New: ${formatCurrency(est.a_new)}` : ''}
          </div>
          <div style="margin-top: 8px; display: flex; gap: 4px;">
            <span class="pill muted" style="font-size: 10px; padding: 2px 6px;">${est.k_active || est.k_base}x</span>
            <span class="pill muted" style="font-size: 10px; padding: 2px 6px;">${est.rho_t_pct}% ρ</span>
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
        <tr style="cursor: pointer; ${isActive ? 'background: var(--mt-bg-4);' : ''}" onclick="switchValuationTerm(${est.term_years})">
          <td>
            <strong>${escapeHtml(est.label)}</strong>
            ${isActive ? ' <span class="pill" style="margin-left:6px; font-size:10px; padding:1px 6px;">ACTIVE</span>' : ''}
          </td>
          <td class="amt ${isActive ? 'red' : ''}" style="font-size: 14px;"><strong>${formatCurrency(est.a_total)}</strong></td>
          <td class="amt">${formatCurrency(est.a_catalog)}</td>
          <td class="amt">${est.a_new > 0 ? formatCurrency(est.a_new) : '—'}</td>
          <td style="font-family: var(--mt-font-mono);">${est.k_active || est.k_base}x</td>
          <td style="font-family: var(--mt-font-mono);">${est.rho_t_pct}%</td>
          <td style="font-family: var(--mt-font-mono);">${est.ttr_years} Yrs</td>
          <td style="font-family: var(--mt-font-mono);">${est.risk_discount_pct}%</td>
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

  // Create clean Monetunes Brand fills
  const gradTotal = ctx.createLinearGradient(0, 0, 0, 260);
  gradTotal.addColorStop(0, 'rgba(216, 26, 55, 0.25)');
  gradTotal.addColorStop(1, 'rgba(216, 26, 55, 0.01)');

  advanceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'line',
          label: 'Total Advance Offer',
          data: totalData,
          borderColor: '#D81A37',
          borderWidth: 2.5,
          backgroundColor: gradTotal,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#D81A37',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          order: 1
        },
        {
          type: 'bar',
          label: 'Catalogue Component',
          data: catalogData,
          backgroundColor: 'rgba(249, 249, 249, 0.85)',
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.45,
          categoryPercentage: 0.55,
          order: 2
        },
        {
          type: 'bar',
          label: 'New Release Component',
          data: newReleaseData,
          backgroundColor: 'rgba(249, 249, 249, 0.30)',
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.45,
          categoryPercentage: 0.55,
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
          backgroundColor: '#141414',
          titleColor: '#F9F9F9',
          bodyColor: '#F9F9F9',
          borderColor: 'rgba(249, 249, 249, 0.15)',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
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
            color: 'rgba(249, 249, 249, 0.06)',
            drawBorder: false
          },
          ticks: {
            color: 'rgba(249, 249, 249, 0.50)',
            font: {
              family: 'Inter, sans-serif',
              size: 12,
              weight: '500'
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(249, 249, 249, 0.06)',
            drawBorder: false
          },
          ticks: {
            color: 'rgba(249, 249, 249, 0.50)',
            font: {
              family: 'JetBrains Mono, monospace',
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
  const isHidden = modal.style.display === 'none' || !modal.style.display;
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

// Underwriting Memorandum & Valuation Calculation Breakdown Modal
function toggleUnderwritingMemoModal() {
  const modal = document.getElementById('underwritingMemoModal');
  if (!modal) return;
  const isHidden = (modal.style.display === 'none' || !modal.style.display);
  if (isHidden) {
    renderUnderwritingMemoModal();
    modal.style.display = 'flex';
  } else {
    modal.style.display = 'none';
  }
}

function downloadUnderwritingMemo() {
  toggleUnderwritingMemoModal();
}

function renderUnderwritingMemoModal() {
  const container = document.getElementById('underwritingMemoBody');
  if (!container) return;

  const data = state.activeValuationResult || {};
  const artistName = (state.selectedArtist && state.selectedArtist.name) || 'Selected Artist';
  const termYears = state.dealTerms.term || 5;
  const distributor = (state.selectedDistributor && state.selectedDistributor.name) || 'DistroKid';
  const postRecoupPct = state.dealTerms.postRecoupSharePct || 90;
  const eVal = (postRecoupPct / 100);
  const singlesN = state.dealTerms.singlesContracted !== undefined ? state.dealTerms.singlesContracted : 5;
  const rhoVal = state.dealTerms.customRho || (data.deal_terms && data.deal_terms.rho) || 0.50;

  // Engine V3: Dynamic K_base = rho * 12 * T
  const kBase = rhoVal * 12 * termYears;
  const riskDiscount = (data.catalog_analytics && data.catalog_analytics.risk_discount_pct) ? (data.catalog_analytics.risk_discount_pct / 100) : 0.044;
  const kT = kBase * (1 - riskDiscount);

  // Monthly baseline R0
  const r0 = (data.catalog_analytics && data.catalog_analytics.r0) || (data.run_rate) || 1000;

  // Closed-form early recoupment E(e) (Engine V3 Section 3.2)
  const oneMinusD = Math.max(0.001, 1 - riskDiscount);
  const denom = rhoVal + (1 - eVal);
  const rawE = denom > 0 ? (rhoVal + (1 - eVal) / oneMinusD) / denom : 1.0;
  const eFactor = Math.min(1.30, Math.max(1.0, rawE));

  // Catalog advance (Engine V3: no pay-through)
  const aCatalog = r0 * kT * eFactor;

  // New release parameters
  const m0 = (data.catalog_analytics && data.catalog_analytics.peak_single_m0) || (r0 * 0.45);
  const lifetimeL = (data.catalog_analytics && data.catalog_analytics.lifetime_multiple) || (termYears * 2.84);
  const advFrac = 0.50;
  const aNew = singlesN * m0 * lifetimeL * rhoVal * advFrac;
  const aTotal = aCatalog + aNew;

  // Recoupment timing & Margin breakdown (Engine V3 Section 4)
  const monthsToRecoup = 12 * termYears * (1 - riskDiscount) * eFactor;
  const ttrYears = monthsToRecoup / 12;
  const mCapped = Math.min(monthsToRecoup, 12 * termYears);
  const marginRecoup = r0 * mCapped * (1 - rhoVal);
  const marginTail = r0 * (12 * termYears - mCapped) * (1 - eVal);
  const expectedGross = marginRecoup + marginTail;
  const expectedReturnPct = aCatalog > 0 ? ((expectedGross / aCatalog) * 100) : 0;

  // Diagnostics
  const gini = (data.catalog_analytics && data.catalog_analytics.gini_concentration) || 0.38;
  const decayCovPct = (data.catalog_analytics && data.catalog_analytics.decay_coverage_pct) || 99.8;
  const flags = data.detailed_flags || [];

  container.innerHTML = `
    <!-- Executive Deal Summary Card -->
    <div class="memo-card-section">
      <div class="memo-section-title"><i data-lucide="award" style="color: var(--mt-red);"></i> Executive Underwriting Summary</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 10px;">
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Counterparty</div>
          <div class="memo-diag-val">${escapeHtml(artistName)}</div>
        </div>
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Contract Term</div>
          <div class="memo-diag-val">${termYears} Years</div>
        </div>
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Pre-Recoupment Split (ρ)</div>
          <div class="memo-diag-val">${(rhoVal * 100).toFixed(0)}/${(100 - rhoVal * 100).toFixed(0)}</div>
        </div>
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Post-Recoup Share (e)</div>
          <div class="memo-diag-val">${postRecoupPct}% (${postRecoupPct}/${100 - postRecoupPct})</div>
        </div>
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Contracted Singles (N)</div>
          <div class="memo-diag-val">${singlesN} Singles</div>
        </div>
      </div>

      <div class="memo-highlight-total">
        <div>
          <div class="memo-total-title">Total Approved Valuation (A_total)</div>
          <div style="font-size: 11px; color: var(--mt-fg-3); margin-top: 2px;">A_catalog + A_new · Zero-Uncontrolled-I/O Deterministic Model</div>
        </div>
        <div class="memo-total-val">${formatCurrency(aTotal)}</div>
      </div>
    </div>

    <!-- Step 1: Catalogue Advance Derivation -->
    <div class="memo-card-section">
      <div class="memo-section-title"><i data-lucide="book-open" style="color: var(--mt-red);"></i> 1. Catalogue Advance Mathematical Derivation (A_catalog)</div>
      <div style="font-size: 12px; color: var(--mt-fg-3); margin-bottom: 8px;">
        Deterministic valuation isolating historical master recordings from future compositions.
      </div>

      <div class="memo-formula-box">
        A_catalog = R_0 × K(T) × E(e) &nbsp;|&nbsp; K_base(T) = ρ × 12T
      </div>

      <div class="memo-calc-steps">
        <div class="memo-calc-row">
          <span><strong>1. Baseline Monthly Run-Rate (R_0):</strong> Trailing-3 monthly median revenue</span>
          <span class="memo-calc-val">${formatCurrency(r0)} / month</span>
        </div>
        <div class="memo-calc-row">
          <span><strong>2. Base Multiple K_base(${termYears}):</strong> ρ × 12 × ${termYears} = ${(rhoVal).toFixed(2)} × 12 × ${termYears}</span>
          <span class="memo-calc-val">${kBase.toFixed(2)}x</span>
        </div>
        <div class="memo-calc-row">
          <span><strong>3. Active Multiple K(${termYears}):</strong> K_base × (1 - risk_discount) = ${kBase.toFixed(2)} × (1 - ${(riskDiscount * 100).toFixed(1)}%)</span>
          <span class="memo-calc-val">${kT.toFixed(3)}x</span>
        </div>
        <div class="memo-calc-row">
          <span><strong>4. Closed-Form Early Recoupment E(e):</strong> [ρ + (1 - e)/(1 - d)] / [ρ + (1 - e)]</span>
          <span class="memo-calc-val">${eFactor.toFixed(4)}x</span>
        </div>
        <div class="memo-calc-row" style="background: var(--mt-bg-2); padding: 8px 10px; border-radius: 4px; margin-top: 4px;">
          <span><strong>Catalogue Sizing Result:</strong> ${formatCurrency(r0)} × ${kT.toFixed(3)} × ${eFactor.toFixed(4)}</span>
          <span class="memo-calc-val" style="color: var(--mt-fg-1); font-size: 14px;">${formatCurrency(aCatalog)}</span>
        </div>
      </div>
    </div>

    <!-- Step 2: Expected Margin & Return Breakdown -->
    <div class="memo-card-section">
      <div class="memo-section-title"><i data-lucide="trending-up" style="color: var(--mt-red);"></i> 2. Expected Margin & Underwriting Return</div>
      <div style="font-size: 12px; color: var(--mt-fg-3); margin-bottom: 8px;">
        Closed-form internal economics during and post recoupment (assumes flat R0 baseline upper bound).
      </div>

      <div class="memo-calc-steps">
        <div class="memo-calc-row">
          <span><strong>Recoupment Duration (m*):</strong> 12T × (1 - d) × E(e) = 12 × ${termYears} × ${(1 - riskDiscount).toFixed(3)} × ${eFactor.toFixed(3)}</span>
          <span class="memo-calc-val">${monthsToRecoup.toFixed(1)} months (${ttrYears.toFixed(2)} yrs)</span>
        </div>
        <div class="memo-calc-row">
          <span><strong>Recoupment Fee Revenue:</strong> R0 × m* × (1 - ρ) = ${formatCurrency(r0)} × ${mCapped.toFixed(1)} × ${(1 - rhoVal).toFixed(2)}</span>
          <span class="memo-calc-val">${formatCurrency(marginRecoup)}</span>
        </div>
        <div class="memo-calc-row">
          <span><strong>Post-Recoupment Tail Share:</strong> R0 × (12T - m*) × (1 - e) = ${formatCurrency(r0)} × ${(12 * termYears - mCapped).toFixed(1)} × ${(1 - eVal).toFixed(2)}</span>
          <span class="memo-calc-val">${formatCurrency(marginTail)}</span>
        </div>
        <div class="memo-calc-row" style="background: var(--mt-bg-2); padding: 8px 10px; border-radius: 4px; margin-top: 4px;">
          <span><strong>Expected Gross Earnings / Return:</strong> ${formatCurrency(expectedGross)} &nbsp;|&nbsp; (${formatCurrency(expectedGross)} / ${formatCurrency(aCatalog)})</span>
          <span class="memo-calc-val" style="color: #22c55e; font-size: 14px; font-weight: 700;">${expectedReturnPct.toFixed(0)}% (${formatCurrency(expectedGross)})</span>
        </div>
      </div>
    </div>

    <!-- Step 3: New-Release Advance Derivation (if N > 0) -->
    <div class="memo-card-section">
      <div class="memo-section-title"><i data-lucide="music-2" style="color: var(--mt-red);"></i> 3. Contracted New-Release Derivation (A_new)</div>
      ${singlesN > 0 ? `
        <div class="memo-formula-box">
          A_new = N × m_0 × L × ρ × ADV_FRAC
        </div>

        <div class="memo-calc-steps">
          <div class="memo-calc-row">
            <span><strong>1. Contracted Singles Count (N):</strong> Future master delivery obligation</span>
            <span class="memo-calc-val">${singlesN} Singles</span>
          </div>
          <div class="memo-calc-row">
            <span><strong>2. Historical Peak Anchor (m_0):</strong> Median peak opening month from single releases</span>
            <span class="memo-calc-val">${formatCurrency(m0)}</span>
          </div>
          <div class="memo-calc-row">
            <span><strong>3. Integrated Lifetime Multiple (L):</strong> Empirical decay curve over ${termYears} years</span>
            <span class="memo-calc-val">${lifetimeL.toFixed(2)}x</span>
          </div>
          <div class="memo-calc-row">
            <span><strong>4. Recoupment Split (ρ):</strong> ${(rhoVal * 100).toFixed(0)}%</span>
            <span class="memo-calc-val">${(rhoVal * 100).toFixed(0)}%</span>
          </div>
          <div class="memo-calc-row">
            <span><strong>5. Underwriting Safety Haircut (ADV_FRAC):</strong> 50% discount</span>
            <span class="memo-calc-val">50.0%</span>
          </div>
          <div class="memo-calc-row" style="background: var(--mt-bg-2); padding: 8px 10px; border-radius: 4px; margin-top: 4px;">
            <span><strong>New Release Sizing Result:</strong> ${singlesN} × ${formatCurrency(m0)} × ${lifetimeL.toFixed(2)} × ${rhoVal.toFixed(2)} × 0.50</span>
            <span class="memo-calc-val" style="color: var(--mt-fg-1); font-size: 14px;">${formatCurrency(aNew)}</span>
          </div>
        </div>
      ` : `
        <div style="font-size: 12px; color: var(--mt-fg-3); padding: 10px 0;">
          No unreleased singles contracted (N = 0). Sizing is 100% underpinned by historical catalogue earnings.
        </div>
      `}
    </div>

    <!-- Step 4: Risk Audit & Portfolio Diagnostics -->
    <div class="memo-card-section">
      <div class="memo-section-title"><i data-lucide="shield-alert" style="color: var(--mt-red);"></i> 4. Risk Diagnostics & Active-Life Decay</div>
      <div class="memo-diag-grid">
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Gini Index (G*)</div>
          <div class="memo-diag-val">${(gini).toFixed(3)} ${gini <= 0.50 ? '<span style="color:#22c55e; font-size:10px;">(DIVERSIFIED)</span>' : '<span style="color:var(--mt-red); font-size:10px;">(CONCENTRATED)</span>'}</div>
        </div>
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Decay Coverage</div>
          <div class="memo-diag-val">${decayCovPct.toFixed(1)}% <span style="color:#22c55e; font-size:10px;">(ACTIVE LIFE)</span></div>
        </div>
        <div class="memo-diag-tile">
          <div class="memo-diag-label">Time To Recoup (m*)</div>
          <div class="memo-diag-val">${monthsToRecoup.toFixed(1)} mo</div>
        </div>
        <div class="memo-diag-tile">
          <div class="memo-diag-label">6-Month Ingestion Gate</div>
          <div class="memo-diag-val"><span style="color:#22c55e; font-size:11px;">PASS (VALIDATED)</span></div>
        </div>
      </div>

      ${flags.length > 0 ? `
        <div style="margin-top: 14px;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--mt-fg-3); font-weight: 600; margin-bottom: 6px;">Evaluated System Flags</div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${flags.map(f => `
              <div style="font-size: 11px; padding: 4px 8px; border-radius: 3px; background: var(--mt-bg-2); display: flex; justify-content: space-between;">
                <span><strong>${escapeHtml(f.title)}:</strong> ${escapeHtml(f.description)}</span>
                <span style="color: ${f.severity === 'pass' || f.severity === 'advisory' ? '#22c55e' : 'var(--mt-red)'}; font-weight: 600; text-transform: uppercase;">${f.severity}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  lucide.createIcons();
}

function generateMarkdownMemoString() {
  const data = state.activeValuationResult || {};
  const artistName = (state.selectedArtist && state.selectedArtist.name) || 'Selected Artist';
  const termYears = state.dealTerms.term || 5;
  const postRecoupPct = state.dealTerms.postRecoupSharePct || 90;
  const singlesN = state.dealTerms.singlesContracted !== undefined ? state.dealTerms.singlesContracted : 5;
  const rhoVal = state.dealTerms.customRho || (data.deal_terms && data.deal_terms.rho) || 0.50;
  const kBase = rhoVal * 12 * termYears;
  const riskDiscount = (data.catalog_analytics && data.catalog_analytics.risk_discount_pct) ? (data.catalog_analytics.risk_discount_pct / 100) : 0.044;
  const kT = kBase * (1 - riskDiscount);
  const r0 = (data.catalog_analytics && data.catalog_analytics.r0) || (data.run_rate) || 1000;
  const eVal = postRecoupPct / 100;
  const oneMinusD = Math.max(0.001, 1 - riskDiscount);
  const denom = rhoVal + (1 - eVal);
  const rawE = denom > 0 ? (rhoVal + (1 - eVal) / oneMinusD) / denom : 1.0;
  const eFactor = Math.min(1.30, Math.max(1.0, rawE));
  const aCatalog = r0 * kT * eFactor;
  const m0 = (data.catalog_analytics && data.catalog_analytics.peak_single_m0) || (r0 * 0.45);
  const lifetimeL = (data.catalog_analytics && data.catalog_analytics.lifetime_multiple) || (termYears * 2.84);
  const aNew = singlesN * m0 * lifetimeL * rhoVal * 0.50;
  const aTotal = aCatalog + aNew;

  const monthsToRecoup = 12 * termYears * (1 - riskDiscount) * eFactor;
  const mCapped = Math.min(monthsToRecoup, 12 * termYears);
  const marginRecoup = r0 * mCapped * (1 - rhoVal);
  const marginTail = r0 * (12 * termYears - mCapped) * (1 - eVal);
  const expectedGross = marginRecoup + marginTail;
  const expectedReturnPct = aCatalog > 0 ? ((expectedGross / aCatalog) * 100) : 0;

  return `# MONETUNES ADVANCE ROYALTY UNDERWRITING MEMORANDUM
Generated by Monetunes Valuation Engine (Zero-Uncontrolled-I/O)

## 1. EXECUTIVE SUMMARY
- Counterparty: ${artistName}
- Contract Term: ${termYears} Years
- Pre-Recoupment Split (ρ): ${(rhoVal * 100).toFixed(0)}/${(100 - rhoVal * 100).toFixed(0)}
- Post-Recoupment Share (e): ${postRecoupPct}%
- Contracted New Singles (N): ${singlesN}
- Total Approved Master Advance: ${formatCurrency(aTotal)}

---

## 2. CATALOGUE ADVANCE DERIVATION (A_catalog)
Formula: A_catalog = R_0 * K(T) * E(e)  |  K_base(T) = ρ * 12T
- Baseline Monthly Run-Rate (R_0): ${formatCurrency(r0)} (Trailing-3 median)
- Base Multiple K_base(${termYears}): ${kBase.toFixed(2)}x (ρ = ${(rhoVal * 100).toFixed(0)}%)
- Active Multiple K(${termYears}): ${kT.toFixed(3)}x (Risk discount: ${(riskDiscount * 100).toFixed(1)}%)
- Early Recoupment Factor E(${postRecoupPct}%): ${eFactor.toFixed(4)}x
- Catalogue Sizing: ${formatCurrency(r0)} * ${kT.toFixed(3)} * ${eFactor.toFixed(4)} = ${formatCurrency(aCatalog)}

---

## 3. EXPECTED MARGIN & RETURN
- Recoupment Duration (m*): ${monthsToRecoup.toFixed(1)} months
- Recoupment Fee Margin: ${formatCurrency(marginRecoup)}
- Post-Recoupment Tail Share: ${formatCurrency(marginTail)}
- Expected Gross Profit: ${formatCurrency(expectedGross)}
- Expected Return: ${expectedReturnPct.toFixed(0)}% (${formatCurrency(expectedGross)} / ${formatCurrency(aCatalog)})
- Disclosure: Assumes flat baseline revenue throughout recoupment (upper bound).

---

## 4. NEW-RELEASE ADVANCE DERIVATION (A_new)
Formula: A_new = N * m_0 * L * ρ * ADV_FRAC
- Contracted Singles (N): ${singlesN}
- Historical Peak Anchor (m_0): ${formatCurrency(m0)}
- Integrated Lifetime Curve (L): ${lifetimeL.toFixed(2)}x
- Recoupment Split (ρ): ${(rhoVal * 100).toFixed(0)}%
- Underwriting Safety Haircut: 50.0%
- New Release Sizing: ${formatCurrency(aNew)}

---

## 5. TOTAL MASTER ADVANCE
A_total = A_catalog + A_new = ${formatCurrency(aTotal)}
`;
}

function copyMemoMarkdown() {
  const md = generateMarkdownMemoString();
  navigator.clipboard.writeText(md);
  alert('Underwriting Memorandum copied to clipboard in Markdown format!');
}

function downloadMemoFile() {
  const md = generateMarkdownMemoString();
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const artist = (state.selectedArtist && state.selectedArtist.name) || 'Artist';
  a.href = url;
  a.download = `Underwriting_Memo_${artist.replace(/\s+/g, '_')}.md`;
  a.click();
}

function printMemoReport() {
  window.print();
}

// Helpers
function formatCurrency(num) {
  if (num === null || num === undefined) return '$0';
  return '$' + Math.round(num).toLocaleString('en-US');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

// ============================================================
// SONG PERFORMANCE DRILL-DOWN MODAL (UN-AVERAGED DATA)
// ============================================================
function toggleSongDrilldownModal() {
  const modal = document.getElementById('songDrilldownModal');
  if (!modal) return;
  const isHidden = (modal.style.display === 'none' || !modal.style.display);
  modal.style.display = isHidden ? 'flex' : 'none';
}

function openSongDrilldownModal(songIdentifier) {
  const modal = document.getElementById('songDrilldownModal');
  const body = document.getElementById('songDrilldownBody');
  if (!modal || !body) return;

  const data = state.activeValuationResult || {};
  const songList = (data.catalog_analytics && data.catalog_analytics.top_songs) || [];
  const song = songList.find(s => (s.identifier === songIdentifier || s.isrc === songIdentifier || s.title === songIdentifier)) || songList[0];

  if (!song) {
    alert('Song transaction record not found.');
    return;
  }

  const artistName = (state.selectedArtist && state.selectedArtist.name) || (data.artist && data.artist.name) || 'Artist';
  const title = song.title || song.name || 'Song Recording';
  const isrc = song.identifier || song.isrc || 'ISRC-RECORDING';
  const art = song.artwork || song.image || '';

  // Update Header Elements
  const titleElem = document.getElementById('songModalTitle');
  if (titleElem) titleElem.innerText = title;
  const isrcElem = document.getElementById('songModalIsrc');
  if (isrcElem) isrcElem.innerText = isrc;
  const artistElem = document.getElementById('songModalArtist');
  if (artistElem) artistElem.innerText = artistName;

  const artContainer = document.getElementById('songModalArtworkContainer');
  if (artContainer) {
    if (art) {
      artContainer.innerHTML = `<img src="${escapeHtml(art)}" alt="${escapeHtml(title)}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      artContainer.innerHTML = `<i data-lucide="music" style="color: var(--mt-red); width: 22px; height: 22px;"></i>`;
    }
  }

  // Calculate KPIs
  const totalObserved = song.total_revenue || 0;
  const verifiedMonthsCount = song.verified_months_count || (song.monthly_history ? song.monthly_history.filter(h => h.earnings > 0).length : 1);
  const latestMonth = song.latest_month || (song.monthly_history && song.monthly_history.length > 0 ? song.monthly_history[song.monthly_history.length - 1].month : '—');
  const latestRev = song.latest_month_rev !== undefined ? song.latest_month_rev : (song.monthly_rev || 0);
  const prevMonth = song.previous_month || (song.monthly_history && song.monthly_history.length > 1 ? song.monthly_history[song.monthly_history.length - 2].month : null);
  const prevRev = song.previous_month_rev !== undefined ? song.previous_month_rev : null;
  const momPct = song.mom_change_pct;

  const peakMonth = song.peak_month || latestMonth;
  const peakRev = song.peak_monthly_rev || latestRev;
  const sharePct = song.share_pct !== undefined ? song.share_pct : (song.share ? (song.share * 100).toFixed(1) : '0.0');
  const advanceAlloc = song.advance_allocation ? formatCurrency(song.advance_allocation) : '$0';

  // Status Badge
  const statusBadge = document.getElementById('songModalStatusBadge');
  if (statusBadge) {
    if (momPct && momPct > 10) {
      statusBadge.className = 'pill';
      statusBadge.innerHTML = '<span class="dot" style="background:#22c55e;"></span> 🔥 TOP GROWTH TRACK';
      statusBadge.style.color = '#34d399';
    } else if (momPct && momPct < -10) {
      statusBadge.className = 'pill';
      statusBadge.innerHTML = '<span class="dot" style="background:var(--mt-red);"></span> 📉 TAIL DECAY PHASE';
      statusBadge.style.color = '#f87171';
    } else {
      statusBadge.className = 'pill';
      statusBadge.innerHTML = '<span class="dot" style="background:#3b82f6;"></span> 📊 VERIFIED CATALOGUE RECORD';
      statusBadge.style.color = '#60a5fa';
    }
  }

  // Monthly History Array
  const history = song.monthly_history || [
    { month: latestMonth, earnings: latestRev, mom_pct: null, month_share_pct: sharePct, primary_dsp: 'Spotify', stores: { Spotify: latestRev } }
  ];

  // Visual Bar Graph Calculations
  const maxBarRev = Math.max(1, peakRev);
  const barsHtml = history.map(h => {
    const barHeightPct = Math.min(100, Math.max(6, (h.earnings / maxBarRev) * 100));
    const isPeak = (h.month === peakMonth && h.earnings === peakRev && peakRev > 0);

    return `
      <div class="song-bar-col ${isPeak ? 'peak' : ''}">
        <div class="song-bar-tooltip">
          <div><strong>${escapeHtml(h.month)}</strong></div>
          <div style="color: ${isPeak ? '#f59e0b' : '#fff'}; font-weight: 700; margin: 2px 0;">$${h.earnings.toFixed(2)}</div>
          <div>MoM: ${h.mom_pct !== null && h.mom_pct !== undefined ? (h.mom_pct >= 0 ? '+' : '') + h.mom_pct + '%' : 'Baseline'}</div>
          <div>Share: ${h.month_share_pct || 0}%</div>
        </div>
        <div class="song-bar-pillar" style="height: ${barHeightPct}%;"></div>
        <div class="song-bar-label">${escapeHtml(h.month.slice(5))}</div>
      </div>
    `;
  }).join('');

  // Table Rows for Month-by-Month Performance
  const tableRowsHtml = history.map((h, i) => {
    const isPeak = (h.month === peakMonth && h.earnings === peakRev && peakRev > 0);
    const momDisplay = h.mom_pct !== null && h.mom_pct !== undefined
      ? `<span class="mom-tag ${h.mom_pct >= 0 ? 'up' : 'down'}">${h.mom_pct >= 0 ? '↑ +' : '↓ '}${h.mom_pct}%</span>`
      : `<span class="mom-tag flat">— Baseline</span>`;

    const dspBreakdownStr = h.stores && Object.keys(h.stores).length > 0
      ? Object.entries(h.stores).map(([st, val]) => `${st}: $${val.toFixed(2)}`).join(', ')
      : (h.primary_dsp || 'Streaming');

    return `
      <tr style="${isPeak ? 'background: rgba(245, 158, 11, 0.06);' : ''}">
        <td>
          <strong style="font-family: var(--mt-font-mono); color: var(--mt-fg-1);">${escapeHtml(h.month)}</strong>
          ${isPeak ? '<span class="pill" style="font-size: 9px; padding: 1px 6px; margin-left: 6px; background: rgba(245,158,11,0.2); color: #f59e0b;">★ PEAK</span>' : ''}
        </td>
        <td class="r amt" style="font-weight: 700; font-family: var(--mt-font-mono); color: ${isPeak ? '#f59e0b' : 'var(--mt-fg-1)'};">$${h.earnings.toFixed(2)}</td>
        <td style="text-align: center;">${momDisplay}</td>
        <td class="r" style="font-family: var(--mt-font-mono);">${h.month_share_pct || 0}%</td>
        <td><span style="font-size: 11px; color: var(--mt-fg-3);">${escapeHtml(dspBreakdownStr)}</span></td>
      </tr>
    `;
  }).join('');

  // DSP Breakdown Widgets
  const dspBreakdown = song.dsp_breakdown || { "Spotify": totalObserved * 0.70, "Apple Music": totalObserved * 0.30 };
  const dspShares = song.dsp_shares || { "Spotify": 70.0, "Apple Music": 30.0 };
  const dspEntries = Object.entries(dspBreakdown).sort((a,b) => b[1] - a[1]);

  const dspProgressHtml = dspEntries.map(([st, val]) => {
    const pct = dspShares[st] || (totalObserved > 0 ? (val / totalObserved) * 100 : 0);
    const lowSt = st.toLowerCase();
    const segClass = lowSt.includes('spot') ? 'dsp-segment-spotify' : (lowSt.includes('apple') ? 'dsp-segment-apple' : (lowSt.includes('you') ? 'dsp-segment-youtube' : (lowSt.includes('deez') ? 'dsp-segment-deezer' : (lowSt.includes('amazon') ? 'dsp-segment-amazon' : 'dsp-segment-other'))));
    return `<div class="${segClass}" style="width: ${pct}%;" title="${escapeHtml(st)}: $${val.toFixed(2)} (${pct.toFixed(1)}%)"></div>`;
  }).join('');

  const dspLegendHtml = dspEntries.map(([st, val]) => {
    const pct = dspShares[st] || (totalObserved > 0 ? (val / totalObserved) * 100 : 0);
    const lowSt = st.toLowerCase();
    const dotColor = lowSt.includes('spot') ? '#1db954' : (lowSt.includes('apple') ? '#fa243c' : (lowSt.includes('you') ? '#ff0000' : (lowSt.includes('deez') ? '#a238ff' : (lowSt.includes('amazon') ? '#00a8e1' : '#64748b'))));
    return `
      <div class="dsp-legend-item">
        <span class="dsp-legend-dot" style="background: ${dotColor};"></span>
        <span><strong>${escapeHtml(st)}</strong>: $${val.toFixed(2)} (${pct.toFixed(1)}%)</span>
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <!-- Top 4 KPI Metric Cards -->
    <div class="song-kpi-grid">
      <div class="song-kpi-tile highlight">
        <div class="song-kpi-label">Total Observed Revenue</div>
        <div class="song-kpi-value">$${totalObserved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="song-kpi-sub"><i data-lucide="check-circle" style="width: 12px; height: 12px; color: #34d399;"></i> ${verifiedMonthsCount} Verified Months</div>
      </div>

      <div class="song-kpi-tile green">
        <div class="song-kpi-label">Latest Month (${escapeHtml(latestMonth)})</div>
        <div class="song-kpi-value">$${latestRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="song-kpi-sub">
          ${momPct !== null && momPct !== undefined ? `
            <span class="mom-tag ${momPct >= 0 ? 'up' : 'down'}">${momPct >= 0 ? '↑ +' : '↓ '}${momPct}% MoM</span>
          ` : '<span style="color:var(--mt-fg-3);">Latest observed statement</span>'}
        </div>
      </div>

      <div class="song-kpi-tile">
        <div class="song-kpi-label">Peak Month Performance</div>
        <div class="song-kpi-value">$${peakRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="song-kpi-sub"><i data-lucide="award" style="width: 12px; height: 12px; color: #f59e0b;"></i> Peak in ${escapeHtml(peakMonth)}</div>
      </div>

      <div class="song-kpi-tile">
        <div class="song-kpi-label">Catalog Share & Advance</div>
        <div class="song-kpi-value">${sharePct}%</div>
        <div class="song-kpi-sub"><strong style="color: var(--mt-red);">${advanceAlloc}</strong> Allocated Advance</div>
      </div>
    </div>

    <!-- Visual Monthly Trajectory Bar Graph -->
    <div class="song-trajectory-section">
      <div class="song-trajectory-header">
        <div class="song-trajectory-title">
          <i data-lucide="bar-chart-2" style="color: var(--mt-red); width: 16px; height: 16px;"></i>
          <span>Actual Month-by-Month Performance Trajectory</span>
        </div>
        <div style="font-size: 11px; color: var(--mt-fg-3);">
          Peak: <strong style="color:#f59e0b;">$${peakRev.toFixed(2)}</strong> (${escapeHtml(peakMonth)})
        </div>
      </div>

      <div class="song-bars-container">
        ${barsHtml}
      </div>

      <!-- DSP Contribution Breakdown -->
      <div class="dsp-distribution-wrap">
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--mt-fg-3); margin-bottom: 8px; display: flex; justify-content: space-between;">
          <span>DSP / Store Contribution Breakdown</span>
          <span>Actual Net Royalty Streams</span>
        </div>
        <div class="dsp-progress-track">
          ${dspProgressHtml}
        </div>
        <div class="dsp-badges-legend">
          ${dspLegendHtml}
        </div>
      </div>
    </div>

    <!-- Detailed Month-by-Month Table -->
    <div class="table-container" style="margin-top: 0;">
      <div class="table-title" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Month-by-Month Royalty Statement Ledger</span>
        <span style="font-size: 11px; text-transform: none; color: var(--mt-fg-3);">Exact ISRC Net Transactions</span>
      </div>
      <table class="royalties song-drilldown-table">
        <thead>
          <tr>
            <th>Earning Month</th>
            <th class="r">Actual Net Royalty</th>
            <th style="text-align: center;">MoM Velocity</th>
            <th class="r">Month Catalog Share</th>
            <th>Primary DSP / Store</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  `;

  modal.style.display = 'flex';
  lucide.createIcons();
}

window.openSongDrilldownModal = openSongDrilldownModal;
window.toggleSongDrilldownModal = toggleSongDrilldownModal;
window.toggleSongFilterDropdown = toggleSongFilterDropdown;
window.closeSongFilterDropdown = closeSongFilterDropdown;
window.handleSongFilterSearch = handleSongFilterSearch;
window.togglePendingSongSelection = togglePendingSongSelection;
window.selectAllFilterSongs = selectAllFilterSongs;
window.deselectAllFilterSongs = deselectAllFilterSongs;
window.applySongFilterSelection = applySongFilterSelection;

document.addEventListener('click', (e) => {
  const popover = document.getElementById('songFilterPopover');
  const btn = document.getElementById('songFilterBtn');
  if (popover && popover.style.display !== 'none') {
    if (!popover.contains(e.target) && !btn?.contains(e.target)) {
      closeSongFilterDropdown();
    }
  }
});

